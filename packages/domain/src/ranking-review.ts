import { z } from "zod";
import { normalizeDoi } from "./paper";
import { matchResearch, type ResearchProfile } from "./research-profile";

export const feedbackSchema = z.enum(["NONE", "LIKE", "DISLIKE"]);
export type RankingFeedback = z.infer<typeof feedbackSchema>;
export const paperStatePatchSchema = z.strictObject({
  status: z.enum(["UNREAD", "SAVED", "READING", "COMPLETE", "SKIPPED"]).optional(),
  feedback: feedbackSchema.optional(),
  isFavorite: z.boolean().optional(),
  note: z.string().max(4_000).nullable().optional(),
}).refine((values) => Object.keys(values).length > 0);
export type PaperStatePatch = z.infer<typeof paperStatePatchSchema>;
export const rankingMethods = ["keywords", "seeds", "hybrid"] as const;
export type RankingMethod = typeof rankingMethods[number];
export const rankingMethodLabels: Record<RankingMethod, string> = {
  keywords: "现有关键词", seeds: "种子摘要相似度", hybrid: "混合排序",
};
export const rankingWindowDays = 7;
const topCount = 5;

type PublicCandidate = {
  id: string; title: string; doi: string | null; abstract: string | null; publishedAt: string | null;
};
export const seedAbstractSchema = z.object({
  doi: z.string().min(1), abstract: z.string().min(1).max(24_000), sourceUrl: z.url({ protocol: /^https?$/ }),
});
export const seedCacheSchema = z.array(seedAbstractSchema).max(100);
export type PublicSeedAbstract = z.infer<typeof seedAbstractSchema>;

const scoredPaper = z.object({
  id: z.string(), title: z.string(), doi: z.string().nullable(), excerpt: z.string().nullable(),
  publishedAt: z.string().nullable(), keywordKind: z.enum(["core", "adjacent", "none"]),
  keywordScore: z.number().min(0).max(1), seedScore: z.number().min(0).max(1).nullable(),
});
export const rankingSnapshotSchema = z.object({
  version: z.literal(1), configuredSeeds: z.number().int().nonnegative(),
  availableSeeds: z.array(z.object({ doi: z.string(), sourceUrl: z.string() })),
  seedCache: z.enum(["ready", "missing", "invalid"]),
  papers: z.array(scoredPaper).max(3000),
});
export type RankingSnapshot = z.infer<typeof rankingSnapshotSchema>;
type ScoredPaper = z.infer<typeof scoredPaper>;
type KeywordScore = { id: string; publishedAt: string | null; keywordKind: ScoredPaper["keywordKind"]; keywordScore: number };

function compareDateId(a: KeywordScore, b: KeywordScore) {
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id);
}

function compareKeywords(a: KeywordScore, b: KeywordScore) {
  return Number(b.keywordKind === "core") - Number(a.keywordKind === "core") ||
    b.keywordScore - a.keywordScore || compareDateId(a, b);
}

function keywordScore(profile: ResearchProfile, paper: PublicCandidate): KeywordScore {
  const match = matchResearch(profile, paper);
  return { id: paper.id, publishedAt: paper.publishedAt, keywordKind: match.kind, keywordScore: match.score };
}

export function keywordOrder<T extends PublicCandidate>(profile: ResearchProfile, papers: T[]): T[] {
  return papers.map((paper) => ({ paper, score: keywordScore(profile, paper) }))
    .filter(({ score }) => score.keywordKind !== "none")
    .sort((a, b) => compareKeywords(a.score, b.score)).map(({ paper }) => paper);
}

const commonWords = new Set(("about above across after again also among analysis another approach based been being between " +
  "both can could demonstrate during each from gives have high however into method more most much only other " +
  "over paper provide reported results show shown since study such than that their these they this those through " +
  "under used using were what when where which while will with without would").split(" "));

function terms(abstract: string) {
  const words = (abstract.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((word) => !commonWords.has(word) && /\p{L}/u.test(word));
  const counts = new Map<string, number>();
  for (const [i, word] of words.entries()) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
    if (i) {
      const bigram = words[i - 1] + " " + word;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }
  }
  return counts;
}

