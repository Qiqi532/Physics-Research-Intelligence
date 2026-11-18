import "dotenv/config";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { createConfiguredDailyProcessor } from "./configured-daily-processor";
import { createDailyQueue, createDailyWorker } from "./queue";
import { startWorkerRuntime } from "./worker-runtime";
import { createStructuredLogger, runLoggedOperation } from "./logging";
import { RuntimeAiConfigError } from "./runtime-ai-config";

const log = createStructuredLogger();

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  let dailyProcessor: ReturnType<typeof createConfiguredDailyProcessor> | undefined;
  const redisUrl = () => {
    if (!config.REDIS_URL) {
      throw new Error("Missing required environment variable: REDIS_URL");
    }
    return config.REDIS_URL;
  };
  const runtime = await startWorkerRuntime({
    mode: config.RUNTIME_MODE,
    createQueue: () => createDailyQueue(redisUrl()),
    schedule: config.DAILY_PIPELINE,
    createWorker: (processor) => createDailyWorker(
      redisUrl(),
      processor,
      (error) => log({
        event: "worker.queue.error",
        status: "failed",
        errorCode: "redis_worker_error",
        details: { REDIS_URL: config.REDIS_URL, error },
      }),
    ),
    processDaily: () => runLoggedOperation({
      event: "worker.daily",
      errorCode: (error) => error instanceof RuntimeAiConfigError
        ? error.code
        : "daily_pipeline_failed",
      logger: log,
      operation: () => {
        dailyProcessor ??= createConfiguredDailyProcessor(config);
        return dailyProcessor.process();
      },
    }),
  });
  log({ event: "worker.started", status: config.RUNTIME_MODE === "local" ? "skipped" : "ready", details: {
    status: config.RUNTIME_MODE === "local" ? "disabled" : "ready",
    runtimeMode: config.RUNTIME_MODE,
    dailyPipelineEnabled: config.DAILY_PIPELINE.enabled,
    scheduleTime: config.DAILY_PIPELINE.time,
    scheduleTimezone: config.DAILY_PIPELINE.timezone,
  } });
  if (config.RUNTIME_MODE === "local") return;

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      await runtime.close();
    } finally {
      await dailyProcessor?.close();
    }
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

main().catch((error) => {
  log({
    event: "worker.configuration",
    status: "failed",
    errorCode: "worker_configuration_error",
    details: { error: toLogSafeData(error) },
  });
  process.exitCode = 1;
});
