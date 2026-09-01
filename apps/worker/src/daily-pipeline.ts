import type { DailyWindow } from "./scheduler";

type ClassificationStatus = "complete" | "duplicate" | "in_progress" | "failed";
type InterpretationStatus = ClassificationStatus;

type DailyPipelineDependencies = {
  window: DailyWindow;
  ingest(window: DailyWindow): Promise<
    | { status: "complete" | "duplicate"; records: number }
    | { status: "failed"; errorCode: string }
  >;
  listPaperIds(window: DailyWindow): Promise<string[]>;
  classify(paperId: string): Promise<ClassificationStatus>;
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
  classification: {
    complete: number;
    duplicate: number;
    failed: number;
    inProgress: number;
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
  const paperIds = await dependencies.listPaperIds(dependencies.window);
  const classification = {
    complete: 0,
    duplicate: 0,
    failed: 0,
    inProgress: 0,
  };
  for (const paperId of paperIds) {
    try {
      const status = await dependencies.classify(paperId);
      if (status === "in_progress") {
        classification.inProgress += 1;
      } else {
        classification[status] += 1;
      }
    } catch {
      classification.failed += 1;
    }
  }
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
    classification,
    interpretation,
    recommendations: today.recommendations,
    cleanup,
  };
}
