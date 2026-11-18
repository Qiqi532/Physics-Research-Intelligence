import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaClient, type DatabaseClient } from "../../packages/db/src/client";
import { createDailyRepository, withDailyLock } from "../../packages/db/src/daily-repository";
import { createTodayRepository } from "../../packages/db/src/today-repository";
import { createSourceSyncRepository } from "../../packages/db/src/source-sync-repository";
import { syncPhysicsTags } from "../../packages/db/src/paper-repository";
import { createConfiguredDailyProcessor } from "../../apps/worker/src/configured-daily-processor";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";
import { parseConfig } from "../../packages/domain/src/config";
import type { DailyReportSnapshot } from "../../packages/domain/src/daily-report";
import type { RuntimeAiSnapshot } from "../../apps/worker/src/runtime-ai-config";
import type { AiProvider } from "../../packages/ai/src/provider";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const quote = "Retinomorphic sensor";
const claim = { text: "标题提到类视网膜传感器", evidenceLevel: "uncertain", evidenceReferences: [{ source: "metadata", locator: "title", quote }] };
const content = { basis: "abstract_only", sourceDisclosure: "基于摘要解读", overviewZh: claim, researchQuestion: claim,
  innovations: [claim], methodsAndEvidence: [claim], limitations: [claim], readingAdvice: ["先查阅原文"] };

