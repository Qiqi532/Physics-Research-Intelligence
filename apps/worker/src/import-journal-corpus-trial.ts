import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createConnectionProvider } from "@pri/ai";
import {
  createAiRepository,
  createModelSettingsCipher,
  createModelSettingsRepository,
  createPaperRepository,
  createPrismaClient,
  syncPhysicsTags,
} from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { z } from "zod";
import {
  createTaskProviders,
} from "./configured-daily-processor";
import { importJournalCorpus } from "./journal-corpus/importer";
import {
  readJournalCorpusManifest,
  selectJournalCorpusEntries,
} from "./journal-corpus/manifest";
import { runJournalCorpusTrial } from "./journal-corpus/trial";
import { classifyPaper } from "./jobs/classify-paper";
import { interpretPaper } from "./jobs/interpret-paper";
import {
  createRuntimeAiConfigResolver,
  RuntimeAiConfigError,
} from "./runtime-ai-config";

const manifestPath = fileURLToPath(
  new URL("../../../data/journal-corpus/manifest.json", import.meta.url),
);

async function main(): Promise<void> {
  const requestedIds = process.argv.slice(2).filter((value) => value !== "--");
  const config = parseConfig(process.env);
  const client = createPrismaClient(config.DATABASE_URL);

  try {
    const manifest = await readJournalCorpusManifest(manifestPath);
    const entries = selectJournalCorpusEntries(manifest, requestedIds);
    const resolver = createRuntimeAiConfigResolver({
      repository: createModelSettingsRepository(client),
      cipher: createModelSettingsCipher({
        keyFilePath: config.AI_SETTINGS_MASTER_KEY_FILE,
      }),
      environmentConfig: config.AI,
      classifyMaxOutputTokens: config.AI?.classify.maxOutputTokens,
      interpretMaxOutputTokens: config.AI?.interpret.maxOutputTokens,
    });
    const snapshot = await resolver.resolve();
    const classificationProviders = createTaskProviders(
      snapshot.classify,
      createConnectionProvider,
    );
    const interpretationProviders = createTaskProviders(
      snapshot.interpret,
      createConnectionProvider,
    );
    const aiRepository = createAiRepository(client);

    await syncPhysicsTags(client);
    const imported = await importJournalCorpus(
      entries,
      createPaperRepository(client),
      new Date(),
    );
    const trial = await runJournalCorpusTrial({
      papers: imported.outcomes.flatMap((outcome) =>
        outcome.status === "imported"
          ? [{ arxivId: outcome.arxivId, paperId: outcome.paperId }]
          : []
      ),
      classify: (paperId) => classifyPaper({
        paperId,
        repository: aiRepository,
        primary: classificationProviders.primary,
        fallback: classificationProviders.fallback,
      }),
      interpret: (paperId) => interpretPaper({
        paperId,
        repository: aiRepository,
        primary: interpretationProviders.primary,
        fallback: interpretationProviders.fallback,
      }),
    });
    const failed = imported.summary.failed > 0
      || trial.summary.classificationComplete !== trial.summary.total
      || trial.summary.interpretationComplete !== trial.summary.total;

    console.info(JSON.stringify(toLogSafeData({
      event: "journal_corpus.trial",
      status: failed ? "failed" : "complete",
      import: imported,
      ai: trial,
    })));
    if (failed) process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "journal_corpus.trial",
    status: "failed",
    errorCode: trialErrorCode(error),
  }));
  process.exitCode = 1;
});

function trialErrorCode(error: unknown): string {
  if (error instanceof RuntimeAiConfigError) return error.code;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return "journal_corpus_input_invalid";
  }
  if (error instanceof Error && error.message.startsWith("Unknown journal corpus")) {
    return "journal_corpus_input_invalid";
  }
  return "journal_corpus_trial_failed";
}
