import { readFile } from "node:fs/promises";
import { paperSourceInputSchema, type PaperSourceInput } from "@pri/domain/paper";
import { PHYSICS_TAG_SLUGS } from "@pri/domain/physics-tags";
import { z } from "zod";

export const maximumReviewPdfBytes = 50 * 1024 * 1024;

const arxivIdPattern = /^\d{4}\.\d{4,5}$/u;
const pdfFilePattern = /^[A-Za-z0-9._-]+\.pdf$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const httpsUrlSchema = z.string().url().refine((value) => new URL(value).protocol === "https:", {
  message: "URL must use HTTPS",
});

const entrySchema = z.object({
  reviewTargetTag: z.enum(PHYSICS_TAG_SLUGS),
  arxivId: z.string().regex(arxivIdPattern),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  abstract: z.string().trim().min(1),
  submittedAt: z.iso.datetime(),
  doi: z.string().trim().min(1).nullable(),
  primaryCategory: z.string().trim().min(1),
  abstractUrl: httpsUrlSchema.refine(isCanonicalArxivAbstractUrl, {
    message: "abstractUrl must be a canonical arXiv abstract URL",
  }),
  pdfUrl: httpsUrlSchema.refine(isCanonicalArxivPdfUrl, {
    message: "pdfUrl must be a canonical arXiv PDF URL",
  }),
  licenseUrl: httpsUrlSchema.refine(isApprovedLicenseUrl, {
    message: "licenseUrl must use an approved official host",
  }).nullable(),
  retrievedAt: z.iso.datetime(),
  pdfFile: z.string().regex(pdfFilePattern),
  sha256: z.string().regex(sha256Pattern),
  bytes: z.number().int().positive().max(maximumReviewPdfBytes),
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  papers: z.array(entrySchema).length(PHYSICS_TAG_SLUGS.length),
}).strict().superRefine((manifest, context) => {
  reportDuplicate(
    manifest.papers.map(({ arxivId }) => arxivId),
    "duplicate arXiv id",
    context,
  );
  reportDuplicate(
    manifest.papers.map(({ pdfFile }) => pdfFile),
    "duplicate PDF filename",
    context,
  );

  const expectedTags = new Set<string>(PHYSICS_TAG_SLUGS);
  const actualTags = new Set<string>(
    manifest.papers.map(({ reviewTargetTag }) => reviewTargetTag),
  );
  if (
    actualTags.size !== expectedTags.size ||
    [...expectedTags].some((tag) => !actualTags.has(tag))
  ) {
    context.addIssue({
      code: "custom",
      path: ["papers"],
      message: "Manifest tag coverage must contain every physics tag exactly once",
    });
  }
});

export type ReviewCorpusEntry = z.infer<typeof entrySchema>;
export type ReviewCorpusManifest = z.infer<typeof manifestSchema>;

export function parseReviewCorpusManifest(value: unknown): ReviewCorpusManifest {
  return manifestSchema.parse(value);
}

export async function readReviewCorpusManifest(path: string): Promise<ReviewCorpusManifest> {
  return parseReviewCorpusManifest(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function toPaperSourceInput(entry: ReviewCorpusEntry): PaperSourceInput {
  return paperSourceInputSchema.parse({
    doi: entry.doi ?? undefined,
    sourceName: "arxiv",
    sourceRecordId: entry.arxivId,
    sourceUrl: entry.abstractUrl,
    licenseUrl: entry.licenseUrl,
    retrievedAt: new Date(entry.retrievedAt),
    title: entry.title,
    abstract: entry.abstract,
    journal: `arXiv:${entry.primaryCategory}`,
    firstAuthor: entry.authors[0],
    publishedAt: new Date(entry.submittedAt),
    originalUrl: entry.abstractUrl,
    accessStatus: "OPEN",
  });
}

function isCanonicalArxivAbstractUrl(value: string): boolean {
  const url = new URL(value);
  return url.hostname === "arxiv.org" && arxivPathMatches(url.pathname, "/abs/");
}

function isCanonicalArxivPdfUrl(value: string): boolean {
  const url = new URL(value);
  return ["arxiv.org", "export.arxiv.org"].includes(url.hostname) &&
    arxivPathMatches(url.pathname.replace(/\.pdf$/u, ""), "/pdf/");
}

function arxivPathMatches(pathname: string, prefix: string): boolean {
  return pathname.startsWith(prefix) && arxivIdPattern.test(pathname.slice(prefix.length));
}

function isApprovedLicenseUrl(value: string): boolean {
  return ["arxiv.org", "creativecommons.org"].includes(new URL(value).hostname);
}

function reportDuplicate(
  values: readonly string[],
  message: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path: ["papers"], message });
  }
}
