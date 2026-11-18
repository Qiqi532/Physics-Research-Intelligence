import { describe, expect, it } from "vitest";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";
import { freezeRanking, keywordOrder, paperStatePatchSchema, replayRanking, seedCacheSchema } from "../../packages/domain/src/ranking-review";

describe("fixed candidate ranking review", () => {
  const { profile } = loadResearchProfile({});
  const relevant = "Bipolar optical sensor arrays extract motion and separate direction with analog memories";
  const papers = [
    { id: "keyword", doi: null, title: "Photodetector", abstract: "Avalanche photocurrent amplitude.", publishedAt: "2026-11-17" },
    { id: "seed", doi: null, title: "An alternative method", abstract: relevant, publishedAt: "2026-11-18" },
    { id: "unknown", doi: null, title: "Unjudged candidate", abstract: null, publishedAt: "2026-11-18" },
  ];

  it("keeps unmatched candidates for scoring and counts unknown labels independently", () => {
    const frozen = freezeRanking(profile, papers, [{ doi: profile.seeds[0].doi,
      sourceUrl: profile.seeds[0].sourceUrl, abstract: relevant }], "ready");
    expect(keywordOrder(profile, papers).map((p) => p.id)).toEqual(["keyword"]);
    const review = replayRanking(frozen, "2026-11-18", new Map([["seed", "LIKE"]]));
    expect(review.unmatched).toBe(2);
    expect(review.top.seeds?.map((p) => p.id)).toEqual(["seed"]);
    expect(review.metrics).toEqual(expect.arrayContaining([
      { method: "keywords", counts: { shown: 1, judged: 0, liked: 0, unjudged: 1, missed: 1 } },
      { method: "seeds", counts: { shown: 1, judged: 1, liked: 1, unjudged: 0, missed: 0 } },
    ]));
    expect(replayRanking(frozen, "2026-11-18", new Map()).review.map((p) => p.id)).toEqual(review.review.map((p) => p.id));
  });

  it("reports missing seed coverage and accepts independent state patches", () => {
    const review = replayRanking(freezeRanking(profile, papers, [], "missing"), "2026-11-18", new Map());
    expect(review.top.seeds).toBeNull();
    expect(review.top.hybrid).toBeNull();
    expect(paperStatePatchSchema.parse({ isFavorite: true })).toEqual({ isFavorite: true });
    expect(paperStatePatchSchema.parse({ feedback: "NONE" })).toEqual({ feedback: "NONE" });
    expect(paperStatePatchSchema.safeParse({}).success).toBe(false);
  });

  it("accepts public HTTPS seed provenance and rejects file paths", () => {
    const seed = { doi: profile.seeds[0].doi, abstract: relevant, sourceUrl: profile.seeds[0].sourceUrl };
    expect(seedCacheSchema.parse([seed])).toEqual([seed]);
    expect(seedCacheSchema.safeParse([{ ...seed, sourceUrl: "file:///tmp/example.pdf" }]).success).toBe(false);
  });
});
