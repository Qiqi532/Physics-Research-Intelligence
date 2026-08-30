import type { DailyPipelineConfig } from "@pri/domain/config";

export const DAILY_SCHEDULER_ID = "pri-daily-pipeline-v1";

type SchedulerQueue = {
  upsertJobScheduler(
    schedulerId: string,
    repeat: { pattern: string; tz: string },
    template: {
      name: string;
      data: { version: 1 };
      opts: {
        attempts: number;
        backoff: { type: "exponential"; delay: number };
        removeOnComplete: number;
        removeOnFail: number;
      };
    },
  ): Promise<unknown>;
  removeJobScheduler(schedulerId: string): Promise<unknown>;
};

export type DailyWindow = {
  key: string;
  from: Date;
  until: Date;
};

export async function reconcileDailySchedule(
  queue: SchedulerQueue,
  config: DailyPipelineConfig,
): Promise<void> {
  if (!config.enabled) {
    await queue.removeJobScheduler(DAILY_SCHEDULER_ID);
    return;
  }
  const [hour, minute] = config.time.split(":").map(Number);
  await queue.upsertJobScheduler(
    DAILY_SCHEDULER_ID,
    { pattern: `0 ${minute} ${hour} * * *`, tz: config.timezone },
    {
      name: "daily-pipeline",
      data: { version: 1 as const },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 30,
        removeOnFail: 100,
      },
    },
  );
}

export function dailyWindowAt(
  now: Date,
  timezone: string,
  scheduleTime: string,
): DailyWindow {
  const local = zonedParts(now, timezone);
  const [scheduleHour, scheduleMinute] = scheduleTime.split(":").map(Number);
  const beforeSchedule = local.hour < scheduleHour! ||
    (local.hour === scheduleHour && local.minute < scheduleMinute!);
  const localDate = `${local.year}-${twoDigits(local.month)}-${twoDigits(local.day)}`;
  const key = beforeSchedule ? shiftDate(localDate, -1) : localDate;
  const previousKey = shiftDate(key, -1);
  return {
    key,
    from: scheduledInstant(previousKey, scheduleTime, timezone),
    until: scheduledInstant(key, scheduleTime, timezone),
  };
}

function scheduledInstant(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetWallClock = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let candidate = targetWallClock;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = zonedParts(new Date(candidate), timezone);
    const observedWallClock = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const correction = targetWallClock - observedWallClock;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    shifted.getUTCFullYear(),
    twoDigits(shifted.getUTCMonth() + 1),
    twoDigits(shifted.getUTCDate()),
  ].join("-");
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
