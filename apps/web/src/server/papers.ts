import {
  createPaperRepository,
  createPrismaClient,
  type PaperDetails,
  type PaperRepository,
  type PaperSummary,
} from "@pri/db";
import { interpretationOutputSchema } from "@pri/ai/schemas";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { normalizeDoi } from "@pri/domain/paper";
import type { PaperDetailDto, PaperDetailLoadState } from "@/presentation/paper";

export type ApiResult = {
  status: number;
  body: unknown;
};

type PaperApiOptions = {
  logError?: (error: unknown) => void;
};

export function createPaperApi(
  repository: PaperRepository,
  options: PaperApiOptions = {},
) {
  const logError = options.logError ?? (() => undefined);

  return {
    async list(searchParams: URLSearchParams): Promise<ApiResult> {
      const parsed = parseListInput(searchParams);

      if (!parsed.ok) {
        return { status: 400, body: { error: parsed.error } };
      }

      try {
        const page = await repository.list(parsed.value);
        return {
          status: 200,
          body: {
            items: page.items.map(toPaperDto),
            nextCursor: page.nextCursor,
          },
        };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },

    async detail(rawDoi: string): Promise<ApiResult> {
      let doi: string;

      try {
        doi = normalizeDoi(decodeURIComponent(rawDoi));
      } catch {
        return { status: 400, body: { error: "Invalid DOI" } };
      }

      try {
        const paper = await repository.findByDoi(doi);

        if (!paper) {
          return { status: 404, body: { error: "Paper not found" } };
        }

        return { status: 200, body: toPaperDetailsDto(paper) };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },
  };
}

export async function withConfiguredPaperApi(
  operation: (api: ReturnType<typeof createPaperApi>) => Promise<ApiResult>,
): Promise<ApiResult> {
  let client: ReturnType<typeof createPrismaClient> | undefined;

  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    const repository = createPaperRepository(client);
    const api = createPaperApi(repository, {
      logError: (error) => {
        console.error(
          "Paper repository request failed",
          toLogSafeData({ DATABASE_URL: config.DATABASE_URL, error }),
        );
      },
    });

    return await operation(api);
  } catch (error) {
    console.error(
      "Paper API initialization failed",
      toLogSafeData({ DATABASE_URL: process.env.DATABASE_URL, error }),
    );
    return unavailableResult();
  } finally {
    await client?.$disconnect();
  }
}

function parseListInput(searchParams: URLSearchParams):
  | { ok: true; value: { limit: number; cursor?: string } }
  | { ok: false; error: string } {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "limit must be an integer from 1 to 100" };
  }

  const cursor = searchParams.get("cursor") ?? undefined;

  if (cursor && !isUuid(cursor)) {
    return { ok: false, error: "cursor must be a UUID" };
  }

  return { ok: true, value: cursor ? { limit, cursor } : { limit } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function toPaperDto(paper: PaperSummary) {
  return {
    id: paper.id,
    doi: paper.doi,
    title: paper.title,
    abstract: paper.abstract,
    journal: paper.journal,
    firstAuthor: paper.firstAuthor,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
    originalUrl: paper.originalUrl,
    accessStatus: paper.accessStatus,
    createdAt: paper.createdAt.toISOString(),
    updatedAt: paper.updatedAt.toISOString(),
  };
}

function toPaperDetailsDto(paper: PaperDetails) {
  const interpretation = toInterpretationDto(paper.interpretation);
  return {
    ...toPaperDto(paper),
    sources: paper.sources.map((source) => ({
      ...source,
      retrievedAt: source.retrievedAt.toISOString(),
    })),
    tags: paper.tags,
    interpretation,
    userState: paper.userState
      ? {
          ...paper.userState,
          favoritedAt: paper.userState.favoritedAt?.toISOString() ?? null,
          updatedAt: paper.userState.updatedAt.toISOString(),
        }
      : null,
  };
}

export async function loadPaperDetailState(rawDoi: string): Promise<PaperDetailLoadState> {
  const result = await withConfiguredPaperApi((api) => api.detail(rawDoi));
  if (result.status === 404) {
    return { kind: "not_found" };
  }
  return result.status === 200
    ? { kind: "ready", data: result.body as PaperDetailDto }
    : { kind: "error" };
}

function toInterpretationDto(interpretation: PaperDetails["interpretation"]) {
  if (!interpretation) {
    return null;
  }
  const parsed = interpretationOutputSchema.safeParse(interpretation.content);
  if (!parsed.success) {
    return { status: "unavailable" as const };
  }
  return {
    status: "complete" as const,
    ...parsed.data,
    provider: interpretation.provider,
    model: interpretation.model,
    promptVersion: interpretation.promptVersion,
    createdAt: interpretation.createdAt.toISOString(),
  };
}

function unavailableResult(): ApiResult {
  return {
    status: 503,
    body: { error: "Paper data is temporarily unavailable" },
  };
}
