import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src";
import type { AiRepository, SafePaperFacts } from "../../packages/db/src";
import { runInterpretation } from "../../apps/web/src/server/single-interpretation";

const paper: SafePaperFacts = {
  id: "paper-1",
  title: "A safe paper",
  abstract: "A public abstract.",
  journal: "Physical Review Letters",
  publishedAt: new Date("2026-09-01T00:00:00.000Z"),
  accessStatus: "UNKNOWN",
};

const evidence = {
  text: "摘要提供了有限证据。",
  evidenceLevel: "direct" as const,
  evidenceReferences: [{
    source: "abstract" as const,
    locator: "abstract",
    quote: "A public abstract.",
  }],
};

function provider() {
  return createMockAiProvider({
    interpret: {
      output: {
        basis: "abstract_only",
        sourceDisclosure: "基于摘要解读",
        overviewZh: evidence,
        researchQuestion: evidence,
        innovations: [evidence],
        methodsAndEvidence: [evidence],
        limitations: [{ ...evidence, evidenceLevel: "uncertain" as const }],
        readingAdvice: ["核对开放原文。"],
      },
      inputTokens: 20,
      outputTokens: 30,
      durationMs: 5,
    },
  });
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    findPaperForAi: vi.fn().mockResolvedValue(paper),
    findSuccessfulRun: vi.fn().mockResolvedValue(null),
    claimRun: vi.fn().mockResolvedValue({
      status: "claimed",
      run: { id: "run-1" },
    }),
    appendAttempts: vi.fn().mockResolvedValue(undefined),
    saveInterpretation: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("single-paper interpretation core", () => {
  it("returns business validation when the paper is missing", async () => {
    const repo = repository({
      findPaperForAi: vi.fn().mockResolvedValue(null),
    });

    const result = await runInterpretation({
      paperId: "missing-paper",
      repository: repo as unknown as AiRepository,
      primary: provider(),
    });

    expect(result).toEqual({
      status: "failed",
      errorCode: "business_validation",
    });
    expect(repo.claimRun).not.toHaveBeenCalled();
  });

  it("returns an existing in-progress claim without calling the provider", async () => {
    const repo = repository({
      claimRun: vi.fn().mockResolvedValue({
        status: "in_progress",
        run: { id: "run-1" },
      }),
    });
    const primary = provider();
    const interpret = vi.spyOn(primary, "interpret");

    const result = await runInterpretation({
      paperId: paper.id,
      repository: repo as unknown as AiRepository,
      primary,
    });

    expect(result).toEqual({ status: "in_progress", runId: "run-1" });
    expect(interpret).not.toHaveBeenCalled();
  });

  it("saves a complete interpretation and its audit attempt", async () => {
    const repo = repository();

    const result = await runInterpretation({
      paperId: paper.id,
      repository: repo as unknown as AiRepository,
      primary: provider(),
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });

    expect(result).toEqual({ status: "complete", runId: "run-1" });
    expect(repo.appendAttempts).toHaveBeenCalledOnce();
    expect(repo.saveInterpretation).toHaveBeenCalledOnce();
    expect(repo.completeRun).toHaveBeenCalledWith({
      runId: "run-1",
      provider: "mock",
      model: "mock-model",
      completedAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(repo.failRun).not.toHaveBeenCalled();
  });

  it("records a provider failure without saving interpretation content", async () => {
    const repo = repository();
    const primary = createMockAiProvider({
      interpret: { errorCode: "timeout" },
    });

    const result = await runInterpretation({
      paperId: paper.id,
      repository: repo as unknown as AiRepository,
      primary,
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "failed",
      runId: "run-1",
      errorCode: "timeout",
    });
    expect(repo.appendAttempts).toHaveBeenCalledOnce();
    expect(repo.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      errorCode: "timeout",
      completedAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(repo.saveInterpretation).not.toHaveBeenCalled();
  });
});
