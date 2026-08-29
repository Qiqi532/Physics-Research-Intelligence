import "dotenv/config";
import {
  createPaperRepository,
  createPrismaClient,
  createSourceSyncRepository,
} from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import {
  createArxivConnector,
  createCrossrefConnector,
  createOpenAlexConnector,
} from "@pri/sources";
import type { SourceConnector } from "@pri/sources";
import { ingestSources } from "./jobs/ingest-source";

const oneDayMs = 24 * 60 * 60 * 1_000;

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const until = new Date();
  const from = new Date(until.getTime() - oneDayMs);
  const client = createPrismaClient(config.DATABASE_URL);
  const connectors: SourceConnector[] = [
    createOpenAlexConnector({ apiKey: config.OPENALEX_API_KEY }),
    createArxivConnector(),
  ];
  if (config.CROSSREF_ISSN) {
    connectors.unshift(createCrossrefConnector({
      issn: config.CROSSREF_ISSN,
      contactEmail: config.SOURCE_CONTACT_EMAIL,
    }));
  }

  try {
    const outcomes = await ingestSources({
      connectors,
      paperRepository: createPaperRepository(client),
      stateRepository: createSourceSyncRepository(client),
      from,
      until,
    });

    console.info("Source ingestion completed", toLogSafeData({
      windowFrom: from.toISOString(),
      windowUntil: until.toISOString(),
      outcomes,
    }));
    if (outcomes.some((outcome) => !outcome.ok)) {
      process.exitCode = 1;
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error("Source ingestion failed", toLogSafeData(error));
  process.exitCode = 1;
});
