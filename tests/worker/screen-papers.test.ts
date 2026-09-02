import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src";
import type { ScreeningResultInput } from "../../packages/db/src";
import { screenPapers } from "../../apps/worker/src/jobs/screen-papers";

const window = {
  from: new Date("2026-08-30T22:00:00.000Z"),
  until: new Date("2026-08-31T22:00:00.000Z"),
};

function paper(id: string, journal: string) {
  return {
    id,
    title: `Paper ${id}`,
    abstract: `Abstract for ${id}.`,
    journal,
    publishedAt: new Date("2026-08-31T00:00:00.000Z"),
    accessStatus: "UNKNOWN" as const,
  };
}

function repository(overrides: Partial<{
  listPapersForScreening: ReturnType<typeof vi.fn>;
  findSuccessfulRun: ReturnType<typeof vi.fn>;
  claimRun: ReturnType<typeof vi.fn>;
  appendAttempts: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  failRun: ReturnType<typeof vi.fn>;
  saveScreeningResults: ReturnType<typeof vi.fn>;
  replaceClassifications: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    listPapersForScreening: overrides.listPapersForScreening ?? vi.fn().mockResolvedValue([]),
    findSuccessfulRun: overrides.findSuccessfulRun ?? vi.fn().mockResolvedValue(null),
    claimRun: overrides.claimRun ?? vi.fn().mockResolvedValue({
      status: "claimed",
      run: { id: "run-1" },
    }),
    appendAttempts: overrides.appendAttempts ?? vi.fn().mockResolvedValue(undefined),
    completeRun: overrides.completeRun ?? vi.fn().mockResolvedValue(undefined),
    failRun: overrides.failRun ?? vi.fn().mockResolvedValue(undefined),
    saveScreeningResults: overrides.saveScreeningResults ?? vi.fn().mockResolvedValue(undefined),
    replaceClassifications: overrides.replaceClassifications ?? vi.fn().mockResolvedValue(undefined),
  };
}

