import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const keyword = z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N} /+-]*$/u);
const topicSchema = z.object({
  id: slug,
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["core", "adjacent"]),
  weight: z.number().positive().max(2),
  keywords: z.array(keyword).min(1).max(12),
}).strict();

export const researchProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: slug,
  label: z.string().trim().min(1).max(120),
  topics: z.array(topicSchema).min(1).max(12),
  seeds: z.array(z.object({
    title: z.string().trim().min(1).max(500),
    doi: z.string().regex(/^10\.\d{4,9}\/\S+$/iu),
    topicId: slug,
    sourceUrl: z.string().url().refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  }).strict()).min(1).max(20),
  sources: z.object({
    enabled: z.array(z.enum(["arxiv", "openalex"])).min(1).max(2),
    arxivCategories: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9.-]*$/u)).min(1).max(10),
    maxPages: z.number().int().min(1).max(10),
    pageSize: z.number().int().min(1).max(100),
  }).strict(),
  screening: z.object({
    candidateLimit: z.number().int().min(1).max(200),
    batchSize: z.number().int().min(1).max(10),
    abstractMaxChars: z.number().int().min(500).max(12000),
    adjacentMax: z.number().int().min(0).max(8),
  }).strict(),
}).strict().superRefine((profile, context) => {
  const topics = new Set(profile.topics.map((topic) => topic.id));
  if (topics.size !== profile.topics.length || !profile.topics.some((topic) => topic.kind === "core") ||
      new Set(profile.sources.enabled).size !== profile.sources.enabled.length ||
      profile.seeds.some((seed) => !topics.has(seed.topicId))) {
    context.addIssue({ code: "custom", message: "Invalid profile identities" });
  }
});

export type ResearchProfile = z.infer<typeof researchProfileSchema>;
export type PublicResearchContext = {
  label: string;
  version: string;
  topics: Array<Pick<ResearchProfile["topics"][number], "label" | "kind" | "keywords">>;
  seeds: Array<{ title: string; doi: string }>;
  abstractMaxChars: number;
};

export function parseResearchProfile(value: unknown): ResearchProfile {
  const result = researchProfileSchema.safeParse(value);
  if (!result.success) throw new Error("research_profile_invalid");
  return result.data;
}

export function publicResearchContext(profile: ResearchProfile, version: string): PublicResearchContext {
  return {
    label: profile.label, version,
    topics: profile.topics.map(({ label, kind, keywords }) => ({ label, kind, keywords })),
    seeds: profile.seeds.map(({ title, doi }) => ({ title, doi })),
    abstractMaxChars: profile.screening.abstractMaxChars,
  };
}

export function researchQueryTerms(profile: ResearchProfile): string[] {
  return [...new Set(profile.topics.flatMap((topic) => topic.keywords.slice(0, 2)))];
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchResearch(profile: ResearchProfile, paper: { title: string; abstract?: string | null }) {
  const text = ` ${normalized(`${paper.title} ${paper.abstract ?? ""}`)} `;
  const matches = profile.topics.flatMap((topic) => {
    const keywords = topic.keywords.filter((word) => text.includes(` ${normalized(word)} `) ||
      text.includes(` ${normalized(word)}s `) || text.includes(` ${normalized(word)},`) ||
      text.includes(` ${normalized(word)}.`));
    return keywords.length ? [{ ...topic, matches: keywords }] : [];
  });
  const primary = matches.sort((a, b) =>
    Number(b.kind === "core") - Number(a.kind === "core") ||
    b.weight * b.matches.length - a.weight * a.matches.length || a.id.localeCompare(b.id),
  )[0];
  if (!primary) return { score: 0, kind: "none" as const, topicId: null, reasons: [] as string[], seed: null };
  const score = Math.min(1, (primary.kind === "core" ? 0.6 : 0.35) * primary.weight +
    Math.min(0.25, primary.matches.length * 0.08));
  const seed = profile.seeds.find((entry) => entry.topicId === primary.id) ?? null;
  return {
    score, kind: primary.kind, topicId: primary.id,
    reasons: [`${primary.kind === "core" ? "课题匹配" : "相邻方向"}：${primary.label}（${primary.matches[0]}）`],
    seed,
  };
}
