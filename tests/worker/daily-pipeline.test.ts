import { describe, expect, it, vi } from "vitest";
import { runDailyPipeline } from "../../apps/worker/src/daily-pipeline";

const window = {
  key: "2026-08-30",
  from: new Date("2026-08-29T06:00:00.000Z"),
  until: new Date("2026-08-30T06:00:00.000Z"),
};

describe("daily pipeline", () => {
  it("runs public ingestion, classification, interpretation and Today preparation in order", async () => {
    const events: string[] = [];
    const result = await runDailyPipeline({
      window,
      ingest: vi.fn(async (input) => {
        events.push(`ingest:${input.key}`);
        return { status: "complete", records: 3 };
      }),
      listPaperIds: vi.fn(async (input) => {
        events.push(`list:${input.key}`);
        return ["paper-1", "paper-2"];
      }),
      classify: vi.fn(async (paperId) => {
        events.push(`classify:${paperId}`);
        return paperId === "paper-1" ? "complete" : "duplicate";
      }),
      listInterpretationPaperIds: vi.fn(async (input) => {
        events.push(`list-interpret:${input.key}`);
        return ["paper-1"];
      }),
      interpret: vi.fn(async (paperId) => {
        events.push(`interpret:${paperId}`);
        return "complete";
      }),
      prepareToday: vi.fn(async (input) => {
        events.push(`today:${input.key}`);
        return { recommendations: 2 };
      }),
    });

    expect(events).toEqual([
      "ingest:2026-08-30",
      "list:2026-08-30",
      "classify:paper-1",
      "classify:paper-2",
      "list-interpret:2026-08-30",
      "interpret:paper-1",
      "today:2026-08-30",
    ]);
    expect(result).toEqual({
      windowKey: "2026-08-30",
      ingestedRecords: 3,
      classification: { complete: 1, duplicate: 1, failed: 0, inProgress: 0 },
      interpretation: {
        complete: 1,
        duplicate: 0,
        failed: 0,
        inProgress: 0,
        skippedBudget: 0,
      },
      recommendations: 2,
    });
  });

  it("does not classify or prepare Today when ingestion cannot safely complete", async () => {
    const listPaperIds = vi.fn();
    const prepareToday = vi.fn();

    await expect(runDailyPipeline({
      window,
      ingest: vi.fn().mockResolvedValue({ status: "failed", errorCode: "source_failed" }),
      listPaperIds,
      classify: vi.fn(),
      listInterpretationPaperIds: vi.fn(),
      interpret: vi.fn(),
      prepareToday,
    })).rejects.toThrow("daily_ingestion_failed");

    expect(listPaperIds).not.toHaveBeenCalled();
    expect(prepareToday).not.toHaveBeenCalled();
  });

  it("isolates one classification failure and still prepares Today", async () => {
    const prepareToday = vi.fn().mockResolvedValue({ recommendations: 1 });

    const result = await runDailyPipeline({
      window,
      ingest: vi.fn().mockResolvedValue({ status: "duplicate", records: 0 }),
      listPaperIds: vi.fn().mockResolvedValue(["paper-1", "paper-2"]),
      classify: vi.fn()
        .mockRejectedValueOnce(new Error("provider unavailable"))
        .mockResolvedValueOnce("in_progress"),
      listInterpretationPaperIds: vi.fn().mockResolvedValue([]),
      interpret: vi.fn(),
      prepareToday,
    });

    expect(result.classification).toEqual({
      complete: 0,
      duplicate: 0,
      failed: 1,
      inProgress: 1,
    });
    expect(prepareToday).toHaveBeenCalledOnce();
  });

  it("isolates interpretation failures and records budget exhaustion before Today", async () => {
    const prepareToday = vi.fn().mockResolvedValue({ recommendations: 1 });
    const result = await runDailyPipeline({
      window,
      ingest: vi.fn().mockResolvedValue({ status: "duplicate", records: 0 }),
      listPaperIds: vi.fn().mockResolvedValue([]),
      classify: vi.fn(),
      listInterpretationPaperIds: vi.fn().mockResolvedValue([
        "paper-1",
        "paper-2",
        "paper-3",
      ]),
      interpret: vi.fn()
        .mockResolvedValueOnce("complete")
        .mockResolvedValueOnce("skipped")
        .mockRejectedValueOnce(new Error("provider unavailable")),
      prepareToday,
    });

    expect(result.interpretation).toEqual({
      complete: 1,
      duplicate: 0,
      failed: 1,
      inProgress: 0,
      skippedBudget: 1,
    });
    expect(prepareToday).toHaveBeenCalledOnce();
  });
});
