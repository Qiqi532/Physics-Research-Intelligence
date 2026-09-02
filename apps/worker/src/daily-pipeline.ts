import type { DailyWindow } from "./scheduler";

type InterpretationStatus = "complete" | "duplicate" | "in_progress" | "failed";

type ScreeningOutcome = {
  status: "complete";
  /** Papers that passed journal filtering and were sent to LLM screening. */
  screened: number;
  /** Papers marked selected by the LLM. */
  selected: number;
  /** Number of batches processed. */
  batches: number;
  /** Per-batch failures (does not stop other batches). */
  failures: Array<{ batchIndex: number; errorCode: string }>;
};

type DailyPipelineDependencies = {
  window: DailyWindow;
  ingest(window: DailyWindow): Promise<
    | { status: "complete" | "duplicate"; records: number }
    | { status: "failed"; errorCode: string }
  >;
  /**
   * Stage 1+2: deterministic journal filter then batch LLM screening.
   * Returns aggregate counts rather than per-paper status.
   */
  screen(window: DailyWindow): Promise<ScreeningOutcome>;
  listInterpretationPaperIds(window: DailyWindow): Promise<string[]>;
  interpret(paperId: string): Promise<InterpretationStatus>;
  prepareToday(window: DailyWindow): Promise<{ recommendations: number }>;
  pruneExpired(window: DailyWindow): Promise<
    | { status: "ok"; deleted: number }
    | { status: "failed"; errorCode: string }
  >;
};

export type DailyPipelineResult = {
  windowKey: string;
  ingestedRecords: number;
  screening: {
    screened: number;
    selected: number;
    batches: number;
    failedBatches: number;
  };
  interpretation: {
    complete: number;
    duplicate: number;
    failed: number;
    inProgress: number;
  };
  recommendations: number;
  cleanup: { status: "ok"; deleted: number } | { status: "failed"; errorCode: string };
};

export async function runDailyPipeline(
  dependencies: DailyPipelineDependencies,
): Promise<DailyPipelineResult> {
  const ingestion = await dependencies.ingest(dependencies.window);
  if (ingestion.status === "failed") {
    throw new Error("daily_ingestion_failed");
  }

  // Stage 1+2: journal quality filter + batch LLM screening.
  const screening = await dependencies.screen(dependencies.window);

  const interpretationPaperIds = await dependencies.listInterpretationPaperIds(
    dependencies.window,
  );
  const interpretation = {
    complete: 0,
    duplicate: 0,
    failed: 0,
    inProgress: 0,
  };
  for (const paperId of interpretationPaperIds) {
    try {
      const status = await dependencies.interpret(paperId);
      if (status === "in_progress") {
        interpretation.inProgress += 1;
      } else {
        interpretation[status] += 1;
      }
    } catch {
      interpretation.failed += 1;
    }
  }
  const today = await dependencies.prepareToday(dependencies.window);
  let cleanup: DailyPipelineResult["cleanup"];
  try {
    cleanup = await dependencies.pruneExpired(dependencies.window);
  } catch {
    cleanup = { status: "failed", errorCode: "retention_cleanup_failed" };
  }
  return {
    windowKey: dependencies.window.key,
    ingestedRecords: ingestion.records,
    screening: {
      screened: screening.screened,
      selected: screening.selected,
      batches: screening.batches,
      failedBatches: screening.failures.length,
    },
    interpretation,
    recommendations: today.recommendations,
    cleanup,
  };
}
