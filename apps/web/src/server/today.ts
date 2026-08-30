import {
  createPrismaClient,
  createTodayRepository,
  type TodayData,
  type TodayRecommendation,
  type TodayRepository,
} from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { normalizeDoi } from "@pri/domain/paper";
import type { ApiResult } from "./papers";
import type { TodayDto, TodayLoadState } from "@/presentation/today";

const READING_STATUSES = new Set([
  "UNREAD",
  "SAVED",
  "READING",
  "COMPLETE",
  "SKIPPED",
]);
const FEEDBACK_VALUES = new Set(["NONE", "LIKE", "DISLIKE"]);
const STATE_KEYS = new Set(["status", "feedback", "note"]);

type TodayApiOptions = {
  logError?: (error: unknown) => void;
  now?: () => Date;
};

export function createTodayApi(
  repository: TodayRepository,
  options: TodayApiOptions = {},
) {
  const logError = options.logError ?? (() => undefined);
  const now = options.now ?? (() => new Date());

  return {
    async get(): Promise<ApiResult> {
      try {
        const today = await repository.getToday({
          userId: "default",
          now: now(),
          candidateLimit: 50,
        });
        return { status: 200, body: toTodayDto(today) };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },

    async updateState(rawDoi: string, body: unknown): Promise<ApiResult> {
      let doi: string;
      try {
        doi = normalizeDoi(decodeURIComponent(rawDoi));
      } catch {
        return invalidStateResult();
      }
      const input = parseStateInput(body);
      if (!input) {
        return invalidStateResult();
      }

      try {
        const result = await repository.setPaperStateByDoi({
          userId: "default",
          doi,
          ...input,
        });
        if (result.status === "not_found") {
          return { status: 404, body: { error: "Paper not found" } };
        }
        return {
          status: 200,
          body: {
            state: {
              ...result.state,
              updatedAt: result.state.updatedAt.toISOString(),
            },
          },
        };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },
  };
}

export async function withConfiguredTodayApi(
  operation: (api: ReturnType<typeof createTodayApi>) => Promise<ApiResult>,
): Promise<ApiResult> {
  let client: ReturnType<typeof createPrismaClient> | undefined;

  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    const repository = createTodayRepository(client);
    const api = createTodayApi(repository, {
      logError: (error) => {
        console.error(
          "Today repository request failed",
          toLogSafeData({ DATABASE_URL: config.DATABASE_URL, error }),
        );
      },
    });
    return await operation(api);
  } catch (error) {
    console.error(
      "Today API initialization failed",
      toLogSafeData({ DATABASE_URL: process.env.DATABASE_URL, error }),
    );
    return unavailableResult();
  } finally {
    await client?.$disconnect();
  }
}

export async function loadTodayPageState(): Promise<TodayLoadState> {
  const result = await withConfiguredTodayApi((api) => api.get());
  return result.status === 200
    ? { kind: "ready", data: result.body as TodayDto }
    : { kind: "error" };
}

function parseStateInput(body: unknown): {
  status: "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
  feedback: "NONE" | "LIKE" | "DISLIKE";
  note: string | null;
} | null {
  if (!isRecord(body) || Object.keys(body).some((key) => !STATE_KEYS.has(key))) {
    return null;
  }
  if (typeof body.status !== "string" || !READING_STATUSES.has(body.status)) {
    return null;
  }
  const feedback = body.feedback ?? "NONE";
  if (typeof feedback !== "string" || !FEEDBACK_VALUES.has(feedback)) {
    return null;
  }
  const note = body.note ?? null;
  if (note !== null && (typeof note !== "string" || note.length > 4_000)) {
    return null;
  }
  return {
    status: body.status as "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED",
    feedback: feedback as "NONE" | "LIKE" | "DISLIKE",
    note,
  };
}

function toTodayDto(today: TodayData): TodayDto {
  return {
    generatedAt: today.generatedAt.toISOString(),
    stats: today.stats,
    crossSignals: today.crossSignals,
    recommendations: today.recommendations.map(toRecommendationDto),
    readingQueue: today.readingQueue.map(toRecommendationDto),
  };
}

function toRecommendationDto(paper: TodayRecommendation) {
  return {
    id: paper.id,
    doi: paper.doi,
    title: paper.title,
    journal: paper.journal,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
    originalUrl: paper.originalUrl,
    accessStatus: paper.accessStatus,
    sourceName: paper.sourceName,
    tags: paper.tags,
    readingStatus: paper.readingStatus,
    feedback: paper.feedback,
    hasInterpretation: paper.hasInterpretation,
    score: paper.score,
    scoreBreakdown: paper.scoreBreakdown,
    reasons: paper.reasons,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidStateResult(): ApiResult {
  return { status: 400, body: { error: "Invalid paper state" } };
}

function unavailableResult(): ApiResult {
  return {
    status: 503,
    body: { error: "Today data is temporarily unavailable" },
  };
}
