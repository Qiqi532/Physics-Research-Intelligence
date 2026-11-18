import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  ping: vi.fn(),
  redisDisconnect: vi.fn(),
  queueClose: vi.fn(),
  redisConstructor: vi.fn(),
  queueConstructor: vi.fn(),
}));

vi.mock("../../packages/db/src/index", () => ({
  createPrismaClient: () => ({ $queryRaw: mocks.query, $disconnect: mocks.disconnect }),
}));

const webRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));

async function readiness() {
  const { withConfiguredHealthApi } = await import("../../apps/web/src/server/configured-health");
  return withConfiguredHealthApi((api) => api.ready());
}

describe("configured health dependencies", () => {
  let previousEnvironment: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnvironment = process.env;
    process.env = { DATABASE_URL: "postgresql://unused.invalid/pri" };
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock(webRequire.resolve("ioredis"), () => ({
      default: class {
        constructor(...args: unknown[]) { mocks.redisConstructor(...args); }
        on() {}
        connect = mocks.connect;
        ping = mocks.ping;
        disconnect = mocks.redisDisconnect;
      },
    }));
    vi.doMock(webRequire.resolve("bullmq"), () => ({
      Queue: class {
        constructor(...args: unknown[]) { mocks.queueConstructor(...args); }
        getJobCounts = async () => ({ waiting: 0, failed: 0 });
        getWorkers = async () => [{ id: "mock-worker" }];
        close = mocks.queueClose;
      },
    }));
    mocks.query.mockResolvedValue([]);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue(undefined);
    mocks.ping.mockResolvedValue("PONG");
    mocks.queueClose.mockResolvedValue(undefined);
  });

  afterEach(() => { process.env = previousEnvironment; });

  it.each(["false", "true"])("never creates Redis in local mode with scheduling=%s", async (enabled) => {
    process.env.DAILY_PIPELINE_ENABLED = enabled;
    process.env.REDIS_URL = "redis://unused.invalid/0";

    const result = await readiness();

    expect(result.status).toBe(200);
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
    expect(mocks.queueConstructor).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("works without any Redis configuration", async () => {
    const result = await readiness();
    expect(result.status).toBe(200);
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
  });

  it("keeps Redis and worker checks in explicit queue mode", async () => {
    process.env.RUNTIME_MODE = "queue";
    process.env.REDIS_URL = "redis://unused.invalid/0";
    process.env.DAILY_PIPELINE_ENABLED = "true";

    const result = await readiness();

    expect(result.status).toBe(200);
    expect(mocks.redisConstructor).toHaveBeenCalledTimes(2);
    expect(mocks.queueConstructor).toHaveBeenCalledOnce();
    expect(mocks.queueClose).toHaveBeenCalledOnce();
    expect(mocks.redisDisconnect).toHaveBeenCalledTimes(2);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("reports database failure and still releases the client in local mode", async () => {
    mocks.query.mockRejectedValueOnce(new Error("private database detail"));

    const result = await readiness();

    expect(result.status).toBe(503);
    expect(JSON.stringify(result)).toContain("postgres_unavailable");
    expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
  });
});
