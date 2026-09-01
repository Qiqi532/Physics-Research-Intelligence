import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import { AiProviderError } from "../../packages/ai/src/errors";
import type { AiErrorCode, PaperAiInput } from "../../packages/ai/src/provider";
import {
  routeClassification,
  routeInterpretation,
} from "../../packages/ai/src/router";

const paper: PaperAiInput = {
  title: "A fictional optical measurement",
  abstract: "We demonstrate a fictional result.",
};

const classification = {
  tags: [{
    slug: "amo-optics" as const,
    relevance: 0.9,
    reason: "Optical measurement.",
    crossDisciplinary: false,
  }],
  overallRelevance: 0.9,
  reason: "Optical physics.",
  crossDisciplinaryTags: [],
};

const reference = {
  source: "abstract" as const,
  locator: "abstract",
  quote: "We demonstrate a fictional result.",
};

const uncertainClaim = {
  text: "摘要未提供这一细节。",
  evidenceLevel: "uncertain" as const,
  evidenceReferences: [reference],
};

const interpretation = {
  basis: "abstract_only" as const,
  sourceDisclosure: "基于摘要解读" as const,
  overviewZh: uncertainClaim,
  researchQuestion: uncertainClaim,
  innovations: [uncertainClaim],
  methodsAndEvidence: [uncertainClaim],
  limitations: [uncertainClaim],
  readingAdvice: ["核对开放原文。"],
};

describe("AI router fallback", () => {
  it.each([
    "network_error",
    "timeout",
    "rate_limited",
    "upstream_5xx",
  ] as const)("falls back exactly once for %s", async (errorCode) => {
    const primary = createMockAiProvider({
      name: "primary",
      model: "primary-model",
      classify: { errorCode },
    });
    const fallback = createMockAiProvider({
      name: "fallback",
      model: "fallback-model",
      classify: { output: classification, inputTokens: 20, outputTokens: 10, durationMs: 5 },
    });
    const primaryCall = vi.spyOn(primary, "classify");
    const fallbackCall = vi.spyOn(fallback, "classify");

    const outcome = await routeClassification({ primary, fallback, input: paper });

    expect(outcome).toEqual(expect.objectContaining({ ok: true }));
    expect(outcome.attempts).toEqual([
      expect.objectContaining({
        provider: "primary",
        status: "failed",
        errorCode,
      }),
      expect.objectContaining({
        provider: "fallback",
        status: "complete",
      }),
    ]);
    expect(primaryCall).toHaveBeenCalledTimes(1);
    expect(fallbackCall).toHaveBeenCalledTimes(1);
  });

  it.each([
    "invalid_json",
    "schema_invalid",
    "authentication",
    "permanent_4xx",
    "configuration",
    "insufficient_input",
    "business_validation",
  ] as const)("does not fall back for %s", async (errorCode: AiErrorCode) => {
    const primary = createMockAiProvider({ classify: { errorCode } });
    const fallback = createMockAiProvider({
      classify: { output: classification, inputTokens: 1, outputTokens: 1, durationMs: 1 },
    });
    const fallbackCall = vi.spyOn(fallback, "classify");

    const outcome = await routeClassification({ primary, fallback, input: paper });

    expect(outcome).toEqual({
      ok: false,
      errorCode,
      attempts: [
        expect.objectContaining({ status: "failed", errorCode }),
      ],
    });
    expect(fallbackCall).not.toHaveBeenCalled();
  });

  it("treats a valid uncertain interpretation as success without fallback", async () => {
    const primary = createMockAiProvider({
      interpret: { output: interpretation, inputTokens: 10, outputTokens: 10, durationMs: 2 },
    });
    const fallback = createMockAiProvider({
      interpret: { output: interpretation, inputTokens: 10, outputTokens: 10, durationMs: 2 },
    });
    const fallbackCall = vi.spyOn(fallback, "interpret");

    const outcome = await routeInterpretation({ primary, fallback, input: paper });

    expect(outcome).toEqual(expect.objectContaining({ ok: true }));
    expect(outcome.attempts).toHaveLength(1);
    expect(fallbackCall).not.toHaveBeenCalled();
  });

  it("records both failures and never makes a third call", async () => {
    const primary = createMockAiProvider({
      classify: { errorCode: "network_error" },
    });
    const fallback = createMockAiProvider({
      classify: { errorCode: "upstream_5xx" },
    });

    const outcome = await routeClassification({ primary, fallback, input: paper });

    expect(outcome).toEqual({
      ok: false,
      errorCode: "upstream_5xx",
      attempts: [
        expect.objectContaining({ status: "failed", errorCode: "network_error" }),
        expect.objectContaining({ status: "failed", errorCode: "upstream_5xx" }),
      ],
    });
    expect(outcome.attempts).toHaveLength(2);
  });

  it("retains normalized failure duration for audit", async () => {
    const primary = createMockAiProvider({
      classify: { output: classification, inputTokens: 1, outputTokens: 1, durationMs: 1 },
    });
    vi.spyOn(primary, "classify").mockRejectedValue(
      new AiProviderError("timeout", {
        provider: primary.name,
        durationMs: 17,
      }),
    );

    const outcome = await routeClassification({ primary, input: paper });

    expect(outcome.attempts).toEqual([
      expect.objectContaining({ status: "failed", durationMs: 17 }),
    ]);
  });
});
