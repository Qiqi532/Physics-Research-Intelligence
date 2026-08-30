import { describe, expect, it, vi } from "vitest";
import { startWorkerRuntime } from "../../apps/worker/src/worker-runtime";

const enabledConfig = {
  enabled: true,
  time: "06:00",
  timezone: "Asia/Shanghai",
};

describe("worker runtime", () => {
  it("reconciles the scheduler, processes only the daily job and closes resources", async () => {
    const queue = fakeQueue();
    const workerClose = vi.fn().mockResolvedValue(undefined);
    let processor: ((job: { name: string; data: unknown }) => Promise<unknown>) | undefined;
    const processDaily = vi.fn().mockResolvedValue({ windowKey: "2026-08-30" });

    const runtime = await startWorkerRuntime({
      queue,
      schedule: enabledConfig,
      createWorker: (nextProcessor) => {
        processor = nextProcessor;
        return { close: workerClose };
      },
      processDaily,
    });

    expect(queue.upsertJobScheduler).toHaveBeenCalledOnce();
    expect(processor).toBeDefined();
    await expect(processor!({ name: "daily-pipeline", data: { version: 1 } }))
      .resolves.toEqual({ windowKey: "2026-08-30" });
    expect(processDaily).toHaveBeenCalledOnce();
    await expect(processor!({ name: "unexpected", data: {} }))
      .rejects.toThrow("unknown_job_type");

    await runtime.close();
    expect(workerClose).toHaveBeenCalledOnce();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it("removes the scheduler and does not start a worker when disabled", async () => {
    const queue = fakeQueue();
    const createWorker = vi.fn();

    const runtime = await startWorkerRuntime({
      queue,
      schedule: { ...enabledConfig, enabled: false },
      createWorker,
      processDaily: vi.fn(),
    });

    expect(queue.removeJobScheduler).toHaveBeenCalledOnce();
    expect(createWorker).not.toHaveBeenCalled();
    await runtime.close();
    expect(queue.close).toHaveBeenCalledOnce();
  });
});

function fakeQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
