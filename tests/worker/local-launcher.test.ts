import { describe, expect, it, vi } from "vitest";
import { LauncherError, parseArguments, runLocal, validateDatabase, waitForApplication, webArguments } from "../../scripts/local.mjs";

function fixture() {
  return {
    prepare: vi.fn(() => ({
      environment: { DATABASE_URL: "postgresql://localhost/fixture" },
      nextCli: "fixture-next", tsxCli: "fixture-tsx",
    })),
    run: vi.fn((_program: string, _args: string[], _options?: Record<string, unknown>) => ({ status: 0, stdout: "" })),
    probe: vi.fn().mockResolvedValue(false),
    serve: vi.fn().mockResolvedValue(0),
    open: vi.fn(),
    desktop: vi.fn().mockResolvedValue(true),
    wait: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
}

describe("local Windows launcher", () => {
  it("prefers an existing production server without a development watcher", () => {
    expect(webArguments({ nextCli: "fixture-next", productionServer: "fixture-server" }))
      .toEqual(["fixture-server"]);
  });

  it("uses a loopback development preview when a production build is absent", () => {
    expect(webArguments({ nextCli: "fixture-next" }))
      .toEqual(["fixture-next", "dev", "-H", "127.0.0.1", "-p", "3000"]);
  });

  it("checks prerequisites without starting services, browser or model work", async () => {
    const deps = fixture();
    expect(await runLocal("check", {}, deps)).toBe(0);
    expect(deps.run.mock.calls.map(([, args]) => args)).toEqual([
      ["compose", "version"], ["info", "--format", "{{.ServerVersion}}"],
    ]);
    expect(deps.serve).not.toHaveBeenCalled();
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.desktop).not.toHaveBeenCalled();
  });

  it("starts only PostgreSQL before serving the local Web app", async () => {
    const deps = fixture();
    expect(await runLocal("start", {}, deps)).toBe(0);
    const composeArgs = deps.run.mock.calls.at(-1)![1];
    expect(composeArgs).toContain("--wait");
    expect(composeArgs.at(-1)).toBe("postgres");
    expect(composeArgs).not.toContain("redis");
    expect(deps.serve).toHaveBeenCalledWith(deps.prepare.mock.results[0]!.value, {
      browser: true, log: deps.log,
    });
  });

  it("reuses an existing app without starting Docker or another Web process", async () => {
    const deps = fixture();
    deps.probe.mockResolvedValue(true);
    expect(await runLocal("start", {}, deps)).toBe(0);
    expect(deps.open).toHaveBeenCalledOnce();
    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("respects no-browser mode", async () => {
    const deps = fixture();
    deps.probe.mockResolvedValue(true);
    await runLocal("start", { noBrowser: true }, deps);
    expect(deps.open).not.toHaveBeenCalled();
  });

  it("keeps check read-only when the Docker engine is stopped", async () => {
    const deps = fixture();
    deps.run.mockImplementation((_, args) => ({ status: args[0] === "info" ? 1 : 0, stdout: "" }));
    await expect(runLocal("check", {}, deps)).rejects.toThrow("引擎尚未运行");
    expect(deps.desktop).not.toHaveBeenCalled();
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("starts Docker Desktop and waits before starting PostgreSQL", async () => {
    const deps = fixture();
    let attempts = 0;
    deps.run.mockImplementation((_, args) => ({
      status: args[0] === "info" && attempts++ < 2 ? 1 : 0, stdout: "",
    }));
    expect(await runLocal("start", {}, deps)).toBe(0);
    expect(deps.desktop).toHaveBeenCalledOnce();
    expect(deps.wait).toHaveBeenCalledOnce();
    expect(deps.serve).toHaveBeenCalledOnce();
  });

  it("stops after a bounded Docker startup timeout", async () => {
    const deps = fixture();
    deps.run.mockImplementation((_, args) => ({ status: args[0] === "info" ? 1 : 0, stdout: "" }));
    await expect(runLocal("start", {}, deps)).rejects.toThrow("等待时间");
    expect(deps.wait).toHaveBeenCalledTimes(90);
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("allows a cold Docker engine to take longer than one minute", async () => {
    const deps = fixture();
    let attempts = 0;
    let now = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    deps.wait.mockImplementation(async (milliseconds: number) => { now += milliseconds; });
    deps.run.mockImplementation((_, args) => ({ status: args[0] === "info" && attempts++ < 35 ? 1 : 0, stdout: "" }));
    try {
      expect(await runLocal("start", {}, deps)).toBe(0);
      expect(now).toBeGreaterThan(60_000);
      expect(now).toBeLessThan(180_000);
      expect(deps.serve).toHaveBeenCalledOnce();
    } finally { clock.mockRestore(); }
  });

  it("does not start Web after a database startup failure", async () => {
    const deps = fixture();
    deps.run.mockImplementation((_, args) => ({ status: args.includes("up") ? 1 : 0, stdout: "" }));
    await expect(runLocal("start", {}, deps)).rejects.toThrow("PostgreSQL 启动失败");
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("executes the real one-shot entry only for the explicit daily action", async () => {
    const deps = fixture();
    deps.run.mockImplementation((program) => ({ status: program === process.execPath ? 1 : 0, stdout: "" }));
    expect(await runLocal("daily", {}, deps)).toBe(1);
    const [program, args, options] = deps.run.mock.calls.at(-1)!;
    expect(program).toBe(process.execPath);
    expect(args[0]).toBe("fixture-tsx");
    expect(args[1]).toMatch(/manual-daily-run\.ts$/u);
    expect(options).toEqual({ inherit: true, environment: deps.prepare.mock.results[0]!.value.environment });
    expect(deps.serve).not.toHaveBeenCalled();
    expect(deps.log.mock.calls.some(([message]) => message.includes("调用已配置的模型"))).toBe(true);
  });

  it("rejects unknown actions before inspecting configuration", async () => {
    const deps = fixture();
    await expect(runLocal("unknown", {}, deps)).rejects.toThrow(LauncherError);
    expect(deps.prepare).not.toHaveBeenCalled();
  });

  it.each([undefined, "invalid", "postgresql://remote.example/pri", "postgresql://localhost:5433/pri"])(
    "rejects unsupported database configuration without exposing its value", (value) => {
      expect(() => validateDatabase(value)).toThrow(LauncherError);
    },
  );

  it("accepts loopback PostgreSQL URLs", () => {
    expect(() => validateDatabase("postgresql://localhost:5432/pri")).not.toThrow();
    expect(() => validateDatabase("postgres://[::1]/pri")).not.toThrow();
  });

  it("cancels readiness polling when the owned Web process exits", async () => {
    const controller = new AbortController();
    const probe = vi.fn().mockResolvedValue(false);
    const wait = vi.fn(async () => { controller.abort(); });
    expect(await waitForApplication(probe, controller.signal, wait)).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
  });

  it("supports safe help and rejects unknown flags instead of starting services", () => {
    expect(parseArguments(["--help"]).help).toBe(true);
    expect(parseArguments(["check"]).action).toBe("check");
    expect(parseArguments(["start", "--no-browser"]).noBrowser).toBe(true);
    expect(() => parseArguments(["--unknown"])).toThrow(LauncherError);
    expect(() => parseArguments(["start", "daily"])).toThrow(LauncherError);
  });
});
