import { describe, expect, it, vi } from "vitest";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";
import { runResearchDaily, dailyExecutionKey, type DailyCandidate, type ResearchDailyDependencies } from "../../apps/worker/src/research-daily";
import type { DailyReportSnapshot } from "../../packages/domain/src/daily-report";

const research = loadResearchProfile();
const paper: DailyCandidate = { id: "11111111-1111-4111-8111-111111111111", doi: null,
  title: "Retinomorphic vision sensor", abstract: "A retinomorphic sensor processes visual signals.", journal: "arXiv",
  publishedAt: "2026-11-12T00:00:00.000Z", createdAt: "2026-11-13T00:00:00.000Z", originalUrl: "https://arxiv.org/abs/2611.00001",
  accessStatus: "OPEN", sourceName: "arxiv" };
const claim = { text: "传感器处理视觉信号", evidenceLevel: "direct", evidenceReferences: [
  { source: "abstract", locator: "abstract", quote: "retinomorphic sensor" } ] };
const interpretation = { provider: "mock", model: "m1", promptVersion: "interpret-v2", inputHash: "input",
  content: { basis: "abstract_only", sourceDisclosure: "基于摘要解读", overviewZh: claim, researchQuestion: claim,
    innovations: [claim], methodsAndEvidence: [claim], limitations: [{ ...claim, evidenceLevel: "uncertain" }], readingAdvice: ["先读摘要"] } };

function fixture() {
  let checkpoint: Record<string, unknown> = {};
  let report: { snapshot: DailyReportSnapshot } | null = null;
  const store = {
    open: vi.fn(async () => ({ id: "run", checkpoint: structuredClone(checkpoint), report })),
    checkpoint: vi.fn(async (_id: string, _stage: string, next: Record<string, unknown>) => { checkpoint = structuredClone(next); }),
    fail: vi.fn(async () => undefined),
    publish: vi.fn(async (_id: string, snapshot: DailyReportSnapshot) => { report ??= { snapshot: structuredClone(snapshot) }; return report; }),
  };
  const deps = {
    window: { key: "2026-11-13", from: new Date("2026-10-14T04:15:00Z"), until: new Date("2026-11-13T04:15:00Z") },
    research, executionVersion: "v1", store,
    ingest: vi.fn(async () => [{ name: "arxiv", status: "complete", records: 1 }]),
    candidates: vi.fn(async () => [paper]),
    screen: vi.fn(async () => ({ status: "complete", screened: 1, selected: 1, batches: 1, failures: [], batchIds: ["batch"] })),
    screeningResults: vi.fn(async () => [{ paperId: paper.id, selected: true, score: 0.9, reason: "相关", evidenceSource: "abstract",
      evidenceQuote: "retinomorphic sensor", provider: "mock", model: "m1", promptVersion: "screen-v3", inputHash: "input" }]),
    interpret: vi.fn(async () => interpretation), prune: vi.fn(async () => ({ status: "ok", deleted: 0 })),
  };
  const run = () => runResearchDaily(deps as unknown as ResearchDailyDependencies, 8);
  return { deps, run, snapshot: () => report?.snapshot };
}

