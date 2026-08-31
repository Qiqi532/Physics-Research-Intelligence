import type { PaperRepository } from "@pri/db";
import {
  toPaperSourceInput,
  type ReviewCorpusManifest,
} from "./manifest";

type CorpusRepository = Pick<PaperRepository, "upsertFromSource">;

type ImportOutcome =
  | { arxivId: string; status: "imported"; paperId: string }
  | { arxivId: string; status: "failed"; errorCode: "repository_write_failed" };

export type ReviewCorpusImportResult = {
  outcomes: ImportOutcome[];
  summary: { total: number; imported: number; failed: number };
};

export async function importReviewCorpus(
  manifest: ReviewCorpusManifest,
  repository: CorpusRepository,
): Promise<ReviewCorpusImportResult> {
  const outcomes: ImportOutcome[] = [];

  for (const entry of manifest.papers) {
    try {
      const { paper } = await repository.upsertFromSource(toPaperSourceInput(entry));
      outcomes.push({ arxivId: entry.arxivId, status: "imported", paperId: paper.id });
    } catch {
      outcomes.push({
        arxivId: entry.arxivId,
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
