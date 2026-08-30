import "dotenv/config";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { createConfiguredDailyProcessor } from "./configured-daily-processor";
import { createDailyQueue, createDailyWorker } from "./queue";
import { startWorkerRuntime } from "./worker-runtime";
import { createStructuredLogger, runLoggedOperation } from "./logging";

const log = createStructuredLogger();

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const dailyProcessor = config.DAILY_PIPELINE.enabled
    ? createConfiguredDailyProcessor(config)
    : undefined;
  const runtime = await startWorkerRuntime({
    queue: createDailyQueue(config.REDIS_URL),
    schedule: config.DAILY_PIPELINE,
    createWorker: (processor) => createDailyWorker(
      config.REDIS_URL,
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
      errorCode: "daily_pipeline_failed",
      logger: log,
      operation: () => dailyProcessor!.process(),
    }),
  });
  log({ event: "worker.started", status: "ready", details: {
    status: "ready",
    dailyPipelineEnabled: config.DAILY_PIPELINE.enabled,
    scheduleTime: config.DAILY_PIPELINE.time,
    scheduleTimezone: config.DAILY_PIPELINE.timezone,
  } });

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
    await dailyProcessor?.close();
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
