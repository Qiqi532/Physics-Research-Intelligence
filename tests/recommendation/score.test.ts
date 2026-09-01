import { describe, expect, it } from "vitest";
import {
  rankRecommendations,
  scoreRecommendation,
  selectDailyPapers,
  type DailySelectionCandidate,
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

describe("deterministic daily selection", () => {
  it("selects fewer than the minimum when the pool is small", () => {
    expect(
      selectDailyPapers({
        candidates: [dailyCandidate("p-1", 80), dailyCandidate("p-2", 70)],
        minCount: 10,
        maxCount: 15,
        perDirectionCap: 5,
      }),
    ).toEqual(["p-1", "p-2"]);
  });

  it("caps the selection at the maximum count", () => {
    const directions = ["amo-optics", "astrophysics", "condensed-matter"];
    const candidates = Array.from({ length: 30 }, (_, index) =>
      dailyCandidate(`p-${index}`, 100 - index, directions[index % 3]),
    );
    const result = selectDailyPapers({
      candidates,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });
    expect(result).toHaveLength(15);
  });

  it("keeps a single direction from consuming the daily set when alternatives exist", () => {
    const candidates = [
      ...Array.from({ length: 8 }, (_, index) =>
        dailyCandidate(`amo-${index}`, 90 - index, "amo-optics"),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        dailyCandidate(`astro-${index}`, 50 - index, "astrophysics"),
      ),
    ];
    const result = selectDailyPapers({
      candidates,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });
    const amoCount = result.filter((id) => id.startsWith("amo-")).length;
    const astroCount = result.filter((id) => id.startsWith("astro-")).length;

    expect(amoCount).toBe(5);
    expect(astroCount).toBe(5);
    expect(result).toHaveLength(10);
  });

  it("overflows the cap only when no alternatives exist", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      dailyCandidate(`amo-${index}`, 90 - index, "amo-optics"),
    );
    const result = selectDailyPapers({
      candidates,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(result).toHaveLength(10);
    expect(result.every((id) => id.startsWith("amo-"))).toBe(true);
  });

  it("is stable across repeated calls with the same input", () => {
    const candidates = [
      dailyCandidate("p-c", 80),
      dailyCandidate("p-a", 80, "astrophysics"),
      dailyCandidate("p-b", 80),
    ];
    const first = selectDailyPapers({
      candidates,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });
    const second = selectDailyPapers({
      candidates,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(first).toEqual(second);
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

function dailyCandidate(
  paperId: string,
  score: number,
  tagSlug = "amo-optics",
): DailySelectionCandidate {
  return {
    paperId,
    publishedAt: new Date("2026-08-21T00:00:00.000Z"),
    score,
    tags: [{ tagSlug, relevance: 0.9 }],
  };
}
