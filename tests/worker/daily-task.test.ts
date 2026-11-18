import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { scheduleConfiguration, taskDefinition, runScheduled } from "../../scripts/scheduled-daily.mjs";
import { expectedReportDate } from "../../packages/domain/src/daily-report";

describe("Windows daily task", () => {
  it("uses a fixed Shanghai offset and current interactive identity, even under another host timezone", () => {
    const xml = taskDefinition({ projectRoot: "D:\\研究 project & notes", node: "C:\\Program Files\\nodejs\\node.exe",
      userId: "S-1-5-21-123", date: "2026-11-13", time: "12:15", maxMinutes: 60 });
    expect(xml).toContain("2026-11-13T12:15:00+08:00");
    expect(new Date("2026-11-13T12:15:00+08:00").toISOString()).toBe("2026-11-13T04:15:00.000Z");
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(xml).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    expect(xml).not.toContain("SYSTEM");
    expect(xml).not.toContain("apiKey");
  });
  it("supports missed-run identity before and after noon without depending on system timezone", () => {
    expect(expectedReportDate(new Date("2026-11-13T04:14:59Z"))).toBe("2026-11-12");
    expect(expectedReportDate(new Date("2026-11-13T04:15:00Z"))).toBe("2026-11-13");
    expect(expectedReportDate(new Date("2026-11-13T15:00:00Z"))).toBe("2026-11-13");
  });
  it("runs invisibly through PowerShell while preserving the Node exit code and quoted project path", () => {
    const xml = taskDefinition({ projectRoot: "D:\\研究 O'Brien & notes", node: "C:\\Program Files\\nodejs\\node.exe",
      powershell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      userId: "S-1-5-21-123", date: "2026-11-14", time: "12:15", maxMinutes: 60 });
    expect(xml).toContain("-WindowStyle Hidden");
    expect(xml).toContain("exit $LASTEXITCODE");
    expect(xml).toContain("O&apos;&apos;Brien &amp; notes");
    expect(xml).toContain("<Command>C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>");
  });
  it("validates runtime limits and rejects unsupported timezone or malformed time", () => {
    expect(scheduleConfiguration({})).toEqual({ time: "12:15", timezone: "Asia/Shanghai", maxMinutes: 60 });
    expect(() => scheduleConfiguration({ DAILY_RUN_MAX_MINUTES: "0" })).toThrow();
    expect(() => scheduleConfiguration({ DAILY_PIPELINE_TIME: "25:00" })).toThrow();
    expect(() => scheduleConfiguration({ DAILY_PIPELINE_TIMEZONE: "UTC" })).toThrow();
  });
  it("writes local run logs, uses absolute paths and propagates failure status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pri-daily-test-"));
    try {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 12345 });
      const spawnChild = vi.fn(() => child);
      const pending = runScheduled({ environment: { PRIVATE_CONFIG: "not in args" }, maxMinutes: 5, logDirectory: directory, spawnChild });
      child.stdout.end("safe run event\n");
      child.emit("close", 1);
      expect(await pending).toBe(1);
      const [file] = await readdir(directory);
      expect(await readFile(join(directory, file!), "utf8")).toContain("daily_run_incomplete");
      expect(JSON.stringify(spawnChild.mock.calls[0]![1])).not.toContain("PRIVATE_CONFIG");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("kills only its own process tree at the deadline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pri-daily-timeout-"));
    vi.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 54321 });
      const killTree = vi.fn();
      const pending = runScheduled({ environment: {}, maxMinutes: 5, logDirectory: directory, spawnChild: () => child, killTree });
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(await pending).toBe(1);
      expect(killTree).toHaveBeenCalledExactlyOnceWith(54321);
    } finally { vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); }
  });
});
