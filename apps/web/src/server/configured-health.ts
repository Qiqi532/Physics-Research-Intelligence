import { Queue } from "bullmq";
import IORedis from "ioredis";
import { createPrismaClient } from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import { DAILY_QUEUE_NAME } from "@pri/domain/queue";
import { createHealthApi } from "./health";
import type { ApiResult } from "./papers";

export async function withConfiguredHealthApi(
  operation: (api: ReturnType<typeof createHealthApi>) => Promise<ApiResult>,
): Promise<ApiResult> {
  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    const api = createHealthApi({
      async postgres() {
        await client!.$queryRaw`SELECT 1`;
      },
      redis: () => pingRedis(config.REDIS_URL),
      queue: () => inspectQueue(config.REDIS_URL),
    }, { workerRequired: config.DAILY_PIPELINE.enabled });
    return await operation(api);
  } catch (error) {
    console.error(
      "health.ready.initialization_failed",
      toLogSafeData({
        status: "failed",
        errorCode: "configuration_invalid",
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        error,
      }),
    );
    return {
      status: 503,
      body: {
        status: "not_ready",
        checkedAt: new Date().toISOString(),
        components: {
          configuration: { status: "not_ready", errorCode: "configuration_invalid" },
        },
      },
    };
  } finally {
    await client?.$disconnect();
  }
}

function createHealthRedis(redisUrl: string, workerMode = false): IORedis {
  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: workerMode ? null : 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  return redis;
}

async function pingRedis(redisUrl: string): Promise<void> {
  const redis = createHealthRedis(redisUrl);
  try {
    await redis.connect();
    const response = await redis.ping();
    if (response !== "PONG") {
      throw new Error("redis_unexpected_response");
    }
  } finally {
    redis.disconnect();
  }
}

async function inspectQueue(redisUrl: string) {
  const connection = createHealthRedis(redisUrl, true);
  const queue = new Queue(DAILY_QUEUE_NAME, { connection });
  try {
    await connection.connect();
    const [counts, workers] = await Promise.all([
      queue.getJobCounts("waiting", "failed"),
      queue.getWorkers(),
    ]);
    return {
      waiting: counts.waiting ?? 0,
      failed: counts.failed ?? 0,
      workerCount: workers.length,
    };
  } finally {
    await queue.close();
    connection.disconnect();
  }
}
