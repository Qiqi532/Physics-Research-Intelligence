import { describe, expect, it } from "vitest";
import {
  boundedRedisRetryDelay,
  redisConnectionOptions,
} from "../../apps/worker/src/queue";

describe("Redis queue connection boundary", () => {
  it("parses redis URLs without exposing them in public queue names", () => {
    expect(redisConnectionOptions("redis://queue-user:test-value@localhost:6380/2")).toEqual({
      host: "localhost",
      port: 6380,
      username: "queue-user",
      password: "test-value",
      db: 2,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: boundedRedisRetryDelay,
    });
  });

  it.each([
    "http://localhost:6379",
    "redis://localhost/not-a-db",
    "redis://localhost/16",
  ])("rejects invalid Redis connection input", (url) => {
    expect(() => redisConnectionOptions(url)).toThrow("REDIS_URL");
  });

  it("uses bounded reconnect backoff", () => {
    expect(boundedRedisRetryDelay(1)).toBe(250);
    expect(boundedRedisRetryDelay(10)).toBe(5_000);
    expect(boundedRedisRetryDelay(100)).toBe(5_000);
  });
});
