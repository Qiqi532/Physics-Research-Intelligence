import { createHash } from "node:crypto";
import { Client } from "pg";
import { dailyReportSchema, type DailyReportSnapshot } from "@pri/domain/daily-report";
import type { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";

export type DailyRunInput = {
  executionKey: string; dateKey: string; profileHash: string; profileLabel: string;
};
export type DailyCheckpoint = Record<string, unknown>;

export function createDailyRepository(client: DatabaseClient) {
  return {
    async open(input: DailyRunInput) {
      return client.dailyRun.upsert({ where: { executionKey: input.executionKey },
        create: input, update: {}, include: { report: true } });
    },
    async checkpoint(id: string, stage: string, checkpoint: DailyCheckpoint) {
      await client.dailyRun.update({ where: { id }, data: { stage, status: "RUNNING", errorCode: null,
        checkpoint: json(checkpoint) } });
    },
    async fail(id: string, stage: string, errorCode: string, partial: boolean) {
      await client.dailyRun.update({ where: { id }, data: { stage, errorCode,
        status: partial ? "PARTIAL" : "FAILED" } });
    },
    async publish(runId: string, raw: DailyReportSnapshot, at: Date) {
      const snapshot = dailyReportSchema.parse(raw);
      return client.$transaction(async (transaction) => {
        const existing = await transaction.dailyReport.findUnique({ where: { runId } });
        if (existing) return existing;
        const run = await transaction.dailyRun.findUniqueOrThrow({ where: { id: runId } });
        if (run.dateKey !== snapshot.dateKey || run.profileHash !== snapshot.profileHash) {
          throw new Error("daily_report_identity_mismatch");
        }
        const paperIds = snapshot.items.map((item) => item.paperId);
        if (await transaction.paper.count({ where: { id: { in: paperIds } } }) !== paperIds.length) {
          throw new Error("daily_report_paper_missing");
        }
        const report = await transaction.dailyReport.create({ data: {
          runId, dateKey: snapshot.dateKey, profileHash: snapshot.profileHash, snapshot: json(snapshot),
          items: { create: paperIds.map((paperId, position) => ({ paperId, position })) },
        } });
        await transaction.paperScreening.updateMany({
          where: { paperId: { in: paperIds }, selected: true }, data: { deliveredAt: at },
        });
        const modelPartial = (snapshot.validation.unavailableInterpretations ?? 0) > 0;
        const screenPartial = (snapshot.validation.unscreenedCandidates ?? 0) > 0;
        const partial = modelPartial || screenPartial || snapshot.sourceCoverage.some((source) => source.status !== "complete");
        await transaction.dailyRun.update({ where: { id: runId }, data: {
          status: partial ? "PARTIAL" : "SUCCEEDED", stage: "published", completedAt: at,
          errorCode: modelPartial ? "interpretation_partial" : screenPartial ? "screening_partial" : partial ? "source_coverage_incomplete" : null,
        } });
        return report;
      });
    },
    async deliveredIds(since: Date) {
      const rows = await client.dailyReportItem.findMany({
        where: { report: { createdAt: { gte: since } }, paperId: { not: null } },
        select: { paperId: true }, distinct: ["paperId"],
      });
      return new Set(rows.flatMap((row) => row.paperId ? [row.paperId] : []));
    },
    // Called only while holding the global daily lock. A previous process can no longer own these runs.
    async recoverInterruptedRuns() {
      await client.dailyRun.updateMany({ where: { status: "RUNNING", report: { is: null } },
        data: { status: "PARTIAL", errorCode: "daily_process_interrupted" } });
      await client.aiRun.updateMany({ where: { status: "RUNNING", idempotencyKey: { startsWith: "daily:" },
        runType: { in: ["SCREEN", "INTERPRET"] } },
        data: { status: "FAILED", errorCode: "daily_process_interrupted" } });
    },
  };
}

export type DailyRepository = ReturnType<typeof createDailyRepository>;

// A dedicated session holds the lock without keeping a database transaction open during HTTP calls.
export async function withDailyLock<T>(databaseUrl: string, work: (assertLock: () => void) => Promise<T>): Promise<T> {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");
  const key = createHash("sha256").update(`pri-daily:${schema}`).digest().readBigInt64BE(0).toString();
  const lock = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000,
    application_name: "pri-daily-lock", keepAlive: true });
  let lost = false;
  lock.on("error", () => { lost = true; });
  await lock.connect();
  try {
    const result = await lock.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [key]);
    if (!result.rows[0]?.acquired) throw new Error("daily_already_running");
    return await work(() => { if (lost) throw new Error("daily_lock_lost"); });
  } finally {
    await lock.end().catch(() => undefined);
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
