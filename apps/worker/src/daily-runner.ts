import { parseConfig, type ServerConfig } from "@pri/domain/config";
import type { DailyPipelineResult } from "./daily-pipeline";
import { createStructuredLogger, type LogEvent } from "./logging";

type DailyProcessor = {
  process(): Promise<DailyPipelineResult>;
  close(): Promise<unknown>;
};

export async function runDailyOnce(input: {
  environment: NodeJS.ProcessEnv;
  createProcessor(config: ServerConfig): DailyProcessor;
  logger?: (event: LogEvent) => void;
  now?: () => Date;
}): Promise<0 | 1> {
  const log = input.logger ?? createStructuredLogger();
  const now = input.now ?? (() => new Date());
  const startedAt = now().getTime();
  let processor: DailyProcessor | undefined;
  let result: DailyPipelineResult | undefined;
  let errorCode: string | undefined;
  let phase = "configuration";

  log({ event: "daily.run", status: "running" });
  try {
    const config = parseConfig(input.environment);
    phase = "initialization";
    processor = input.createProcessor(config);
    phase = "pipeline";
    result = await processor.process();
    if ((!result.report && (result.screening.failedBatches > 0 || result.interpretation.failed > 0 ||
        result.interpretation.inProgress > 0)) || result.cleanup.status === "failed") {
      errorCode = "daily_pipeline_partial";
    }
  } catch (error) {
    // Provider errors can contain credentials loaded from the database; log codes only.
    const known = new Set(["all_sources_failed", "screening_incomplete", "interpretation_incomplete",
      "daily_already_running", "daily_lock_lost", "model_configuration_unavailable", "daily_publish_failed"]);
    errorCode = error instanceof Error && known.has(error.message) ? error.message : phase === "configuration"
      ? "daily_configuration_invalid"
      : phase === "initialization" ? "daily_initialization_failed" : "daily_pipeline_failed";
  } finally {
    try {
      await processor?.close();
    } catch {
      errorCode = "daily_close_failed";
    }
  }

  log({
    event: "daily.run",
    status: errorCode ? "failed" : "complete",
    ...(errorCode ? { errorCode } : {}),
    details: {
      durationMs: now().getTime() - startedAt,
      ...(result ? { result } : {}),
    },
  });
  return errorCode ? 1 : 0;
}
