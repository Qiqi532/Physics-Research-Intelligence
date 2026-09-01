import { describe, expect, it } from "vitest";
import {
  buildDailySelection,
  perDirectionCapFor,
  type DailySelectionPool,
} from "../../apps/worker/src/configured-daily-processor";

const now = new Date("2026-08-30T00:00:00.000Z");

describe("per-direction cap", () => {
  it("derives a cap that keeps at least three directions represented", () => {
    expect(perDirectionCapFor(15)).toBe(5);
    expect(perDirectionCapFor(10)).toBe(4);
    expect(perDirectionCapFor(1)).toBe(1);
  });
});

describe("deterministic daily selection", () => {
  it("works on a cold start without configured interests", () => {
    const directions = ["amo-optics", "astrophysics", "condensed-matter"];
    const candidates = Array.from({ length: 30 }, (_, index) =>
      paper(`p-${index}`, {
        classifications: [{
          tagSlug: directions[index % 3],
          relevance: 0.7,
          isCrossDisciplinary: false,
        }],
      }),
    );
    const result = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(result.paperIds).toHaveLength(15);
    expect(result.candidateCount).toBe(30);
  });

  it("prefers papers matching configured interests when selection is tight", () => {
    const result = buildDailySelection({
      pool: pool({
        interests: { "amo-optics": 2 },
        candidates: [
          paper("z-matching", {
            classifications: [{
              tagSlug: "amo-optics",
              relevance: 0.7,
              isCrossDisciplinary: false,
            }],
          }),
          paper("a-other", {
            classifications: [{
              tagSlug: "astrophysics",
              relevance: 0.7,
              isCrossDisciplinary: false,
            }],
          }),
        ],
      }),
      now,
      minCount: 1,
      maxCount: 1,
      perDirectionCap: 1,
    });

    expect(result.paperIds).toEqual(["z-matching"]);
  });

  it("includes a cross-disciplinary paper through the discovery bonus", () => {
    const result = buildDailySelection({
      pool: pool({
        interests: {},
        candidates: [
          paper("z-cross", {
            classifications: [{
              tagSlug: "amo-optics",
              relevance: 0.7,
              isCrossDisciplinary: true,
            }],
          }),
          paper("a-plain", {
            classifications: [{
              tagSlug: "amo-optics",
              relevance: 0.7,
              isCrossDisciplinary: false,
            }],
          }),
        ],
      }),
      now,
      minCount: 1,
      maxCount: 1,
      perDirectionCap: 1,
    });

    expect(result.paperIds).toEqual(["z-cross"]);
  });

  it("breaks deterministic ties by id and repeats the same result", () => {
    const candidates = [paper("p-b"), paper("p-a")];
    const first = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 1,
      maxCount: 1,
      perDirectionCap: 1,
    });
    const second = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 1,
      maxCount: 1,
      perDirectionCap: 1,
    });

    expect(first.paperIds).toEqual(["p-a"]);
    expect(second).toEqual(first);
  });

  it("returns an explicit partial result when the source pool is smaller than the minimum", () => {
    const result = buildDailySelection({
      pool: pool({ candidates: [paper("p-1"), paper("p-2"), paper("p-3")] }),
      now,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(result.paperIds).toEqual(["p-1", "p-2", "p-3"]);
    expect(result.candidateCount).toBe(3);
  });

  it("caps at the maximum count while keeping direction diversity", () => {
    const directions = ["amo-optics", "astrophysics", "condensed-matter"];
    const candidates = Array.from({ length: 30 }, (_, index) =>
      paper(`p-${index}`, {
        classifications: [{
          tagSlug: directions[index % 3],
          relevance: 0.7,
          isCrossDisciplinary: false,
        }],
      }),
    );
    const result = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(result.paperIds).toHaveLength(15);
    expect(result.candidateCount).toBe(30);
  });

  it("derives a stable selection when the same daily window reruns", () => {
    const candidates = [
      paper("p-1"),
      paper("p-2"),
      paper("p-3"),
      paper("p-4"),
      paper("p-5"),
    ];
    const first = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });
    const second = buildDailySelection({
      pool: pool({ candidates }),
      now,
      minCount: 10,
      maxCount: 15,
      perDirectionCap: 5,
    });

    expect(first).toEqual(second);
    expect(first.paperIds).toEqual(["p-1", "p-2", "p-3", "p-4", "p-5"]);
  });
});

function pool(overrides: Partial<DailySelectionPool> = {}): DailySelectionPool {
  return { interests: {}, candidates: [], ...overrides };
}

function paper(
  id: string,
  overrides: Partial<DailySelectionPool["candidates"][number]> = {},
): DailySelectionPool["candidates"][number] {
  return {
    id,
    publishedAt: new Date("2026-08-29T00:00:00.000Z"),
    classifications: [{
      tagSlug: "amo-optics",
      relevance: 0.7,
      isCrossDisciplinary: false,
    }],
    ...overrides,
  };
}