function fitSeeds(profile: ResearchProfile, rawSeeds: PublicSeedAbstract[]) {
  const byDoi = new Map(rawSeeds.map((seed) => [normalizeDoi(seed.doi), seed]));
  const seeds = profile.seeds.flatMap((reference) => {
    const seed = byDoi.get(normalizeDoi(reference.doi));
    return seed && seed.abstract.trim() ? [{ ...seed, topicId: reference.topicId, counts: terms(seed.abstract) }] : [];
  }).filter((seed) => seed.counts.size);
  const frequencies = new Map<string, number>();
  for (const seed of seeds) for (const term of seed.counts.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const vector = (counts: Map<string, number>) => {
    const weights = new Map([...counts].map(([term, count]) => {
      const idf = 1 + Math.log((seeds.length + 1) / ((frequencies.get(term) ?? 0) + 1));
      return [term, (1 + Math.log(count)) * idf] as const;
    }));
    const norm = Math.sqrt([...weights.values()].reduce((sum, value) => sum + value * value, 0));
    return { weights, norm };
  };
  const vectors = seeds.map((seed) => ({ topicId: seed.topicId, ...vector(seed.counts) }));
  return {
    available: seeds.map(({ doi, sourceUrl }) => ({ doi, sourceUrl })),
    similarity(abstract: string | null) {
      if (!abstract?.trim() || !vectors.length) return null;
      const candidate = vector(terms(abstract.slice(0, profile.screening.abstractMaxChars)));
      if (!candidate.norm) return null;
      const byTopic = new Map<string, number[]>();
      for (const seed of vectors) {
        const dot = [...seed.weights].reduce((sum, [term, value]) => sum + value * (candidate.weights.get(term) ?? 0), 0);
        const values = byTopic.get(seed.topicId) ?? [];
        values.push(dot / (seed.norm * candidate.norm));
        byTopic.set(seed.topicId, values);
      }
      return Math.min(1, Math.max(0, ...profile.topics.map((topic) => {
        const values = byTopic.get(topic.id);
        return values ? topic.weight * values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      })));
    },
  };
}

export function freezeRanking(profile: ResearchProfile, papers: PublicCandidate[], seeds: PublicSeedAbstract[],
  seedCache: RankingSnapshot["seedCache"]): RankingSnapshot {
  const fit = fitSeeds(profile, seeds);
  return {
    version: 1, configuredSeeds: profile.seeds.length, availableSeeds: fit.available, seedCache,
    papers: papers.map((paper) => ({
      ...keywordScore(profile, paper), title: paper.title, doi: paper.doi,
      excerpt: paper.abstract?.trim().slice(0, 1200) || null, seedScore: fit.similarity(paper.abstract),
    })),
  };
}

function auditOrder(date: string, id: string) {
  let hash = 2166136261;
  for (const char of date + ":" + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function replayRanking(snapshot: RankingSnapshot, date: string, feedback: ReadonlyMap<string, RankingFeedback>) {
  const { papers } = snapshot;
  const score = (paper: ScoredPaper) => 0.55 * paper.keywordScore + 0.45 * (paper.seedScore ?? 0);
  const top = {
    keywords: papers.filter((p) => p.keywordKind !== "none").sort(compareKeywords).slice(0, topCount),
    seeds: snapshot.availableSeeds.length ? papers.filter((p) => (p.seedScore ?? 0) > 0)
      .sort((a, b) => b.seedScore! - a.seedScore! || compareDateId(a, b)).slice(0, topCount) : null,
    hybrid: snapshot.availableSeeds.length ? papers.filter((p) => score(p) > 0)
      .sort((a, b) => score(b) - score(a) || compareDateId(a, b)).slice(0, topCount) : null,
  };
  const topIds = new Set(rankingMethods.flatMap((method) => (top[method] ?? []).map((paper) => paper.id)));
  const audit = papers.filter((paper) => !topIds.has(paper.id))
    .sort((a, b) => Number(b.keywordKind === "none") - Number(a.keywordKind === "none") ||
      auditOrder(date, a.id) - auditOrder(date, b.id) || a.id.localeCompare(b.id)).slice(0, topCount);
  const review = papers.filter((paper) => topIds.has(paper.id) || audit.includes(paper))
    .sort((a, b) => auditOrder(date, a.id) - auditOrder(date, b.id) || a.id.localeCompare(b.id));
  const liked = review.filter((p) => feedback.get(p.id) === "LIKE");
  return {
    top, review, unmatched: papers.filter((p) => p.keywordKind === "none").length,
    metrics: rankingMethods.map((method) => {
      const relevant = top[method];
      if (!relevant) return { method, counts: null };
      const recommended = new Set(relevant.map((paper) => paper.id));
      const judged = relevant.filter((paper) => (feedback.get(paper.id) ?? "NONE") !== "NONE").length;
      return { method, counts: {
        shown: relevant.length, judged, unjudged: relevant.length - judged,
        liked: relevant.filter((paper) => feedback.get(paper.id) === "LIKE").length,
        missed: liked.filter((p) => !recommended.has(p.id)).length,
      } };
    }),
  };
}
