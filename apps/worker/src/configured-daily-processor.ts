import {
  createConnectionProvider,
  type ConnectionProviderInput,
} from "@pri/ai";
import { createPrismaClient } from "@pri/db";
import type { ServerConfig } from "@pri/domain/config";
import { rankRecommendations, selectDailyPapers } from "@pri/recommendation/score";
import { runConfiguredResearchDaily, type ResearchDailyOptions } from "./configured-research-daily";
import type { ResolvedAiConnection, RuntimeAiTaskRoute } from "./runtime-ai-config";

export type ScreenedSelectionPool = {
  interests: Record<string, number>;
  candidates: Array<{
    id: string;
    publishedAt: Date | null;
    score: number;
    directionSlug: string;
    selected: boolean;
  }>;
};

/** @deprecated Use ScreenedSelectionPool + buildDailySelectionFromScreening. */
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

/** @deprecated Use buildDailySelectionFromScreening for the screening-based flow. */
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

export function buildDailySelectionFromScreening(input: {
  pool: ScreenedSelectionPool;
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
        classifications: [
          {
            tagSlug: candidate.directionSlug,
            tagLabel: candidate.directionSlug,
            relevance: candidate.score,
            isCrossDisciplinary: false,
          },
        ],
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
    score: rankedById.get(candidate.id)?.total ?? candidate.score,
    tags: [
      {
        tagSlug: candidate.directionSlug,
        relevance: candidate.score,
      },
    ],
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

export async function markDeliveredSelection(input: {
  repository: {
    markScreeningsDelivered(args: {
      paperIds: string[];
      at: Date;
    }): Promise<{ count: number }>;
  };
  paperIds: string[];
  at: Date;
  deliveryRecencyDays: number;
}): Promise<void> {
  if (input.deliveryRecencyDays === 0 || input.paperIds.length === 0) {
    return;
  }
  await input.repository.markScreeningsDelivered({
    paperIds: input.paperIds,
    at: input.at,
  });
}

export function createConfiguredDailyProcessor(config: ServerConfig, options: ResearchDailyOptions = {}) {
  const client = createPrismaClient(config.DATABASE_URL);
  return {
    process: () => runConfiguredResearchDaily(client, config, options),
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
