import type { ApiResult } from "./papers";

export type HealthDependencies = {
  postgres(): Promise<void>;
  redis?(): Promise<void>;
  queue?(): Promise<{ waiting: number; failed: number; workerCount: number }>;
};

type HealthOptions = {
  now?: () => Date;
  backlogThreshold?: number;
  workerRequired?: boolean;
  redisRequired?: boolean;
};

export function createHealthApi(
  dependencies: HealthDependencies,
  options: HealthOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const backlogThreshold = options.backlogThreshold ?? 100;
  const workerRequired = options.workerRequired ?? true;
  const redisRequired = options.redisRequired ?? true;
  return {
    live(): ApiResult {
      return {
        status: 200,
        body: { status: "alive", checkedAt: now().toISOString() },
      };
    },

    async ready(): Promise<ApiResult> {
      const [postgres, redis] = await Promise.allSettled([
        Promise.resolve().then(() => dependencies.postgres()),
        redisRequired
          ? Promise.resolve().then(() => {
              if (!dependencies.redis) throw new Error("redis_unconfigured");
              return dependencies.redis();
            })
          : Promise.resolve(),
      ]);
      const components: Record<string, unknown> = {
        postgres: postgres.status === "fulfilled"
          ? { status: "ready" }
          : { status: "not_ready", errorCode: "postgres_unavailable" },
        redis: !redisRequired
          ? { status: "disabled" }
          : redis.status === "fulfilled"
          ? { status: "ready" }
          : { status: "not_ready", errorCode: "redis_unavailable" },
      };
      let queueReady = true;
      let workerReady = true;
      if (!redisRequired || !workerRequired) {
        components.queue = { status: "disabled" };
        components.worker = { status: "disabled" };
      } else {
        try {
          if (!dependencies.queue) throw new Error("queue_unconfigured");
          const state = await dependencies.queue();
          queueReady = state.waiting <= backlogThreshold;
          workerReady = state.workerCount > 0;
          components.queue = queueReady
            ? { status: "ready", waiting: state.waiting, failed: state.failed }
            : {
                status: "not_ready",
                errorCode: "queue_backlog",
                waiting: state.waiting,
                failed: state.failed,
              };
          components.worker = workerReady
            ? { status: "ready", count: state.workerCount }
            : { status: "not_ready", errorCode: "worker_unavailable", count: 0 };
        } catch {
          queueReady = false;
          workerReady = false;
          components.queue = { status: "not_ready", errorCode: "queue_unavailable" };
          components.worker = { status: "not_ready", errorCode: "worker_unknown" };
        }
      }
      const ready = postgres.status === "fulfilled" &&
        redis.status === "fulfilled" && queueReady && workerReady;
      return {
        status: ready ? 200 : 503,
        body: {
          status: ready ? "ready" : "not_ready",
          checkedAt: now().toISOString(),
          components,
        },
      };
    },
  };
}
