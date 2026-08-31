import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import {
  classifyPaper,
  type ClassifyPaperRepository,
} from "../../apps/worker/src/jobs/classify-paper";

const paper = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "A fictional optical paper",
  abstract: "A public fictional abstract.",
  journal: "Fictional Physics",
  publishedAt: new Date("2026-08-29T00:00:00.000Z"),
  accessStatus: "RESTRICTED" as const,
};

const classification = {
  tags: [{
    slug: "amo-optics" as const,
    relevance: 0.9,
    reason: "Optics.",
    crossDisciplinary: false,
  }],
  overallRelevance: 0.9,
  reason: "Optical physics.",
  crossDisciplinaryTags: [],
};

describe("classify-paper job", () => {
  it("claims, classifies safe facts, persists tags, and audits one attempt", async () => {
    const repository = repositoryStub();
    const primary = createMockAiProvider({
      name: "openai",
      model: "fixture-classifier",
      classify: { output: classification, inputTokens: 100, outputTokens: 20, durationMs: 15 },
    });
    const classifyCall = vi.spyOn(primary, "classify");

    const outcome = await classifyPaper({
      paperId: paper.id,
      repository,
      primary,
      prices: {
        openai: { inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 2 },
      },
      now: () => new Date("2026-08-29T01:00:00.000Z"),
    });

    expect(outcome).toEqual(expect.objectContaining({ status: "complete" }));
    expect(classifyCall).toHaveBeenCalledWith({
      title: paper.title,
      abstract: paper.abstract,
      journal: paper.journal,
      publishedAt: paper.publishedAt.toISOString(),
    });
    expect(repository.claimRun).toHaveBeenCalledWith(expect.objectContaining({
      paperId: paper.id,
      runType: "CLASSIFY",
      idempotencyKey: expect.stringContaining("CLASSIFY:fixture-classifier:classify-v1"),
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      reservedCostUsd: 0,
    }));
    expect(repository.replaceClassifications).toHaveBeenCalledWith(
      expect.objectContaining({
        classifications: [{
          tagSlug: "amo-optics",
          relevance: 0.9,
          reason: "Optics.",
        }],
      }),
    );
    expect(repository.appendAttempts).toHaveBeenCalledWith("run-1", [
      expect.objectContaining({
        provider: "openai",
        status: "COMPLETE",
        estimatedCostUsd: 0.00014,
      }),
    ]);
  });

  it("returns duplicate before claiming or calling a provider", async () => {
    const repository = repositoryStub();
    repository.findSuccessfulRun.mockResolvedValue({ id: "existing-run" });
    const primary = createMockAiProvider({
      classify: { output: classification, inputTokens: 1, outputTokens: 1, durationMs: 1 },
    });
    const classifyCall = vi.spyOn(primary, "classify");

    await expect(classifyPaper({
      paperId: paper.id,
      repository,
      primary,
      prices: { mock: { inputCostPerMillionUsd: 0, outputCostPerMillionUsd: 0 } },
    })).resolves.toEqual({ status: "duplicate", runId: "existing-run" });
    expect(repository.claimRun).not.toHaveBeenCalled();
    expect(classifyCall).not.toHaveBeenCalled();
  });

  it("audits one primary failure and one fallback success", async () => {
    const repository = repositoryStub();
    const primary = createMockAiProvider({
      name: "openai",
      model: "primary",
      classify: { errorCode: "rate_limited" },
    });
    const fallback = createMockAiProvider({
      name: "deepseek",
      model: "fallback",
      classify: { output: classification, inputTokens: 10, outputTokens: 10, durationMs: 4 },
    });

    const outcome = await classifyPaper({
      paperId: paper.id,
      repository,
      primary,
      fallback,
      prices: {
        openai: { inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 1 },
        deepseek: { inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 1 },
      },
    });

    expect(outcome.status).toBe("complete");
    expect(repository.appendAttempts.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ provider: "openai", status: "FAILED", errorCode: "rate_limited" }),
      expect.objectContaining({ provider: "deepseek", status: "COMPLETE" }),
    ]);
  });

  it("does not fallback on schema errors and marks the run failed", async () => {
    const repository = repositoryStub();
    const primary = createMockAiProvider({ classify: { errorCode: "schema_invalid" } });
    const fallback = createMockAiProvider({
      classify: { output: classification, inputTokens: 1, outputTokens: 1, durationMs: 1 },
    });
    const fallbackCall = vi.spyOn(fallback, "classify");

    await expect(classifyPaper({
      paperId: paper.id,
      repository,
      primary,
      fallback,
      prices: { mock: { inputCostPerMillionUsd: 0, outputCostPerMillionUsd: 0 } },
    })).resolves.toEqual(expect.objectContaining({
      status: "failed",
      errorCode: "schema_invalid",
    }));
    expect(fallbackCall).not.toHaveBeenCalled();
    expect(repository.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "schema_invalid" }),
    );
  });

  it("contains a classification persistence failure to the logical run", async () => {
    const repository = repositoryStub();
    repository.replaceClassifications.mockRejectedValue(new Error("fixture db failure"));
    const primary = createMockAiProvider({
      classify: { output: classification, inputTokens: 1, outputTokens: 1, durationMs: 1 },
    });

    await expect(classifyPaper({
      paperId: paper.id,
      repository,
      primary,
      prices: { mock: { inputCostPerMillionUsd: 0, outputCostPerMillionUsd: 0 } },
    })).resolves.toEqual({
      status: "failed",
      runId: "run-1",
      errorCode: "business_validation",
    });
    expect(repository.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", errorCode: "business_validation" }),
    );
  });
});

function repositoryStub() {
  return {
    findPaperForAi: vi.fn(async () => paper),
    findSuccessfulRun: vi.fn(async () => null),
    claimRun: vi.fn(async () => ({ status: "claimed" as const, run: { id: "run-1" } })),
    appendAttempts: vi.fn(async () => undefined),
    completeRun: vi.fn(async () => undefined),
    failRun: vi.fn(async () => undefined),
    replaceClassifications: vi.fn(async () => undefined),
  } satisfies ClassifyPaperRepository;
}