describe("durable research daily loop", () => {
  it("publishes the selected order once and reuses an immutable same-day report", async () => {
    const f = fixture();
    expect((await f.run()).recommendations).toBe(1);
    expect((await f.run()).report?.reused).toBe(true);
    expect(f.deps.ingest).toHaveBeenCalledOnce();
    expect(f.deps.screen).toHaveBeenCalledOnce();
    expect(f.deps.interpret).toHaveBeenCalledOnce();
    expect(f.deps.store.publish).toHaveBeenCalledOnce();
    expect(f.snapshot()?.items.map((item) => item.paperId)).toEqual([paper.id]);
    expect(f.snapshot()?.items[0]?.reasons.join(" ")).toContain("方向种子");
  });
  it("resumes after process interruption without re-ingesting or changing frozen candidates", async () => {
    const f = fixture();
    f.deps.screen.mockRejectedValueOnce(new Error("process interrupted"));
    await expect(f.run()).rejects.toThrow("daily_screen_failed");
    f.deps.candidates.mockResolvedValue([]);
    await f.run();
    expect(f.deps.ingest).toHaveBeenCalledOnce();
    expect(f.deps.candidates).toHaveBeenCalledOnce();
    expect(f.snapshot()?.items).toHaveLength(1);
  });
  it("does not publish partial interpretations and retries only unfinished papers", async () => {
    const f = fixture();
    f.deps.interpret.mockResolvedValueOnce(null as never);
    await expect(f.run()).rejects.toThrow("interpretation_incomplete");
    expect(f.deps.store.publish).not.toHaveBeenCalled();
    await f.run();
    expect(f.deps.screen).toHaveBeenCalledOnce();
    expect(f.deps.interpret).toHaveBeenCalledTimes(2);
  });
  it("retries failed screening batches through the job cache before selecting", async () => {
    const f = fixture();
    f.deps.screen.mockResolvedValueOnce({ status: "complete", screened: 1, selected: 0, batches: 1,
      failures: [{ batchIndex: 0, errorCode: "timeout" }], batchIds: ["batch"] } as never);
    f.deps.screeningResults.mockResolvedValueOnce([]);
    await expect(f.run()).rejects.toThrow("screening_incomplete");
    expect(f.deps.interpret).not.toHaveBeenCalled();
    await f.run();
    expect(f.deps.screen).toHaveBeenCalledTimes(2);
  });
  it("uses only completed screening batches and publishes the missing coverage explicitly", async () => {
    const f = fixture();
    f.deps.candidates.mockResolvedValue([paper, { ...paper, id: "22222222-2222-4222-8222-222222222222" }]);
    f.deps.screen.mockResolvedValue({ status: "complete", screened: 2, selected: 1, batches: 2,
      failures: [{ batchIndex: 1, errorCode: "timeout" }], batchIds: ["good", "bad"] } as never);
    const result = await f.run();
    expect(result.report?.status).toBe("partial");
    expect(result.screening.failedBatches).toBe(1);
    expect(f.snapshot()?.validation.unscreenedCandidates).toBe(1);
    expect(f.snapshot()?.items.map((item) => item.paperId)).toEqual([paper.id]);
    await f.run();
    expect(f.deps.screen).toHaveBeenCalledOnce();
  });
  it("publishes only verified interpretations when a different selected paper fails", async () => {
    const f = fixture();
    const second = { ...paper, id: "22222222-2222-4222-8222-222222222222" };
    f.deps.candidates.mockResolvedValue([paper, second]);
    const first = (await f.deps.screeningResults())[0]!;
    f.deps.screeningResults.mockResolvedValue([first, { ...first, paperId: second.id }]);
    f.deps.interpret.mockResolvedValueOnce(interpretation).mockResolvedValueOnce(null as never);
    const result = await f.run();
    expect(result.report?.status).toBe("partial");
    expect(result.interpretation.failed).toBe(1);
    expect(f.snapshot()?.items.map((item) => item.paperId)).toEqual([paper.id]);
    expect(f.snapshot()?.validation.unavailableInterpretations).toBe(1);
    expect((await f.run()).report?.reused).toBe(true);
    expect(f.deps.interpret).toHaveBeenCalledTimes(2);
  });
  it("keeps a missing-abstract preprint as an explicit metadata-only card without asking the model to invent an interpretation", async () => {
    const f = fixture();
    f.deps.candidates.mockResolvedValue([{ ...paper, abstract: null } as never]);
    f.deps.screeningResults.mockResolvedValue([{ ...(await f.deps.screeningResults())[0]!, evidenceSource: "title", evidenceQuote: paper.title }]);
    expect((await f.run()).recommendations).toBe(1);
    expect(f.deps.interpret).not.toHaveBeenCalled();
    expect(f.snapshot()?.items[0]?.interpretation).toBeNull();
    expect(f.snapshot()?.items[0]?.reasons.join(" ")).toContain("仅列题录");
    expect(f.snapshot()?.validation.titleOnly).toBe(1);
  });
  it("a publication failure can resume without re-calling models", async () => {
    const f = fixture();
    f.deps.store.publish.mockRejectedValueOnce(new Error("transaction rolled back"));
    await expect(f.run()).rejects.toThrow("daily_publish_failed");
    await f.run();
    expect(f.deps.interpret).toHaveBeenCalledOnce();
    expect(f.deps.screen).toHaveBeenCalledOnce();
  });
  it("publishes a warning for partial source coverage and never silently rewrites that report", async () => {
    const f = fixture();
    f.deps.ingest.mockResolvedValue([{ name: "arxiv", status: "complete", records: 1 },
      { name: "openalex", status: "failed", records: 0 }] as never);
    expect((await f.run()).report?.status).toBe("partial");
    expect((await f.run()).report?.reused).toBe(true);
    expect(f.deps.ingest).toHaveBeenCalledOnce();
  });
  it("all-source failures are visible and retryable; zero eligible candidates produce a valid empty report", async () => {
    const f = fixture();
    f.deps.ingest.mockResolvedValueOnce([{ name: "arxiv", status: "failed", records: 0 }] as never);
    await expect(f.run()).rejects.toThrow("all_sources_failed");
    expect(f.deps.screen).not.toHaveBeenCalled();
    f.deps.candidates.mockResolvedValue([]);
    f.deps.screen.mockResolvedValue({ status: "complete", screened: 0, selected: 0, batches: 0, failures: [], batchIds: [] });
    f.deps.screeningResults.mockResolvedValue([]);
    expect((await f.run()).recommendations).toBe(0);
    expect(f.deps.interpret).not.toHaveBeenCalled();
  });
  it("invalid evidence cannot be published", async () => {
    const f = fixture();
    f.deps.screeningResults.mockResolvedValue([{ ...(await f.deps.screeningResults())[0]!, evidenceQuote: "fabricated quote" }]);
    await expect(f.run()).rejects.toThrow("daily_publish_failed");
    expect(f.deps.store.publish).not.toHaveBeenCalled();
  });
  it("date, profile, and model/prompt versions change the stable execution identity", () => {
    const key = dailyExecutionKey("2026-11-13", "profile-a", "model-a:screen-v3");
    expect(key).toBe(dailyExecutionKey("2026-11-13", "profile-a", "model-a:screen-v3"));
    expect(key).not.toBe(dailyExecutionKey("2026-11-14", "profile-a", "model-a:screen-v3"));
    expect(key).not.toBe(dailyExecutionKey("2026-11-13", "profile-b", "model-a:screen-v3"));
    expect(key).not.toBe(dailyExecutionKey("2026-11-13", "profile-a", "model-b:screen-v3"));
  });
});
