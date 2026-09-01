import type { PaperRepository } from "@pri/db";
import {
  toJournalPaperSourceInput,
  type JournalCorpusEntry,
} from "./manifest";

type CorpusRepository = Pick<PaperRepository, "upsertFromSource">;

type ImportOutcome =
  | { arxivId: string; status: "imported"; paperId: string }
  | { arxivId: string; status: "failed"; errorCode: "repository_write_failed" };

export type JournalCorpusImportResult = {
  outcomes: ImportOutcome[];
  summary: { total: number; imported: number; failed: number };
};

export async function importJournalCorpus(
  entries: readonly JournalCorpusEntry[],
  repository: CorpusRepository,
  retrievedAt: Date,
): Promise<JournalCorpusImportResult> {
  const outcomes: ImportOutcome[] = [];

  for (const entry of entries) {
    try {
      const { paper } = await repository.upsertFromSource(
        toJournalPaperSourceInput(entry, retrievedAt),
      );
      outcomes.push({
        arxivId: entry.arxiv_id,
        status: "imported",
        paperId: paper.id,
      });
    } catch {
      outcomes.push({
        arxivId: entry.arxiv_id,
        status: "failed",
        errorCode: "repository_write_failed",
      });
    }
  }

  const imported = outcomes.filter(({ status }) => status === "imported").length;
  return {
    outcomes,
    summary: {
      total: outcomes.length,
      imported,
      failed: outcomes.length - imported,
    },
  };
}
