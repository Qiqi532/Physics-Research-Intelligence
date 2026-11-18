import type { DailyPipelineConfig } from "@pri/domain/config";
import { reconcileDailySchedule } from "./scheduler";

type RuntimeQueue = Parameters<typeof reconcileDailySchedule>[0] & {
  close(): Promise<unknown>;
};

type RuntimeJob = {
  name: string;
  data: unknown;
};

type RuntimeWorker = {
  close(): Promise<unknown>;
};

type WorkerRuntimeInput = {
  mode: "local" | "queue";
  createQueue(): RuntimeQueue;
  schedule: DailyPipelineConfig;
  createWorker(processor: (job: RuntimeJob) => Promise<unknown>): RuntimeWorker;
  processDaily(): Promise<unknown>;
};

export async function startWorkerRuntime(input: WorkerRuntimeInput): Promise<{
  close(): Promise<void>;
}> {
  if (input.mode === "local") {
    return { async close() {} };
  }
  const queue = input.createQueue();
  try {
    await reconcileDailySchedule(queue, input.schedule);
    if (!input.schedule.enabled) {
      return {
        async close() {
          await queue.close();
        },
      };
    }
    const worker = input.createWorker(async (job) => {
      if (job.name !== "daily-pipeline") {
        throw new Error("unknown_job_type");
      }
      return input.processDaily();
    });
    return {
      async close() {
        try {
          await worker.close();
        } finally {
          await queue.close();
        }
      },
    };
  } catch (error) {
    await queue.close();
    throw error;
  }
}
