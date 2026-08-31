import { describe, expect, it, vi } from "vitest";
import {
  createStructuredLogger,
  runLoggedOperation,
} from "../../apps/worker/src/logging";

describe("structured worker logging", () => {
  it("emits stable event, status and error code while redacting secrets", () => {
    const sink = vi.fn();
    const logger = createStructuredLogger(sink, () => new Date("2026-08-30T10:00:00.000Z"));
    const secret = "fixture-value-never-log";

    logger({
      event: "worker.queue.error",
      status: "failed",
      errorCode: "redis_worker_error",
      details: {
        REDIS_URL: secret,
        error: new Error(`cannot connect to ${secret}`),
      },
    });

    expect(sink).toHaveBeenCalledWith({
      event: "worker.queue.error",
      status: "failed",
      errorCode: "redis_worker_error",
      timestamp: "2026-08-30T10:00:00.000Z",
      details: expect.any(Object),
    });
    expect(JSON.stringify(sink.mock.calls)).not.toContain(secret);
  });

  it("logs a daily operation from running through completion", async () => {
    const logger = vi.fn();

    await expect(runLoggedOperation({
      event: "worker.daily",
      errorCode: "daily_pipeline_failed",
      logger,
      operation: vi.fn().mockResolvedValue({ recommendations: 3 }),
    })).resolves.toEqual({ recommendations: 3 });

    expect(logger).toHaveBeenNthCalledWith(1, {
      event: "worker.daily",
      status: "running",
    });
    expect(logger).toHaveBeenNthCalledWith(2, {
      event: "worker.daily",
      status: "complete",
      details: { result: { recommendations: 3 } },
    });
  });

  it("logs a stable failure code and rethrows for bounded queue retry", async () => {
    const logger = vi.fn();
    const failure = new Error("fixture failure");

    await expect(runLoggedOperation({
      event: "worker.daily",
      errorCode: "daily_pipeline_failed",
      logger,
      operation: vi.fn().mockRejectedValue(failure),
    })).rejects.toBe(failure);
    expect(logger).toHaveBeenLastCalledWith({
      event: "worker.daily",
      status: "failed",
      errorCode: "daily_pipeline_failed",
      details: { error: failure },
    });
  });
});
