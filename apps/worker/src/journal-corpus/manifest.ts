import { readFile } from "node:fs/promises";
import {
  paperSourceInputSchema,
  type PaperSourceInput,
} from "@pri/domain/paper";
import { z } from "zod";

const maximumJournalPdfBytes = 50 * 1024 * 1024;
const arxivIdPattern = /^\d{4}\.\d{4,5}v\d+$/u;
const pdfFilePattern = /^[A-Za-z0-9._-]+\.pdf$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const journalCorpusEntrySchema = z.object({
  arxiv_id: z.string().regex(arxivIdPattern),
  journal: z.string().trim().min(1),
  title: z.string().trim().min(1),
  journal_ref: z.string().trim().min(1).nullable(),
  doi: z.string().trim().min(1).nullable(),
  published: z.iso.datetime(),
  authors: z.array(z.string().trim().min(1)).min(1),
  primary_category: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  abstract: z.string().trim().min(1),
  pdf_file: z.string().regex(pdfFilePattern),
  pdf_size: z.number().int().positive().max(maximumJournalPdfBytes),
  pdf_sha256: z.string().regex(sha256Pattern),
  source: z.literal("arxiv"),
  license_note: z.string().trim().min(1),
}).strict();

const journalCorpusManifestSchema = z.array(journalCorpusEntrySchema)
  .min(1)
  .superRefine((entries, context) => {
    reportDuplicate(
      entries.map(({ arxiv_id }) => arxiv_id),
      "duplicate arXiv id",
      context,
    );
    reportDuplicate(
      entries.map(({ pdf_file }) => pdf_file),
      "duplicate PDF filename",
      context,
    );
  });

const requestedIdsSchema = z.array(z.string().regex(arxivIdPattern))
  .min(1, { message: "Select at least one arXiv id" })
  .max(3, { message: "Select at most three arXiv ids" })
  .superRefine((ids, context) => {
    reportDuplicate(ids, "duplicate requested arXiv id", context);
  });

export type JournalCorpusEntry = z.infer<typeof journalCorpusEntrySchema>;

export function parseJournalCorpusManifest(value: unknown): JournalCorpusEntry[] {
  return journalCorpusManifestSchema.parse(value);
}

export async function readJournalCorpusManifest(
  path: string,
): Promise<JournalCorpusEntry[]> {
  return parseJournalCorpusManifest(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
}

export function selectJournalCorpusEntries(
  manifest: readonly JournalCorpusEntry[],
  requestedIds: readonly string[],
): JournalCorpusEntry[] {
  const ids = requestedIdsSchema.parse([...requestedIds]);
  const entriesById = new Map(manifest.map((entry) => [entry.arxiv_id, entry]));

  return ids.map((id) => {
    const entry = entriesById.get(id);
    if (!entry) {
      throw new Error(`Unknown journal corpus arXiv id: ${id}`);
    }
    return entry;
  });
}

export function toJournalPaperSourceInput(
  entry: JournalCorpusEntry,
  retrievedAt: Date,
): PaperSourceInput {
  const sourceUrl = `https://arxiv.org/abs/${entry.arxiv_id}`;
  return paperSourceInputSchema.parse({
    doi: entry.doi ?? undefined,
    sourceName: "arxiv",
    sourceRecordId: entry.arxiv_id,
    sourceUrl,
    licenseUrl: undefined,
    retrievedAt,
    title: entry.title,
    abstract: entry.abstract,
    journal: entry.journal,
    firstAuthor: entry.authors[0],
    publishedAt: new Date(entry.published),
    originalUrl: sourceUrl,
    accessStatus: "UNKNOWN",
  });
}

function reportDuplicate(
  values: readonly string[],
  message: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message });
  }
}
