import { describe, expect, it, vi } from "vitest";
import type { DailyPipelineResult } from "../../apps/worker/src/daily-pipeline";
import { runDailyOnce } from "../../apps/worker/src/daily-runner";

function fixture() {
  const result: DailyPipelineResult = {
    windowKey: "2026-11-13",
    ingestedRecords: 8,
    screening: { screened: 8, selected: 5, batches: 1, failedBatches: 0 },
    interpretation: { complete: 5, duplicate: 0, failed: 0, inProgress: 0 },
    recommendations: 5,
    cleanup: { status: "ok", deleted: 0 },
  };
  const processor = {
    process: vi.fn().mockResolvedValue(result),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    result,
    processor,
    environment: { DATABASE_URL: "postgresql://unused.invalid/pri" },
    createProcessor: vi.fn(() => processor),
    logger: vi.fn(),
  };
}

describe("one-shot daily runner", () => {
  it("a published report with limited source coverage is usable and does not trigger model retries", async () => {
    const input = fixture();
    input.result.report = { status: "partial", reused: false };
    input.result.interpretation.failed = 2;
    expect(await runDailyOnce(input)).toBe(0);
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({ details: expect.objectContaining({
      result: expect.objectContaining({ report: { status: "partial", reused: false } }),
    }) }));
  });
  it("runs explicitly with scheduling off and no Redis, then releases resources", async () => {
    const input = fixture();
    const code = await runDailyOnce(input);

    expect(code).toBe(0);
    expect(input.createProcessor).toHaveBeenCalledWith(expect.objectContaining({
      RUNTIME_MODE: "local",
      DAILY_PAPER_TARGET_MIN: 5,
      DAILY_PAPER_TARGET_MAX: 8,
      DAILY_PIPELINE: expect.objectContaining({ enabled: false, time: "12:15" }),
    }));
    expect(input.processor.process).toHaveBeenCalledOnce();
    expect(input.processor.close).toHaveBeenCalledOnce();
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({ status: "complete" }));
  });

  it("returns a failure code before creating a processor if configuration is invalid", async () => {
    const input = fixture();
    const code = await runDailyOnce({ ...input, environment: {} });

    expect(code).toBe(1);
    expect(input.createProcessor).not.toHaveBeenCalled();
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({
      errorCode: "daily_configuration_invalid",
    }));
  });

  it("handles initialization failure without printing the raw error", async () => {
    const input = fixture();
    const privateValue = ["private", "initialization", "detail"].join("-");
    input.createProcessor.mockImplementationOnce(() => { throw new Error(privateValue); });

    expect(await runDailyOnce(input)).toBe(1);
    expect(JSON.stringify(input.logger.mock.calls)).not.toContain(privateValue);
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({
      errorCode: "daily_initialization_failed",
    }));
  });

  it("releases the processor and hides raw provider errors on failure", async () => {
    const input = fixture();
    const privateValue = ["private", "provider", "detail"].join("-");
    input.processor.process.mockRejectedValueOnce(new Error(privateValue));

    expect(await runDailyOnce(input)).toBe(1);
    expect(input.processor.close).toHaveBeenCalledOnce();
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({
      errorCode: "daily_pipeline_failed",
    }));
    expect(JSON.stringify(input.logger.mock.calls)).not.toContain(privateValue);
  });

  it.each(["screening", "interpretation", "inProgress", "cleanup"])(
    "does not report full success after a partial %s failure",
    async (component) => {
      const input = fixture();
      if (component === "screening") input.result.screening.failedBatches = 1;
      if (component === "interpretation") input.result.interpretation.failed = 1;
      if (component === "inProgress") input.result.interpretation.inProgress = 1;
      if (component === "cleanup") {
        input.result.cleanup = { status: "failed", errorCode: "retention_cleanup_failed" };
      }

      expect(await runDailyOnce(input)).toBe(1);
      expect(input.processor.close).toHaveBeenCalledOnce();
      expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({
        errorCode: "daily_pipeline_partial",
      }));
    },
  );

  it("returns failure if resource release fails, without a success log", async () => {
    const input = fixture();
    input.processor.close.mockRejectedValueOnce(new Error("private close detail"));

    expect(await runDailyOnce(input)).toBe(1);
    expect(input.logger).toHaveBeenLastCalledWith(expect.objectContaining({
      errorCode: "daily_close_failed",
    }));
    expect(input.logger.mock.calls.some(([event]) => event.status === "complete")).toBe(false);
    expect(JSON.stringify(input.logger.mock.calls)).not.toContain("private close detail");
  });
});
