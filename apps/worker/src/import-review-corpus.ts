import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createPaperRepository, createPrismaClient } from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { importReviewCorpus } from "./review-corpus/importer";
import { readReviewCorpusManifest } from "./review-corpus/manifest";

const manifestPath = fileURLToPath(
  new URL("../../../data/review-corpus/manifest.json", import.meta.url),
);

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const client = createPrismaClient(config.DATABASE_URL);
  try {
    const manifest = await readReviewCorpusManifest(manifestPath);
    const result = await importReviewCorpus(manifest, createPaperRepository(client));
    console.info(JSON.stringify(toLogSafeData({
      event: "review_corpus.import",
      status: result.summary.failed === 0 ? "complete" : "failed",
      ...result,
    })));
    if (result.summary.failed > 0) process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify(toLogSafeData({
    event: "review_corpus.import",
    status: "failed",
    errorCode: "manifest_or_runtime_error",
    error,
  })));
  process.exitCode = 1;
});
