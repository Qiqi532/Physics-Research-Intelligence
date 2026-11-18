import { describe, expect, it, vi } from "vitest";
import { createHealthApi } from "../../apps/web/src/server/health";

const now = new Date("2026-08-30T10:00:00.000Z");

describe("health API service", () => {
  it("reports liveness without touching dependencies", async () => {
    const dependencies = readyDependencies();

    const result = createHealthApi(dependencies, { now: () => now }).live();

    expect(result).toEqual({
      status: 200,
      body: { status: "alive", checkedAt: now.toISOString() },
    });
    expect(dependencies.postgres).not.toHaveBeenCalled();
    expect(dependencies.redis).not.toHaveBeenCalled();
  });

  it("reports safe readiness and bounded queue counts", async () => {
    const result = await createHealthApi(readyDependencies(), { now: () => now }).ready();

    expect(result).toEqual({
      status: 200,
      body: {
        status: "ready",
        checkedAt: now.toISOString(),
        components: {
          postgres: { status: "ready" },
          redis: { status: "ready" },
          queue: { status: "ready", waiting: 4, failed: 1 },
          worker: { status: "ready", count: 1 },
        },
      },
    });
  });

  it.each([
    ["postgres", "postgres_unavailable"],
    ["redis", "redis_unavailable"],
  ] as const)("maps %s failure to a stable code without leaking details", async (component, code) => {
    const dependencies = readyDependencies({
      [component]: vi.fn().mockRejectedValue(new Error("private connection value")),
    });

    const result = await createHealthApi(dependencies, { now: () => now }).ready();

    expect(result.status).toBe(503);
    expect(result.body).toEqual(expect.objectContaining({ status: "not_ready" }));
    expect((result.body as any).components[component]).toEqual({
      status: "not_ready",
      errorCode: code,
    });
    expect(JSON.stringify(result.body)).not.toContain("private connection value");
  });

  it("reports missing workers and queue backlog without exposing job data", async () => {
    const dependencies = readyDependencies({
      queue: vi.fn().mockResolvedValue({ waiting: 101, failed: 8, workerCount: 0 }),
    });

    const result = await createHealthApi(dependencies, {
      now: () => now,
      backlogThreshold: 100,
      workerRequired: true,
    }).ready();

    expect(result.status).toBe(503);
    expect(result.body).toEqual(expect.objectContaining({
      components: expect.objectContaining({
        queue: { status: "not_ready", errorCode: "queue_backlog", waiting: 101, failed: 8 },
        worker: { status: "not_ready", errorCode: "worker_unavailable", count: 0 },
      }),
    }));
  });

  it("marks queue and worker disabled when the daily pipeline switch is off", async () => {
    const dependencies = readyDependencies();

    const result = await createHealthApi(dependencies, {
      now: () => now,
      workerRequired: false,
    }).ready();

    expect(result.status).toBe(200);
    expect((result.body as any).components.queue).toEqual({ status: "disabled" });
    expect((result.body as any).components.worker).toEqual({ status: "disabled" });
    expect(dependencies.queue).not.toHaveBeenCalled();
  });

  it("checks only PostgreSQL when Redis is disabled in local mode", async () => {
    const dependencies = readyDependencies({
      redis: vi.fn().mockRejectedValue(new Error("must not connect")),
      queue: vi.fn().mockRejectedValue(new Error("must not inspect")),
    });

    const result = await createHealthApi(dependencies, {
      redisRequired: false,
      workerRequired: true,
    }).ready();

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      components: {
        postgres: { status: "ready" },
        redis: { status: "disabled" },
        queue: { status: "disabled" },
        worker: { status: "disabled" },
      },
    }));
    expect(dependencies.postgres).toHaveBeenCalledOnce();
    expect(dependencies.redis).not.toHaveBeenCalled();
    expect(dependencies.queue).not.toHaveBeenCalled();
  });

  it("still reports PostgreSQL failure without Redis in local mode", async () => {
    const postgres = vi.fn().mockRejectedValue(new Error("private database detail"));
    const result = await createHealthApi({ postgres }, { redisRequired: false }).ready();

    expect(result.status).toBe(503);
    expect(result.body).toEqual(expect.objectContaining({
      components: expect.objectContaining({
        postgres: { status: "not_ready", errorCode: "postgres_unavailable" },
        redis: { status: "disabled" },
      }),
    }));
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});

function readyDependencies(overrides: Record<string, unknown> = {}) {
  return {
    postgres: vi.fn().mockResolvedValue(undefined),
    redis: vi.fn().mockResolvedValue(undefined),
    queue: vi.fn().mockResolvedValue({ waiting: 4, failed: 1, workerCount: 1 }),
    ...overrides,
  };
}
