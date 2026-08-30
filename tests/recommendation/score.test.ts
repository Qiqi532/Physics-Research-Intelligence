import { describe, expect, it } from "vitest";
import {
  rankRecommendations,
  scoreRecommendation,
  type RecommendationInput,
} from "../../packages/recommendation/src/score";

const now = new Date("2026-08-30T00:00:00.000Z");

describe("deterministic recommendation scoring", () => {
  it("combines interest, classification, recency, discovery and reading state", () => {
    const result = scoreRecommendation(
      candidate({
        publishedAt: new Date("2026-08-30T00:00:00.000Z"),
        classifications: [
          classification({
            relevance: 0.8,
            isCrossDisciplinary: true,
          }),
        ],
        interests: { "amo-optics": 2 },
        readingStatus: "SAVED",
        feedback: "LIKE",
      }),
      now,
    );

    expect(result.breakdown).toEqual({
      interest: 32,
      classification: 24,
      recency: 20,
      discovery: 8,
      readingState: 18,
    });
    expect(result.total).toBe(102);
    expect(result.reasons).toHaveLength(3);
    expect(result.reasons[0]).toContain("原子、分子与光学");
    expect(result.reasons).toContain("跨方向信号：连接多个物理方向");
  });

  it("uses classification, recency and discovery for a new user without interests", () => {
    const result = scoreRecommendation(
      candidate({
        classifications: [
          classification({ relevance: 0.6, isCrossDisciplinary: true }),
        ],
        interests: {},
      }),
      now,
    );

    expect(result.breakdown.interest).toBe(0);
    expect(result.breakdown.classification).toBe(18);
    expect(result.breakdown.discovery).toBe(6);
    expect(result.reasons.some((reason) => reason.includes("物理主题相关度"))).toBe(true);
  });

  it("handles papers without classifications or interpretations", () => {
    const withoutInterpretation = scoreRecommendation(
      candidate({ classifications: [], hasInterpretation: false }),
      now,
    );
    const withInterpretation = scoreRecommendation(
      candidate({ classifications: [], hasInterpretation: true }),
      now,
    );

    expect(withoutInterpretation.breakdown).toEqual({
      interest: 0,
      classification: 0,
      recency: 14,
      discovery: 0,
      readingState: 0,
    });
    expect(withoutInterpretation.total).toBe(withInterpretation.total);
    expect(withoutInterpretation.reasons).toContain("新近收录，尚待完成物理分类");
  });

  it.each([
    ["SAVED", "NONE", 10],
    ["READING", "NONE", 8],
    ["COMPLETE", "NONE", -20],
    ["SKIPPED", "NONE", -35],
    ["UNREAD", "LIKE", 8],
    ["UNREAD", "DISLIKE", -25],
  ] as const)("maps %s and %s to an explicit state adjustment", (status, feedback, expected) => {
    const result = scoreRecommendation(
      candidate({ readingStatus: status, feedback }),
      now,
    );

    expect(result.breakdown.readingState).toBe(expected);
  });

  it("clamps weights and relevance and never rewards future publication dates extra", () => {
    const result = scoreRecommendation(
      candidate({
        publishedAt: new Date("2026-09-02T00:00:00.000Z"),
        interests: { "amo-optics": 99 },
        classifications: [classification({ relevance: 4 })],
      }),
      now,
    );

    expect(result.breakdown.interest).toBe(40);
    expect(result.breakdown.classification).toBe(30);
    expect(result.breakdown.recency).toBe(20);
  });

  it("uses a fixed 30-day linear decay and gives undated papers no recency points", () => {
    const fifteenDaysOld = scoreRecommendation(
      candidate({ publishedAt: new Date("2026-08-15T00:00:00.000Z") }),
      now,
    );
    const old = scoreRecommendation(
      candidate({ publishedAt: new Date("2026-07-01T00:00:00.000Z") }),
      now,
    );
    const undated = scoreRecommendation(candidate({ publishedAt: null }), now);

    expect(fifteenDaysOld.breakdown.recency).toBe(10);
    expect(old.breakdown.recency).toBe(0);
    expect(undated.breakdown.recency).toBe(0);
  });

  it("returns at most three factual reasons", () => {
    const result = scoreRecommendation(
      candidate({
        classifications: [classification({ isCrossDisciplinary: true })],
        interests: { "amo-optics": 1 },
        readingStatus: "READING",
        feedback: "LIKE",
      }),
      now,
    );

    expect(result.reasons.length).toBeLessThanOrEqual(3);
    expect(result.reasons.every((reason) => reason.trim().length > 0)).toBe(true);
    expect(result.reasons.join(" ")).not.toContain("AI");
  });

  it("ranks ties by publication date and then paper id without hidden randomness", () => {
    const inputs = [
      candidate({ paperId: "paper-c", publishedAt: new Date("2026-08-20") }),
      candidate({ paperId: "paper-b", publishedAt: new Date("2026-08-21") }),
      candidate({ paperId: "paper-a", publishedAt: new Date("2026-08-21") }),
    ];

    const first = rankRecommendations(inputs, now);
    const second = rankRecommendations(inputs, now);

    expect(first.map(({ paperId }) => paperId)).toEqual(["paper-a", "paper-b", "paper-c"]);
    expect(second).toEqual(first);
  });
});

function candidate(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    paperId: "paper-1",
    publishedAt: new Date("2026-08-21T00:00:00.000Z"),
    classifications: [classification()],
    interests: {},
    readingStatus: "UNREAD",
    feedback: "NONE",
    hasInterpretation: false,
    ...overrides,
  };
}

function classification(
  overrides: Partial<RecommendationInput["classifications"][number]> = {},
): RecommendationInput["classifications"][number] {
  return {
    tagSlug: "amo-optics",
    tagLabel: "原子、分子与光学",
    relevance: 0.7,
    isCrossDisciplinary: false,
    ...overrides,
  };
}