describeDatabase("PostgreSQL durable daily reports", () => {
  let client: DatabaseClient;
  let paperId: string;
  const now = new Date("2026-11-13T06:00:00Z");
  beforeAll(() => { client = createPrismaClient(databaseUrl!); });
  beforeEach(async () => {
    await clear();
    await syncPhysicsTags(client);
    const paper = await client.paper.create({ data: { title: quote, normalizedTitle: quote.toLowerCase(), journal: "arXiv",
      abstract: "A retinomorphic sensor processes visual signals.",
      publishedAt: new Date("2026-11-12T00:00:00Z"), accessStatus: "OPEN" } });
    paperId = paper.id;
    await client.paperScreening.create({ data: { paperId, score: 0.9, directionSlug: "amo-optics", reason: "relevant",
      selected: true, batchId: "batch", provider: "mock", model: "m1", promptVersion: "screen-v3" } });
  });
  afterAll(async () => { await clear(); await client.$disconnect(); });
  async function clear() {
    await client.dailyReport.deleteMany(); await client.dailyRun.deleteMany();
    await client.aiRun.deleteMany(); await client.paper.deleteMany(); await client.sourceSyncState.deleteMany();
    await client.userInterest.deleteMany();
  }
  function snapshot(): DailyReportSnapshot {
    const provenance = { provider: "mock", model: "m1", promptVersion: "v1", inputHash: "hash" };
    return { schemaVersion: 1, dateKey: "2026-11-13", profileHash: "profile", profileLabel: "课题",
      sourceCoverage: [{ name: "arxiv", status: "complete", records: 1 }], validation: { mode: "single_model", semanticSupport: "unverified" },
      items: [{ paperId, doi: null, title: quote, journal: "arXiv", publishedAt: "2026-11-12T00:00:00.000Z",
        createdAt: now.toISOString(), originalUrl: "https://arxiv.org/abs/2611.00001", accessStatus: "OPEN", sourceName: "arxiv",
        score: 0.9, topicId: "retinomorphic", topicLabel: "类视网膜", topicKind: "core", reasons: ["课题匹配"],
        evidence: { source: "title", quote, verification: "exact_substring" }, screening: provenance,
        interpretation: { ...provenance, content } }] };
  }
  async function open(key = "run") {
    return createDailyRepository(client).open({ executionKey: key, dateKey: "2026-11-13", profileHash: "profile", profileLabel: "课题" });
  }
  it("atomically saves exact report identities and delivery marks; repeat publication is immutable", async () => {
    const store = createDailyRepository(client);
    const run = await open();
    const report = await store.publish(run.id, snapshot(), now);
    const second = await store.publish(run.id, { ...snapshot(), items: [] }, now);
    expect(second.id).toBe(report.id);
    expect(await client.dailyReport.count()).toBe(1);
    expect(await client.dailyReportItem.findMany({ select: { paperId: true, position: true } })).toEqual([{ paperId, position: 0 }]);
    expect((await client.paperScreening.findFirstOrThrow()).deliveredAt).toEqual(now);
    expect((await store.deliveredIds(new Date("2026-11-01"))).has(paperId)).toBe(true);
  });
  it("publication validation failures leave no report, no item and no delivery stamp", async () => {
    const store = createDailyRepository(client);
    const run = await open();
    await expect(store.publish(run.id, { ...snapshot(), profileHash: "different" }, now)).rejects.toThrow("daily_report_identity_mismatch");
    expect(await client.dailyReport.count()).toBe(0);
    expect(await client.dailyReportItem.count()).toBe(0);
    expect((await client.paperScreening.findFirstOrThrow()).deliveredAt).toBeNull();
  });
  it("rolls back report and item inserts when stamping delivery fails inside the transaction", async () => {
    const store = createDailyRepository(client);
    const run = await open();
    const schema = new URL(databaseUrl!).searchParams.get("schema") ?? "public";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(schema)) throw new Error("test_schema_invalid");
    await client.$executeRawUnsafe(`ALTER TABLE "${schema}"."PaperScreening" ADD CONSTRAINT pri_test_delivery_rollback CHECK ("deliveredAt" IS NULL)`);
    try {
      await expect(store.publish(run.id, snapshot(), now)).rejects.toThrow();
      expect(await client.dailyReport.count()).toBe(0);
      expect(await client.dailyReportItem.count()).toBe(0);
      expect((await client.paperScreening.findFirstOrThrow()).deliveredAt).toBeNull();
      expect((await client.dailyRun.findUniqueOrThrow({ where: { id: run.id } })).completedAt).toBeNull();
    } finally {
      await client.$executeRawUnsafe(`ALTER TABLE "${schema}"."PaperScreening" DROP CONSTRAINT pri_test_delivery_rollback`);
    }
  });
  it("keeps report facts/order fixed while overlaying current reading state; failed runs retain the prior report", async () => {
    const store = createDailyRepository(client);
    const run = await open();
    await store.publish(run.id, snapshot(), now);
    await client.paper.update({ where: { id: paperId }, data: { title: "changed title" } });
    await client.userPaperState.create({ data: { userId: "default", paperId, status: "READING" } });
    const failed = await store.open({ executionKey: "tomorrow", dateKey: "2026-11-14", profileHash: "profile", profileLabel: "课题" });
    await store.fail(failed.id, "screen", "screening_incomplete", true);
    const today = await createTodayRepository(client).getToday({ userId: "default", now: new Date("2026-11-14T06:00:00Z"), candidateLimit: 500, reportOnly: true });
    expect(today.recommendations.map((paper) => paper.title)).toEqual([quote]);
    expect(today.recommendations[0]?.readingStatus).toBe("READING");
    expect(today.report).toMatchObject({ dateKey: "2026-11-13", status: "stale", runStatus: "PARTIAL", stage: "screen" });
    expect(today.readingQueue).toHaveLength(1);
  });
  it("a missing report stays empty even when the candidate pool is populated", async () => {
    const data = await createTodayRepository(client).getToday({ userId: "default", now, candidateLimit: 500, reportOnly: true });
    expect(data.recommendations).toEqual([]);
    expect(data.report?.status).toBe("missing");
  });
  it("locks exclude overlapping processes and release on errors", async () => {
    await withDailyLock(databaseUrl!, async () => {
      await expect(withDailyLock(databaseUrl!, async () => undefined)).rejects.toThrow("daily_already_running");
    });
    await expect(withDailyLock(databaseUrl!, async () => { throw new Error("interrupt"); })).rejects.toThrow("interrupt");
    await expect(withDailyLock(databaseUrl!, async () => "recovered")).resolves.toBe("recovered");
  });
  it("advances the completed watermark only on successful ingestion", async () => {
    const store = createSourceSyncRepository(client);
    const from = new Date("2026-11-01T00:00:00Z");
    await store.markProgress({ sourceName: "arxiv:profile", windowFrom: from, windowUntil: now, cursor: "50" });
    await store.markFailure({ sourceName: "arxiv:profile", failedAt: now, errorCode: "timeout", errorMessage: "timeout" });
    expect((await store.find("arxiv:profile"))?.completedUntil).toBeNull();
    await store.markSuccess("arxiv:profile", now);
    expect((await store.find("arxiv:profile"))?.completedUntil).toEqual(now);
  });
  it("recovers interrupted daily runs without taking over unrelated interactive model jobs", async () => {
    const store = createDailyRepository(client);
    const run = await open();
    await client.dailyRun.update({ where: { id: run.id }, data: { stage: "interpret" } });
    const input = { paperId, runType: "INTERPRET" as const, provider: "mock", model: "m1", promptVersion: "v1", inputHash: "input", status: "RUNNING" as const };
    const daily = await client.aiRun.create({ data: { ...input, idempotencyKey: "daily:interrupted" } });
    const interactive = await client.aiRun.create({ data: { ...input, idempotencyKey: "interactive:running" } });
    await store.recoverInterruptedRuns();
    expect(await client.dailyRun.findUnique({ where: { id: run.id } })).toMatchObject({ status: "PARTIAL", stage: "interpret", errorCode: "daily_process_interrupted" });
    expect((await client.aiRun.findUniqueOrThrow({ where: { id: daily.id } })).status).toBe("FAILED");
    expect((await client.aiRun.findUniqueOrThrow({ where: { id: interactive.id } })).status).toBe("RUNNING");
  });
  it("runs the actual configured adapter end to end with public fixtures and performs no model calls on repeat", async () => {
    await client.paperScreening.deleteMany();
    const screenBatch = vi.fn(async (papers) => ({ provider: "mock", model: "screen-model", durationMs: 1,
      output: { papers: papers.map((paper: { paperId: string; title: string }) => ({ paperId: paper.paperId, selected: true, score: 0.9,
        directionSlug: "amo-optics", reason: "标题匹配，缺少摘要", evidenceSource: "title", evidenceQuote: paper.title })) } }));
    const interpret = vi.fn(async () => ({ provider: "mock", model: "interpret-model", durationMs: 1, output: content }));
    const provider = (input: { model: string }) => ({ name: "mock", model: input.model, classify: vi.fn(), screenBatch, interpret, healthCheck: vi.fn() }) as AiProvider;
    const connection = (model: string) => ({ name: model, provider: "deepseek" as const, model, apiKey: "fixture-only", baseUrl: "https://fixture.invalid/v1", requestTimeoutMs: 30000 });
    const snapshot: RuntimeAiSnapshot = { source: "environment", classify: { primary: connection("screen-model"), maxOutputTokens: 2048 },
      interpret: { primary: connection("interpret-model"), maxOutputTokens: 4096 } };
    const processor = createConfiguredDailyProcessor(parseConfig({ DATABASE_URL: databaseUrl! }), {
      research: loadResearchProfile(), resolver: { resolve: async () => snapshot }, createProvider: provider,
      connectors: [{ name: "arxiv", fetchPage: async () => ({ records: [], nextCursor: null }) }], now: () => now,
    });
    try {
      expect((await processor.process()).recommendations).toBe(1);
      const first = await client.dailyReport.findFirstOrThrow();
      expect((await processor.process()).report?.reused).toBe(true);
      expect((await client.dailyReport.findFirstOrThrow()).snapshot).toEqual(first.snapshot);
      expect(screenBatch).toHaveBeenCalledOnce();
      expect(interpret).toHaveBeenCalledOnce();
      const inputs = JSON.stringify(screenBatch.mock.calls);
      expect(inputs).not.toContain("privateNote");
      expect(inputs).not.toContain("fixture-only");
    } finally { await processor.close(); }
  });
});
