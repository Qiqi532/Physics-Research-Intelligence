import {
  createConnectionProvider,
  type ConnectionProviderInput,
} from "@pri/ai";
import {
  createAiRepository,
  createModelSettingsCipher,
  createModelSettingsRepository,
  createPaperRepository,
  createPrismaClient,
  createSourceSyncRepository,
  createTodayRepository,
} from "@pri/db";
import type { ServerConfig } from "@pri/domain/config";
import {
  rankRecommendations,
  selectDailyPapers,
} from "@pri/recommendation/score";
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
import {
  createRuntimeAiConfigResolver,
  type ResolvedAiConnection,
  type RuntimeAiConfigResolver,
  type RuntimeAiTaskRoute,
} from "./runtime-ai-config";

export type DailySelectionPool = {
  interests: Record<string, number>;
  candidates: Array<{
    id: string;
    publishedAt: Date | null;
    classifications: Array<{
      tagSlug: string;
      relevance: number;
      isCrossDisciplinary: boolean;
    }>;
  }>;
};

export function buildDailySelection(input: {
  pool: DailySelectionPool;
  now: Date;
  minCount: number;
  maxCount: number;
  perDirectionCap: number;
}): { paperIds: string[]; candidateCount: number } {
  const rankedById = new Map(
    rankRecommendations(
      input.pool.candidates.map((candidate) => ({
        paperId: candidate.id,
        publishedAt: candidate.publishedAt,
        classifications: candidate.classifications.map((classification) => ({
          tagSlug: classification.tagSlug,
          tagLabel: classification.tagSlug,
          relevance: classification.relevance,
          isCrossDisciplinary: classification.isCrossDisciplinary,
        })),
        interests: input.pool.interests,
        readingStatus: "UNREAD" as const,
        feedback: "NONE" as const,
        hasInterpretation: false,
      })),
      input.now,
    ).map((ranked) => [ranked.paperId, ranked]),
  );
  const scoredCandidates = input.pool.candidates.map((candidate) => ({
    paperId: candidate.id,
    publishedAt: candidate.publishedAt,
    score: rankedById.get(candidate.id)?.total ?? 0,
    tags: candidate.classifications.map((classification) => ({
      tagSlug: classification.tagSlug,
      relevance: classification.relevance,
    })),
  }));
  const paperIds = selectDailyPapers({
    candidates: scoredCandidates,
    minCount: input.minCount,
    maxCount: input.maxCount,
    perDirectionCap: input.perDirectionCap,
  });
  return { paperIds, candidateCount: scoredCandidates.length };
}

export function perDirectionCapFor(maxCount: number): number {
  return Math.max(1, Math.ceil(maxCount / 3));
}

export function retentionCutoffAt(until: Date, retentionDays: number): Date {
  return new Date(until.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

export function createConfiguredDailyProcessor(
  config: ServerConfig,
  options: {
    resolver?: RuntimeAiConfigResolver;
    createProvider?: typeof createConnectionProvider;
  } = {},
) {
  const client = createPrismaClient(config.DATABASE_URL);
  const paperRepository = createPaperRepository(client);
  const stateRepository = createSourceSyncRepository(client);
  const aiRepository = createAiRepository(client);
  const todayRepository = createTodayRepository(client);
  const resolver = options.resolver ?? createRuntimeAiConfigResolver({
    repository: createModelSettingsRepository(client),
    cipher: createModelSettingsCipher({ keyFilePath: config.AI_SETTINGS_MASTER_KEY_FILE }),
    environmentConfig: config.AI,
    classifyMaxOutputTokens: config.AI?.classify.maxOutputTokens,
    interpretMaxOutputTokens: config.AI?.interpret.maxOutputTokens,
  });
  const createProvider = options.createProvider ?? createConnectionProvider;
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
      const snapshot = await resolver.resolve();
      const classificationProviders = createTaskProviders(
        snapshot.classify,
        createProvider,
      );
      const interpretationProviders = createTaskProviders(
        snapshot.interpret,
        createProvider,
      );
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
          });
          return outcome.status;
        },
        async listInterpretationPaperIds(input) {
          const pool = await aiRepository.listDailySelectionCandidates({
            from: input.from,
            until: input.until,
            limit: 500,
          });
          const selection = buildDailySelection({
            pool,
            now: input.until,
            minCount: config.DAILY_PAPER_TARGET_MIN,
            maxCount: config.DAILY_PAPER_TARGET_MAX,
            perDirectionCap: perDirectionCapFor(config.DAILY_PAPER_TARGET_MAX),
          });
          return selection.paperIds;
        },
        async interpret(paperId) {
          const outcome = await interpretPaper({
            paperId,
            repository: aiRepository,
            primary: interpretationProviders.primary,
            fallback: interpretationProviders.fallback,
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
        async pruneExpired(input) {
          try {
            const cutoff = retentionCutoffAt(input.until, config.PAPER_RETENTION_DAYS);
            const outcome = await paperRepository.pruneExpiredPapers({ cutoff });
            return { status: "ok", deleted: outcome.deleted };
          } catch {
            return { status: "failed", errorCode: "retention_cleanup_failed" };
          }
        },

      });
    },
    close: () => client.$disconnect(),
  };
}

export function createTaskProviders(
  route: RuntimeAiTaskRoute,
  createProvider: typeof createConnectionProvider,
) {
  return {
    primary: createProvider(providerInput(route.primary, route.maxOutputTokens)),
    ...(route.fallback
      ? { fallback: createProvider(providerInput(route.fallback, route.maxOutputTokens)) }
      : {}),
  };
}

function providerInput(
  connection: ResolvedAiConnection,
  maxOutputTokens: number,
): ConnectionProviderInput {
  return {
    provider: connection.provider,
    model: connection.model,
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    requestTimeoutMs: connection.requestTimeoutMs,
    maxOutputTokens,
  };
}
