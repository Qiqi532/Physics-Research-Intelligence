import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toLogSafeData } from "@pri/domain/config";
import { downloadCorpusEntry } from "./review-corpus/downloader";
import { readReviewCorpusManifest } from "./review-corpus/manifest";

const manifestPath = fileURLToPath(
  new URL("../../../data/review-corpus/manifest.json", import.meta.url),
);
const corpusDirectory = resolve(dirname(manifestPath), "pdfs");

async function main(): Promise<void> {
  const manifest = await readReviewCorpusManifest(manifestPath);
  const outcomes: Array<{
    arxivId: string;
    status: "downloaded" | "verified" | "failed";
    errorCode?: string;
  }> = [];

  for (const entry of manifest.papers) {
    try {
      outcomes.push(await downloadCorpusEntry(entry, { corpusDirectory }));
    } catch (error) {
      outcomes.push({
        arxivId: entry.arxivId,
        status: "failed",
        errorCode: stableErrorCode(error),
      });
    }
  }

  const failed = outcomes.filter(({ status }) => status === "failed").length;
  console.info(JSON.stringify(toLogSafeData({
    event: "review_corpus.download",
    status: failed === 0 ? "complete" : "failed",
    outcomes,
    summary: { total: outcomes.length, succeeded: outcomes.length - failed, failed },
  })));
  if (failed > 0) process.exitCode = 1;
}

function stableErrorCode(error: unknown): string {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "download_failed";
}

main().catch((error) => {
  console.error(JSON.stringify(toLogSafeData({
    event: "review_corpus.download",
    status: "failed",
    errorCode: "manifest_or_runtime_error",
    error,
  })));
  process.exitCode = 1;
});
