import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../packages/domain/src/config";
import {
  DAILY_SCHEDULER_ID,
  dailyWindowAt,
  reconcileDailySchedule,
} from "../../apps/worker/src/scheduler";

const environment = {
  DATABASE_URL: "postgresql://localhost/pri",
  REDIS_URL: "redis://localhost:6379",
};

afterEach(() => vi.useRealTimers());

describe("daily pipeline scheduler", () => {
  it("parses an explicit switch, local time and IANA timezone", () => {
    const config = parseConfig({
      ...environment,
      DAILY_PIPELINE_ENABLED: "true",
      DAILY_PIPELINE_TIME: "06:30",
      DAILY_PIPELINE_TIMEZONE: "Asia/Shanghai",
    });

    expect(config.DAILY_PIPELINE).toEqual({
      enabled: true,
      time: "06:30",
      timezone: "Asia/Shanghai",
    });
  });

  it.each([
    ["DAILY_PIPELINE_ENABLED", "sometimes"],
    ["DAILY_PIPELINE_TIME", "24:00"],
    ["DAILY_PIPELINE_TIME", "6:30"],
    ["DAILY_PIPELINE_TIMEZONE", "Mars/Olympus"],
  ])("rejects invalid scheduler setting %s", (name, value) => {
    expect(() => parseConfig({
      ...environment,
      DAILY_PIPELINE_ENABLED: "true",
      DAILY_PIPELINE_TIME: "06:30",
      DAILY_PIPELINE_TIMEZONE: "Asia/Shanghai",
      [name]: value,
    })).toThrow(name);
  });

  it("upserts one timezone-aware BullMQ scheduler with bounded retries", async () => {
    const queue = fakeQueue();

    await reconcileDailySchedule(queue, {
      enabled: true,
      time: "06:30",
      timezone: "Asia/Shanghai",
    });
    await reconcileDailySchedule(queue, {
      enabled: true,
      time: "06:30",
      timezone: "Asia/Shanghai",
    });

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith(
      DAILY_SCHEDULER_ID,
      { pattern: "0 30 6 * * *", tz: "Asia/Shanghai" },
      {
        name: "daily-pipeline",
        data: { version: 1 },
        opts: expect.objectContaining({
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        }),
      },
    );
  });

  it("removes the scheduler when automatic running is disabled", async () => {
    const queue = fakeQueue();

    await reconcileDailySchedule(queue, {
      enabled: false,
      time: "06:30",
      timezone: "Asia/Shanghai",
    });

    expect(queue.removeJobScheduler).toHaveBeenCalledWith(DAILY_SCHEDULER_ID);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("derives a stable scheduled local-day window using fake time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T22:30:00.000Z"));

    expect(dailyWindowAt(new Date(), "Asia/Shanghai", "06:30")).toEqual({
      key: "2026-08-31",
      from: new Date("2026-08-29T22:30:00.000Z"),
      until: new Date("2026-08-30T22:30:00.000Z"),
    });
    expect(dailyWindowAt(
      new Date("2026-08-31T10:00:00.000Z"),
      "Asia/Shanghai",
      "06:30",
    )).toEqual({
      key: "2026-08-31",
      from: new Date("2026-08-29T22:30:00.000Z"),
      until: new Date("2026-08-30T22:30:00.000Z"),
    });
  });

  it("uses the previous scheduled window before today's execution time", () => {
    expect(dailyWindowAt(
      new Date("2026-08-30T21:00:00.000Z"),
      "Asia/Shanghai",
      "06:30",
    )).toEqual({
      key: "2026-08-30",
      from: new Date("2026-08-28T22:30:00.000Z"),
      until: new Date("2026-08-29T22:30:00.000Z"),
    });
  });

  it("keeps local schedule boundaries across daylight-saving changes", () => {
    expect(dailyWindowAt(
      new Date("2026-03-08T12:00:00.000Z"),
      "America/New_York",
      "06:00",
    )).toEqual({
      key: "2026-03-08",
      from: new Date("2026-03-07T11:00:00.000Z"),
      until: new Date("2026-03-08T10:00:00.000Z"),
    });
  });
});

function fakeQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  };
}