describe("screenPapers", () => {
  it("returns zero counts when no papers need screening", async () => {
    const repo = repository();
    const provider = createMockAiProvider();

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
    });

    expect(result).toEqual({
      status: "complete",
      screened: 0,
      selected: 0,
      batches: 0,
      failures: [],
    });
  });

  it("filters out papers from non-whitelisted journals without calling the LLM", async () => {
    const repo = repository({
      listPapersForScreening: vi.fn().mockResolvedValue([
        paper("p-1", "Nature"),
        paper("p-2", "Journal of Random Results"),
        paper("p-3", "Physical Review Letters"),
        paper("p-4", "arXiv preprint"),
      ]),
    });
    const provider = createMockAiProvider({
      screenBatch: {
        output: {
          papers: [
            { paperId: "p-1", score: 0.9, directionSlug: "amo-optics", reason: "好", selected: true },
            { paperId: "p-3", score: 0.8, directionSlug: "amo-optics", reason: "好", selected: true },
          ],
        },
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 100,
      },
    });

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
    });

    expect(result.screened).toBe(2);
    expect(result.selected).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.failures).toEqual([]);
    expect(repo.saveScreeningResults).toHaveBeenCalledOnce();
    const saved = repo.saveScreeningResults.mock.calls[0]![0] as {
      results: ScreeningResultInput[];
    };
    expect(saved.results).toHaveLength(2);
    expect(saved.results.map((r) => r.paperId)).toEqual(["p-1", "p-3"]);
  });

  it("splits papers into batches of the configured size", async () => {
    const papers = Array.from({ length: 25 }, (_, i) =>
      paper(`p-${i}`, "Nature"),
    );
    const repo = repository({
      listPapersForScreening: vi.fn().mockResolvedValue(papers),
    });
    const provider = createMockAiProvider({
      screenBatch: {
        output: {
          papers: papers.slice(0, 15).map((p) => ({
            paperId: p.id,
            score: 0.7,
            directionSlug: "amo-optics",
            reason: "ok",
            selected: true,
          })),
        },
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 100,
      },
    });

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
    });

    expect(result.batches).toBe(2);
    expect(result.screened).toBe(25);
  });

  it("records a batch failure but continues with other batches", async () => {
    const papers = Array.from({ length: 30 }, (_, i) =>
      paper(`p-${i}`, "Nature"),
    );
    const provider = createMockAiProvider();
    provider.screenBatch = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue({
        provider: "mock",
        model: "mock-model",
        output: {
          papers: papers.slice(15).map((p) => ({
            paperId: p.id,
            score: 0.7,
            directionSlug: "amo-optics",
            reason: "ok",
            selected: true,
          })),
        },
        durationMs: 100,
      });
    const repo = repository({
      listPapersForScreening: vi.fn().mockResolvedValue(papers),
    });

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
    });

    expect(result.batches).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.batchIndex).toBe(0);
    expect(result.selected).toBe(15);
    expect(repo.failRun).toHaveBeenCalledTimes(1);
    expect(repo.completeRun).toHaveBeenCalledTimes(1);
  });

  it("skips batches that already have a successful run (idempotent)", async () => {
    const papers = Array.from({ length: 5 }, (_, i) =>
      paper(`p-${i}`, "Nature"),
    );
    const repo = repository({
      listPapersForScreening: vi.fn().mockResolvedValue(papers),
      findSuccessfulRun: vi.fn().mockResolvedValue({ id: "existing-run" }),
    });
    const provider = createMockAiProvider();
    const screenSpy = vi.fn();
    provider.screenBatch = screenSpy;

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
    });

    expect(result.batches).toBe(1);
    expect(result.screened).toBe(5);
    expect(screenSpy).not.toHaveBeenCalled();
    expect(repo.claimRun).not.toHaveBeenCalled();
  });

  it("rejects a non-positive batch size before querying papers", async () => {
    const repo = repository();

    await expect(screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 0,
      repository: repo,
      primary: createMockAiProvider(),
    })).rejects.toThrow("screen_batch_size_invalid");

    expect(repo.listPapersForScreening).not.toHaveBeenCalled();
  });

  it("includes the paper set in the batch idempotency key", async () => {
    async function claimedKeyFor(paperId: string): Promise<string> {
      const repo = repository({
        listPapersForScreening: vi.fn().mockResolvedValue([
          paper(paperId, "Nature"),
        ]),
      });
      const provider = createMockAiProvider({
        screenBatch: {
          output: {
            papers: [{
              paperId,
              score: 0.8,
              directionSlug: "amo-optics",
              reason: "relevant",
              selected: true,
            }],
          },
          inputTokens: 10,
          outputTokens: 10,
          durationMs: 1,
        },
      });

      await screenPapers({
        from: window.from,
        until: window.until,
        limit: 100,
        batchSize: 15,
        repository: repo,
        primary: provider,
      });

      return repo.claimRun.mock.calls[0]![0].idempotencyKey as string;
    }

    expect(await claimedKeyFor("paper-a"))
      .not.toBe(await claimedKeyFor("paper-b"));
  });

  it("fails a batch when the provider omits an input paper", async () => {
    const repo = repository({
      listPapersForScreening: vi.fn().mockResolvedValue([
        paper("p-1", "Nature"),
        paper("p-2", "Nature"),
      ]),
    });
    const provider = createMockAiProvider({
      screenBatch: {
        output: {
          papers: [{
            paperId: "p-1",
            score: 0.8,
            directionSlug: "amo-optics",
            reason: "relevant",
            selected: true,
          }],
        },
        inputTokens: 10,
        outputTokens: 10,
        durationMs: 1,
      },
    });

    const result = await screenPapers({
      from: window.from,
      until: window.until,
      limit: 100,
      batchSize: 15,
      repository: repo,
      primary: provider,
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });

    expect(result.failures).toEqual([
      { batchIndex: 0, errorCode: "business_validation" },
    ]);
    expect(result.selected).toBe(0);
    expect(repo.saveScreeningResults).not.toHaveBeenCalled();
    expect(repo.replaceClassifications).not.toHaveBeenCalled();
    expect(repo.completeRun).not.toHaveBeenCalled();
    expect(repo.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      errorCode: "business_validation",
      completedAt: new Date("2026-09-02T00:00:00.000Z"),
    });
  });
});
