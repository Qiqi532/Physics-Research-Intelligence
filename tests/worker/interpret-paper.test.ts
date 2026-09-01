import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import {
  interpretPaper,
  type InterpretPaperRepository,
} from "../../apps/worker/src/jobs/interpret-paper";

const paper = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "A fictional restricted paper",
  abstract: "Only this public fictional abstract is available.",
  journal: "Fictional Physics",
  publishedAt: new Date("2026-08-29T00:00:00.000Z"),
  accessStatus: "RESTRICTED" as const,
};

const reference = {
  source: "abstract" as const,
  locator: "abstract",
  quote: paper.abstract,
};
const claim = {
  text: "摘要未报告完整细节。",
  evidenceLevel: "uncertain" as const,
  evidenceReferences: [reference],
};
const interpretation = {
  basis: "abstract_only" as const,
  sourceDisclosure: "基于摘要解读" as const,
  overviewZh: claim,
  researchQuestion: claim,
  innovations: [claim],
  methodsAndEvidence: [claim],
  limitations: [claim],
  readingAdvice: ["核对开放原文。"],
};

describe("interpret-paper job", () => {
  it("checks successful idempotency before claiming a run", async () => {
    const repository = repositoryStub();
    repository.findSuccessfulRun.mockResolvedValue({ id: "existing-run" });
    const primary = successfulProvider();
    const call = vi.spyOn(primary, "interpret");

    await expect(run(repository, primary)).resolves.toEqual({
      status: "duplicate",
      runId: "existing-run",
    });
    expect(repository.claimRun).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("interprets only safe public facts and persists abstract-only content", async () => {
    const repository = repositoryStub();
    const primary = successfulProvider();
    const call = vi.spyOn(primary, "interpret");

    const outcome = await run(repository, primary);

    expect(outcome.status).toBe("complete");
    expect(call).toHaveBeenCalledWith({
      title: paper.title,
      abstract: paper.abstract,
      journal: paper.journal,
      publishedAt: paper.publishedAt.toISOString(),
    });
    expect(JSON.stringify(call.mock.calls[0]?.[0])).not.toContain("fullText");
    expect(repository.saveInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          basis: "abstract_only",
          sourceDisclosure: "基于摘要解读",
        }),
      }),
    );
  });

  it("audits fallback and preserves the logical task on failure", async () => {
    const repository = repositoryStub();
    const primary = createMockAiProvider({
      name: "primary",
      model: "primary-model",
      interpret: { errorCode: "timeout" },
    });
    const fallback = createMockAiProvider({
      name: "fallback",
      model: "fallback-model",
      interpret: { errorCode: "schema_invalid" },
    });

    const outcome = await run(repository, primary, fallback);

    expect(outcome).toEqual(expect.objectContaining({
      status: "failed",
      errorCode: "schema_invalid",
    }));
    expect(repository.appendAttempts.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ provider: "primary", status: "FAILED" }),
      expect.objectContaining({ provider: "fallback", status: "FAILED" }),
    ]);
    expect(repository.saveInterpretation).not.toHaveBeenCalled();
    expect(repository.failRun).toHaveBeenCalled();
  });

  it("contains an interpretation persistence failure to the logical run", async () => {
    const repository = repositoryStub();
    repository.saveInterpretation.mockRejectedValue(new Error("fixture db failure"));
    const primary = successfulProvider();

    await expect(run(repository, primary)).resolves.toEqual({
      status: "failed",
      runId: "run-1",
      errorCode: "business_validation",
    });
    expect(repository.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", errorCode: "business_validation" }),
    );
  });
});

function successfulProvider(name = "openai", model = "fixture-interpreter") {
  return createMockAiProvider({
    name,
    model,
    interpret: { output: interpretation, inputTokens: 100, outputTokens: 50, durationMs: 10 },
  });
}

function repositoryStub() {
  return {
    findPaperForAi: vi.fn(async () => paper),
    findSuccessfulRun: vi.fn(async () => null),
    claimRun: vi.fn(async () => ({
      status: "claimed" as const,
      run: { id: "run-1" },
    })),
    appendAttempts: vi.fn(async () => undefined),
    completeRun: vi.fn(async () => undefined),
    failRun: vi.fn(async () => undefined),
    saveInterpretation: vi.fn(async () => undefined),
  } satisfies InterpretPaperRepository;
}

function run(
  repository: ReturnType<typeof repositoryStub>,
  primary: ReturnType<typeof successfulProvider>,
  fallback?: ReturnType<typeof successfulProvider>,
) {
  return interpretPaper({
    paperId: paper.id,
    repository,
    primary,
    fallback,
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });
}
