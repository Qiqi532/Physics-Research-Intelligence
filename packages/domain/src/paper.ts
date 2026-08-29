import { z } from "zod";

const doiPattern = /^10\.\d{4,9}\/\S+$/u;
const doiPrefixPattern = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/iu;
const punctuationAndSymbolsPattern = /[\p{P}\p{S}]+/gu;
const duplicateTitleThreshold = 0.85;
const duplicateDateWindowMs = 7 * 24 * 60 * 60 * 1_000;

export const paperSourceInputSchema = z.object({
  doi: z.string().trim().min(1).optional(),
  sourceName: z.string().trim().min(1),
  sourceRecordId: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  licenseUrl: z.string().url().nullable().optional(),
  retrievedAt: z.date(),
  title: z.string().trim().min(1),
  abstract: z.string().trim().min(1).nullable().optional(),
  journal: z.string().trim().min(1).nullable().optional(),
  firstAuthor: z.string().trim().min(1).nullable().optional(),
  publishedAt: z.date().nullable().optional(),
  originalUrl: z.string().url().nullable().optional(),
  accessStatus: z.enum(["UNKNOWN", "OPEN", "RESTRICTED"]).default("UNKNOWN"),
});

export type PaperSourceInput = z.infer<typeof paperSourceInputSchema>;

export type DuplicateCandidateInput = {
  id: string;
  title: string;
  firstAuthor: string;
  publishedAt: Date;
};

export type DuplicateCandidate = {
  id: string;
  titleSimilarity: number;
};

export function normalizeDoi(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(doiPrefixPattern, "")
    .trim()
    .toLocaleLowerCase("en-US");

  if (!doiPattern.test(normalized)) {
    throw new Error(`Invalid DOI: ${value}`);
  }

  return normalized;
}

export function normalizeTitle(value: string): string {
  return normalizeWords(value);
}

export function normalizeAuthor(value: string): string {
  return normalizeWords(value);
}

export function findDuplicateCandidates(
  incoming: Omit<DuplicateCandidateInput, "id">,
  existing: readonly DuplicateCandidateInput[],
): DuplicateCandidate[] {
  const incomingAuthor = normalizeAuthor(incoming.firstAuthor);

  return existing
    .map((candidate) => ({
      candidate,
      titleSimilarity: tokenJaccardSimilarity(incoming.title, candidate.title),
    }))
    .filter(
      ({ candidate, titleSimilarity }) =>
        titleSimilarity >= duplicateTitleThreshold &&
        normalizeAuthor(candidate.firstAuthor) === incomingAuthor &&
        Math.abs(candidate.publishedAt.getTime() - incoming.publishedAt.getTime()) <=
          duplicateDateWindowMs,
    )
    .sort((left, right) => right.titleSimilarity - left.titleSimilarity)
    .map(({ candidate, titleSimilarity }) => ({
      id: candidate.id,
      titleSimilarity,
    }));
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(punctuationAndSymbolsPattern, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenJaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeTitle(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersectionSize = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;

  return intersectionSize / unionSize;
}
