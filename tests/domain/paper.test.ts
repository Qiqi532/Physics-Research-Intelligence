import { describe, expect, it } from "vitest";
import {
  findDuplicateCandidates,
  normalizeAuthor,
  normalizeDoi,
  normalizeTitle,
  paperSourceInputSchema,
} from "../../packages/domain/src/paper";
import { PHYSICS_TAGS } from "../../packages/domain/src/physics-tags";

describe("paper normalization", () => {
  it.each([
    "10.1103/PhysRevLett.123.456",
    "doi: 10.1103/PhysRevLett.123.456",
    "https://doi.org/10.1103/PhysRevLett.123.456",
    "http://dx.doi.org/10.1103/PhysRevLett.123.456",
  ])("normalizes equivalent DOI forms: %s", (value) => {
    expect(normalizeDoi(value)).toBe("10.1103/physrevlett.123.456");
  });

  it("rejects an invalid DOI instead of creating an unstable identity", () => {
    expect(() => normalizeDoi("not-a-doi")).toThrow("Invalid DOI");
  });

  it("normalizes Unicode, punctuation and whitespace in titles and authors", () => {
    expect(normalizeTitle("  Quantum—Light: A  Test! ")).toBe("quantum light a test");
    expect(normalizeAuthor("  Marie S. Curie ")).toBe("marie s curie");
  });

  it("validates and trims a source record without requiring a DOI", () => {
    const parsed = paperSourceInputSchema.parse({
      sourceName: " arxiv ",
      sourceRecordId: " 2501.01234 ",
      sourceUrl: "https://arxiv.org/abs/2501.01234",
      title: " A paper without a DOI ",
      firstAuthor: "A. Researcher",
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      retrievedAt: new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(parsed.sourceName).toBe("arxiv");
    expect(parsed.sourceRecordId).toBe("2501.01234");
    expect(parsed.doi).toBeUndefined();
  });
});

describe("candidate duplicate detection", () => {
  const existing = [
    {
      id: "paper-1",
      title: "Quantum transport in two dimensional materials",
      firstAuthor: "Mei Lin",
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  ];

  it("returns a candidate only when title, author and date all match", () => {
    const result = findDuplicateCandidates(
      {
        title: "Quantum transport in two-dimensional materials",
        firstAuthor: "Mei Lin",
        publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      },
      existing,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("paper-1");
    expect(result[0]?.titleSimilarity).toBeGreaterThanOrEqual(0.85);
  });

  it("does not return candidates with a different first author", () => {
    const result = findDuplicateCandidates(
      {
        title: existing[0]!.title,
        firstAuthor: "Another Author",
        publishedAt: existing[0]!.publishedAt,
      },
      existing,
    );

    expect(result).toEqual([]);
  });

  it("does not return candidates published more than seven days apart", () => {
    const result = findDuplicateCandidates(
      {
        title: existing[0]!.title,
        firstAuthor: existing[0]!.firstAuthor,
        publishedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
      existing,
    );

    expect(result).toEqual([]);
  });
});

describe("physics tags", () => {
  it("covers the agreed physics areas and cross-disciplinary work", () => {
    expect(PHYSICS_TAGS.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        "amo-optics",
        "condensed-matter-materials",
        "high-energy-particle",
        "nuclear",
        "astrophysics",
        "statistical-computational",
        "plasma",
        "biophysics",
        "cross-disciplinary",
      ]),
    );
  });
});
