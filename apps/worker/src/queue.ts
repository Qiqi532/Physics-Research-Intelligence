import type { RedisOptions } from "ioredis";
import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { DAILY_QUEUE_NAME } from "@pri/domain/queue";

export { DAILY_QUEUE_NAME };

export type DailyQueueJob = { version: 1 };

export function boundedRedisRetryDelay(attempt: number): number {
  return Math.min(5_000, 250 * 2 ** Math.max(0, attempt - 1));
}

export function redisConnectionOptions(redisUrl: string): RedisOptions {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis or rediss protocol");
  }
  const databaseText = url.pathname.replace(/^\//u, "") || "0";
  const db = Number(databaseText);
  if (!/^\d+$/u.test(databaseText) || !Number.isInteger(db) || db < 0 || db > 15) {
    throw new Error("REDIS_URL must contain a database number from 0 to 15");
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    db,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: boundedRedisRetryDelay,
  };
}

export function createDailyQueue(redisUrl: string) {
  const connection = new IORedis(redisConnectionOptions(redisUrl));
  const queue = new Queue<DailyQueueJob>(DAILY_QUEUE_NAME, { connection });
  return {
    upsertJobScheduler: queue.upsertJobScheduler.bind(queue),
    removeJobScheduler: queue.removeJobScheduler.bind(queue),
    async close() {
      await queue.close();
      await connection.quit();
    },
  };
}

export function createDailyWorker(
  redisUrl: string,
  processor: (job: { name: string; data: unknown }) => Promise<unknown>,
  onError: (error: Error) => void,
) {
  const connection = new IORedis(redisConnectionOptions(redisUrl));
  const worker = new Worker<DailyQueueJob>(
    DAILY_QUEUE_NAME,
    (job: Job<DailyQueueJob>) => processor({ name: job.name, data: job.data }),
    { connection, concurrency: 1 },
  );
  worker.on("error", onError);
  return {
    async close() {
      await worker.close();
      await connection.quit();
    },
  };
}
