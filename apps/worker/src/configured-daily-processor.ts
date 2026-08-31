import { createConfiguredTaskProviders, type AiPrices } from "@pri/ai";
import {
  createAiRepository,
  createPaperRepository,
  createPrismaClient,
  createSourceSyncRepository,
  createTodayRepository,
} from "@pri/db";
import type { ServerConfig } from "@pri/domain/config";
import {
  createArxivConnector,
  createCrossrefConnector,
  createOpenAlexConnector,
  type SourceConnector,
} from "@pri/sources";
import { runDailyPipeline } from "./daily-pipeline";
import { classifyPaper } from "./jobs/classify-paper";
import { ingestSources } from "./jobs/ingest-source";
import { interpretPaper } from "./jobs/interpret-paper";
import { dailyWindowAt } from "./scheduler";

export function createConfiguredDailyProcessor(config: ServerConfig) {
  if (!config.AI) {
    throw new Error("Daily pipeline requires AI classification configuration");
  }
  const aiConfig = config.AI;
  const client = createPrismaClient(config.DATABASE_URL);
  const paperRepository = createPaperRepository(client);
  const stateRepository = createSourceSyncRepository(client);
  const aiRepository = createAiRepository(client);
  const todayRepository = createTodayRepository(client);
  const classificationProviders = createConfiguredTaskProviders({
    config: aiConfig,
    task: "classify",
  });
  const interpretationProviders = createConfiguredTaskProviders({
    config: aiConfig,
    task: "interpret",
  });
  const prices = Object.fromEntries(
    Object.entries(aiConfig.providers).map(([provider, providerConfig]) => [
      provider,
      {
        inputCostPerMillionUsd: providerConfig!.inputCostPerMillionUsd,
        outputCostPerMillionUsd: providerConfig!.outputCostPerMillionUsd,
      } satisfies AiPrices,
    ]),
  );
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

  return {
    async process() {
      const window = dailyWindowAt(
        new Date(),
        config.DAILY_PIPELINE.timezone,
        config.DAILY_PIPELINE.time,
      );
      return runDailyPipeline({
        window,
        async ingest(input) {
          const outcomes = await ingestSources({
            connectors,
            paperRepository,
            stateRepository,
            from: input.from,
            until: input.until,
          });
          if (outcomes.every((outcome) => !outcome.ok)) {
            return { status: "failed", errorCode: "all_sources_failed" };
          }
          return {
            status: "complete",
            records: outcomes.reduce(
              (total, outcome) => total + (outcome.ok ? outcome.summary.records : 0),
              0,
            ),
          };
        },
        listPaperIds: (input) => aiRepository.listPaperIdsForClassification({
          from: input.from,
          until: input.until,
          limit: 500,
        }),
        async classify(paperId) {
          const outcome = await classifyPaper({
            paperId,
            repository: aiRepository,
            primary: classificationProviders.primary,
            fallback: classificationProviders.fallback,
            prices,
          });
          return outcome.status;
        },
        listInterpretationPaperIds: (input) =>
          aiRepository.listPaperIdsForInterpretation({
            from: input.from,
            until: input.until,
            limit: 500,
          }),
        async interpret(paperId) {
          const outcome = await interpretPaper({
            paperId,
            repository: aiRepository,
            primary: interpretationProviders.primary,
            fallback: interpretationProviders.fallback,
            prices,
            dailyBudgetUsd: config.DAILY_AI_BUDGET_USD,
            maxOutputTokens: aiConfig.interpret.maxOutputTokens,
          });
          return outcome.status;
        },
        async prepareToday() {
          const today = await todayRepository.getToday({
            userId: "default",
            now: new Date(),
            candidateLimit: 50,
          });
          return { recommendations: today.recommendations.length };
        },
      });
    },
    close: () => client.$disconnect(),
  };
}
