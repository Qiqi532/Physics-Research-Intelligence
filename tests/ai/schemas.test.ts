import { describe, expect, it } from "vitest";
import {
  classificationOutputSchema,
  interpretationOutputSchema,
} from "../../packages/ai/src/schemas";

const abstractEvidence = {
  source: "abstract" as const,
  locator: "abstract",
  quote: "We demonstrate a test result.",
};

function claim(overrides: Record<string, unknown> = {}) {
  return {
    text: "摘要报告了一个可核验的结果。",
    evidenceLevel: "direct",
    evidenceReferences: [abstractEvidence],
    ...overrides,
  };
}

function interpretation(overrides: Record<string, unknown> = {}) {
  return {
    basis: "abstract_only",
    sourceDisclosure: "基于摘要解读",
    overviewZh: claim(),
    researchQuestion: claim(),
    innovations: [claim()],
    methodsAndEvidence: [claim()],
    limitations: [
      claim({
        text: "摘要未提供完整实验细节。",
        evidenceLevel: "uncertain",
      }),
    ],
    readingAdvice: ["先核对摘要中的研究范围，再阅读开放原文。"],
    ...overrides,
  };
}

describe("AI output schemas", () => {
  it("accepts a strict physics classification", () => {
    expect(classificationOutputSchema.parse({
      tags: [
        {
          slug: "amo-optics",
          relevance: 0.92,
          reason: "标题和摘要讨论光学测量。",
          crossDisciplinary: false,
        },
      ],
      overallRelevance: 0.92,
      reason: "论文属于物理研究。",
      crossDisciplinaryTags: ["cross-disciplinary"],
    })).toEqual(expect.objectContaining({ overallRelevance: 0.92 }));
  });

  it.each([
    {
      name: "unknown fields",
      value: {
        tags: [],
        overallRelevance: 0.5,
        reason: "test",
        crossDisciplinaryTags: [],
        hidden: true,
      },
    },
    {
      name: "unknown tags",
      value: {
        tags: [{
          slug: "invented-physics",
          relevance: 0.5,
          reason: "test",
          crossDisciplinary: false,
        }],
        overallRelevance: 0.5,
        reason: "test",
        crossDisciplinaryTags: [],
      },
    },
    {
      name: "out-of-range relevance",
      value: {
        tags: [{
          slug: "plasma",
          relevance: 1.1,
          reason: "test",
          crossDisciplinary: false,
        }],
        overallRelevance: 1.1,
        reason: "test",
        crossDisciplinaryTags: [],
      },
    },
  ])("rejects classification $name", ({ value }) => {
    expect(classificationOutputSchema.safeParse(value).success).toBe(false);
  });

  it("accepts an abstract-only interpretation with evidence on every claim", () => {
    expect(interpretationOutputSchema.parse(interpretation())).toEqual(
      expect.objectContaining({
        basis: "abstract_only",
        sourceDisclosure: "基于摘要解读",
      }),
    );
  });

  it.each([
    {
      name: "unknown full-text claims",
      value: interpretation({ claimedRestrictedFullTextAccess: true }),
    },
    {
      name: "invalid evidence levels",
      value: interpretation({ innovations: [claim({ evidenceLevel: "certain" })] }),
    },
    {
      name: "missing evidence references",
      value: interpretation({ methodsAndEvidence: [claim({ evidenceReferences: [] })] }),
    },
    {
      name: "missing abstract disclosure",
      value: interpretation({ sourceDisclosure: "完整论文解读" }),
    },
  ])("rejects interpretation $name", ({ value }) => {
    expect(interpretationOutputSchema.safeParse(value).success).toBe(false);
  });
});
