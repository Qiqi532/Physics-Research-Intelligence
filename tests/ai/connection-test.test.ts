import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../../packages/ai/src/errors";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import {
  runConnectionHealth,
  runConnectionSample,
} from "../../packages/ai/src/connection-test";

const classification = {
  tags: [{
    slug: "amo-optics" as const,
    relevance: 0.93,
    reason: "The fictional abstract describes an optical measurement.",
    crossDisciplinary: false,
  }],
  overallRelevance: 0.93,
  reason: "This synthetic paper concerns optical physics.",
  crossDisciplinaryTags: [],
};

const reference = {
  source: "abstract" as const,
  locator: "abstract",
  quote: "We report a fictional tabletop measurement.",
};
const claim = {
  text: "这是一个用于连接测试的虚构结果。",
  evidenceLevel: "direct" as const,
  evidenceReferences: [reference],
};
const interpretation = {
  basis: "abstract_only" as const,
  sourceDisclosure: "基于摘要解读" as const,
  overviewZh: claim,
  researchQuestion: claim,
  innovations: [claim],
  methodsAndEvidence: [claim],
  limitations: [{ ...claim, evidenceLevel: "uncertain" as const }],
  readingAdvice: ["仅用于验证连接，不代表真实论文结论。"],
};

describe("model connection test runner", () => {
  it("returns a safe successful health result", async () => {
    const provider = createMockAiProvider({
      name: "kimi",
      model: "kimi-k3",
      health: { ok: true, durationMs: 4 },
    });

    await expect(runConnectionHealth(provider)).resolves.toEqual({
      status: "complete",
      provider: "kimi",
      model: "kimi-k3",
      durationMs: 4,
    });
  });

  it("maps health failures to stable errors", async () => {
    const provider = createMockAiProvider({ name: "glm", model: "glm-fixture" });
    vi.spyOn(provider, "healthCheck").mockRejectedValue(
      new AiProviderError("authentication", { provider: "glm", durationMs: 8 }),
    );

    await expect(runConnectionHealth(provider)).resolves.toEqual({
      status: "failed",
      provider: "glm",
      model: "glm-fixture",
      durationMs: 8,
      errorCode: "authentication",
    });
  });

  it("runs classification and interpretation and estimates each physical cost", async () => {
    const provider = createMockAiProvider({
      name: "kimi",
      model: "kimi-k3",
      classify: { output: classification, inputTokens: 100, outputTokens: 40, durationMs: 5 },
      interpret: { output: interpretation, inputTokens: 120, outputTokens: 80, durationMs: 7 },
    });
    const testOnlyValue = ["test", "only", "value"].join("-");

    const sample = await runConnectionSample({
      classificationProvider: provider,
      interpretationProvider: provider,
      prices: { inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 3 },
    });

    expect(sample.classification).toEqual(expect.objectContaining({
      status: "complete",
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
      cost: { microUsd: 220, usd: 0.00022 },
      output: classification,
    }));
    expect(sample.interpretation).toEqual(expect.objectContaining({
      status: "complete",
      cost: { microUsd: 360, usd: 0.00036 },
      output: interpretation,
    }));
    expect(JSON.stringify(sample)).not.toContain(testOnlyValue);
  });

  it("returns the other sample result when one provider call fails", async () => {
    const provider = createMockAiProvider({
      classify: { errorCode: "rate_limited" },
      interpret: { output: interpretation, inputTokens: 10, outputTokens: 5, durationMs: 3 },
    });

    const sample = await runConnectionSample({
      classificationProvider: provider,
      interpretationProvider: provider,
      prices: { inputCostPerMillionUsd: 0, outputCostPerMillionUsd: 0 },
    });

    expect(sample.classification).toEqual(expect.objectContaining({
      status: "failed",
      errorCode: "rate_limited",
    }));
    expect(sample.interpretation).toEqual(expect.objectContaining({ status: "complete" }));
  });
});
