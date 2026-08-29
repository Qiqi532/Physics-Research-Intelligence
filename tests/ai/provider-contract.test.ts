import { describe, expect, it } from "vitest";
import { AiProviderError } from "../../packages/ai/src/errors";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import type { AiErrorCode, PaperAiInput } from "../../packages/ai/src/provider";

const paper: PaperAiInput = {
  title: "A fictional optical measurement",
  abstract: "We demonstrate a fictional test result.",
  journal: "Journal of Fictional Physics",
  publishedAt: "2026-08-29T00:00:00.000Z",
};

const classification = {
  tags: [{
    slug: "amo-optics" as const,
    relevance: 0.91,
    reason: "The abstract describes an optical measurement.",
    crossDisciplinary: false,
  }],
  overallRelevance: 0.91,
  reason: "The paper concerns optical physics.",
  crossDisciplinaryTags: [],
};

const abstractReference = {
  source: "abstract" as const,
  locator: "abstract",
  quote: "We demonstrate a fictional test result.",
};

const uncertainClaim = {
  text: "摘要未报告样本量。",
  evidenceLevel: "uncertain" as const,
  evidenceReferences: [abstractReference],
};

const interpretation = {
  basis: "abstract_only" as const,
  sourceDisclosure: "基于摘要解读" as const,
  overviewZh: uncertainClaim,
  researchQuestion: uncertainClaim,
  innovations: [uncertainClaim],
  methodsAndEvidence: [uncertainClaim],
  limitations: [uncertainClaim],
  readingAdvice: ["阅读开放原文前先核对摘要范围。"],
};

describe("AI provider contract", () => {
  it("returns validated classification with usage and duration", async () => {
    const provider = createMockAiProvider({
      classify: { output: classification, inputTokens: 100, outputTokens: 40, durationMs: 25 },
    });

    await expect(provider.classify(paper)).resolves.toEqual({
      provider: "mock",
      model: "mock-model",
      output: classification,
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
      durationMs: 25,
    });
  });

  it("accepts a normal uncertain interpretation without converting it to an error", async () => {
    const provider = createMockAiProvider({
      interpret: { output: interpretation, inputTokens: 120, outputTokens: 80, durationMs: 30 },
    });

    const result = await provider.interpret(paper);

    expect(result.output.limitations[0]?.evidenceLevel).toBe("uncertain");
    expect(result.usage.totalTokens).toBe(200);
  });

  it.each([
    ["invalid_json", "invalid_json"],
    ["schema_invalid", "schema_invalid"],
    ["network_error", "network_error"],
    ["timeout", "timeout"],
    ["rate_limited", "rate_limited"],
    ["upstream_5xx", "upstream_5xx"],
    ["permanent_4xx", "permanent_4xx"],
  ] as const)("exposes stable %s errors", async (scenario, code) => {
    const provider = createMockAiProvider({ classify: { errorCode: scenario } });

    await expect(provider.classify(paper)).rejects.toEqual(
      expect.objectContaining<Partial<AiProviderError>>({ code }),
    );
  });

  it("supports a health check without exposing configuration", async () => {
    const provider = createMockAiProvider({ health: { ok: true, durationMs: 3 } });

    await expect(provider.healthCheck()).resolves.toEqual({ ok: true, durationMs: 3 });
    expect(JSON.stringify(provider)).not.toContain("apiKey");
  });

  it("keeps error codes as an explicit closed union", () => {
    const codes: AiErrorCode[] = [
      "invalid_json",
      "schema_invalid",
      "network_error",
      "timeout",
      "rate_limited",
      "upstream_5xx",
      "authentication",
      "permanent_4xx",
      "configuration",
      "insufficient_input",
      "budget_exceeded",
      "business_validation",
    ];

    expect(codes).toHaveLength(12);
  });
});
