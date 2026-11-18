import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadEnvironment: vi.fn(),
  runDailyOnce: vi.fn(),
  createProcessor: vi.fn(),
}));
vi.mock("../../apps/worker/src/daily-runner", () => ({ runDailyOnce: mocks.runDailyOnce }));
vi.mock("../../apps/worker/src/configured-daily-processor", () => ({
  createConfiguredDailyProcessor: mocks.createProcessor,
}));

const workerRequire = createRequire(new URL("../../apps/worker/package.json", import.meta.url));

describe("daily CLI entry point", () => {
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock(workerRequire.resolve("dotenv"), () => ({ config: mocks.loadEnvironment }));
    mocks.loadEnvironment.mockReturnValue({});
    mocks.runDailyOnce.mockResolvedValue(0);
  });
  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
  });

  it("does not load personal environment or start work when imported", async () => {
    await import("../../apps/worker/src/manual-daily-run");

    expect(mocks.loadEnvironment).not.toHaveBeenCalled();
    expect(mocks.runDailyOnce).not.toHaveBeenCalled();
    expect(mocks.createProcessor).not.toHaveBeenCalled();
  });

  it("loads the root environment regardless of the caller's working directory", async () => {
    const { main } = await import("../../apps/worker/src/manual-daily-run");
    vi.spyOn(process, "cwd").mockReturnValue("C:\\unrelated-directory");

    await main();

    expect(mocks.loadEnvironment).toHaveBeenCalledWith({
      path: fileURLToPath(new URL("../../.env", import.meta.url)),
      quiet: true,
      override: false,
    });
    expect(mocks.runDailyOnce).toHaveBeenCalledWith({
      environment: process.env,
      createProcessor: mocks.createProcessor,
    });
    expect(process.exitCode).toBe(0);
  });

  it("propagates the runner's failure exit code", async () => {
    const { main } = await import("../../apps/worker/src/manual-daily-run");
    mocks.runDailyOnce.mockResolvedValueOnce(1);
    await main();
    expect(process.exitCode).toBe(1);
  });

  it("does not start a run if the root environment cannot be read", async () => {
    const { main } = await import("../../apps/worker/src/manual-daily-run");
    mocks.loadEnvironment.mockReturnValueOnce({
      error: Object.assign(new Error("private filesystem detail"), { code: "EACCES" }),
    });

    await expect(main()).rejects.toThrow("daily_environment_unavailable");
    expect(mocks.runDailyOnce).not.toHaveBeenCalled();
  });

  it("allows inherited configuration when the root environment file is absent", async () => {
    const { main } = await import("../../apps/worker/src/manual-daily-run");
    mocks.loadEnvironment.mockReturnValueOnce({
      error: Object.assign(new Error("missing file"), { code: "ENOENT" }),
    });

    await main();
    expect(mocks.runDailyOnce).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });
});
