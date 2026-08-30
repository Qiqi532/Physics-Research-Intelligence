import {
  createInterestRepository,
  createPrismaClient,
  type InterestRepository,
} from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import {
  MAX_INTEREST_REQUEST_BYTES,
  parseInterestUpdate,
} from "@pri/domain/interests";
import type { ApiResult } from "./papers";

export type InterestPageState =
  | { kind: "ready"; tags: Awaited<ReturnType<InterestRepository["list"]>> }
  | { kind: "error" };

type InterestApiOptions = {
  logError?: (error: unknown) => void;
};

export function createInterestApi(
  repository: InterestRepository,
  options: InterestApiOptions = {},
) {
  const logError = options.logError ?? (() => undefined);
  return {
    async get(): Promise<ApiResult> {
      try {
        return { status: 200, body: { tags: await repository.list("default") } };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },

    async update(body: unknown, requestBytes?: number): Promise<ApiResult> {
      if (requestBytes !== undefined && requestBytes > MAX_INTEREST_REQUEST_BYTES) {
        return {
          status: 413,
          body: { error: "Interest settings request is too large" },
        };
      }
      let input;
      try {
        input = parseInterestUpdate(body);
      } catch {
        return invalidResult();
      }

      try {
        const tags = await repository.list("default");
        const knownSlugs = new Set(tags.map(({ slug }) => slug));
        if (input.interests.some(({ tagSlug }) => !knownSlugs.has(tagSlug))) {
          return invalidResult();
        }
        await repository.replace("default", input.interests);
        return { status: 200, body: { tags: await repository.list("default") } };
      } catch (error) {
        logError(error);
        return unavailableResult();
      }
    },
  };
}

export async function withConfiguredInterestApi(
  operation: (api: ReturnType<typeof createInterestApi>) => Promise<ApiResult>,
): Promise<ApiResult> {
  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    return await operation(createInterestApi(createInterestRepository(client), {
      logError: (error) => console.error(
        "Interest repository request failed",
        toLogSafeData({ DATABASE_URL: config.DATABASE_URL, error }),
      ),
    }));
  } catch (error) {
    console.error(
      "Interest API initialization failed",
      toLogSafeData({ DATABASE_URL: process.env.DATABASE_URL, error }),
    );
    return unavailableResult();
  } finally {
    await client?.$disconnect();
  }
}

export async function loadInterestPageState(): Promise<InterestPageState> {
  const result = await withConfiguredInterestApi((api) => api.get());
  if (result.status !== 200) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    tags: (result.body as { tags: Awaited<ReturnType<InterestRepository["list"]>> }).tags,
  };
}

function invalidResult(): ApiResult {
  return { status: 400, body: { error: "Invalid interest settings" } };
}

function unavailableResult(): ApiResult {
  return {
    status: 503,
    body: { error: "Interest settings are temporarily unavailable" },
  };
}
