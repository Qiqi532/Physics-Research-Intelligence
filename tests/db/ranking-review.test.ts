import { describe, expect, it } from "vitest";
import { createDailyRepository, createPrismaClient, createRankingRepository, patchPaperState } from "../../packages/db/src/index";
import { freezeRanking } from "../../packages/domain/src/ranking-review";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PostgreSQL ranking replay", () => {
  it("holds out seven distinct days and preserves the original snapshots when voting", async () => {
    const db = createPrismaClient(url!);
    const daily = createDailyRepository(db);
    const rankings = createRankingRepository(db);
    const { profile } = loadResearchProfile({});
    const seedText = "Analog optical arrays separate direction and temporal sequences in adaptive memories";
    const seed = { ...profile.seeds[0], abstract: seedText };
    const first = await db.paper.create({ data: { title: "A new photodetector", normalizedTitle: "a new photodetector" } });
    const second = await db.paper.create({ data: { title: "Another approach", normalizedTitle: "another approach" } });
    const snapshot = freezeRanking(profile, [
      { id: first.id, title: first.title, doi: null, abstract: "A photocurrent detector.", publishedAt: "2026-11-01" },
      { id: second.id, title: second.title, doi: null, abstract: seedText, publishedAt: "2026-11-01" },
    ], [seed], "ready");
    try {
      for (const ordinal of [1, 2, 3, 4, 5, 6, 7, 8, 8]) {
        const dateKey = "2026-11-" + String(ordinal).padStart(2, "0");
        const run = await db.dailyRun.create({ data: {
          executionKey: crypto.randomUUID(), dateKey, profileHash: "review-fixture", profileLabel: "Fixture review",
        } });
        await daily.freezeCandidates(run.id, { candidates: [first.id] }, snapshot);
      }
      const completed = await db.dailyRun.findFirstOrThrow({ where: { profileHash: "review-fixture", dateKey: "2026-11-07" } });
      const published = await db.dailyReport.create({ data: {
        runId: completed.id, dateKey: completed.dateKey, profileHash: completed.profileHash,
        snapshot: { order: [first.id] },
      } });
      await db.aiRun.create({ data: {
        runType: "SCREEN", idempotencyKey: `daily:${completed.executionKey}:fixture`,
        model: "fixture", provider: "fixture", promptVersion: "fixture", inputHash: "fixture",
        attempts: { create: { ordinal: 1, provider: "fixture", model: "fixture", durationMs: 5,
          status: "FAILED", completedAt: new Date() } },
      } });
      await patchPaperState(db, second.id, "default", { note: "Kept separately" });
      await Promise.all([
        patchPaperState(db, second.id, "default", { status: "READING" }),
        patchPaperState(db, second.id, "default", { feedback: "LIKE" }),
        patchPaperState(db, second.id, "default", { isFavorite: true }),
      ]);
      expect(await db.userPaperState.findUnique({ where: { userId_paperId: { userId: "default", paperId: second.id } } }))
        .toMatchObject({ status: "READING", feedback: "LIKE", isFavorite: true, note: "Kept separately" });
      const window = await rankings.window();
      expect(window.map((day) => day.date)).toEqual(["08", "07", "06", "05", "04", "03", "02"].map((d) => "2026-11-" + d));
      expect(window[1]).toMatchObject({ modelAttempts: 1, unmatched: 1, metrics: expect.arrayContaining([
        { method: "keywords", counts: { shown: 1, judged: 0, unjudged: 1, liked: 0, missed: 1 } },
      ]) });
      expect((await rankings.window({ before: "2026-11-08" })).at(-1)?.date).toBe("2026-11-01");
      expect((await db.dailyReport.findUniqueOrThrow({ where: { id: published.id } })).snapshot).toEqual({ order: [first.id] });
      expect((await db.dailyRankingSample.findUniqueOrThrow({ where: { runId: completed.id } })).snapshot).toEqual(snapshot);
    } finally {
      await db.dailyReport.deleteMany({ where: { profileHash: "review-fixture" } });
      await db.dailyRun.deleteMany({ where: { profileHash: "review-fixture" } });
      await db.aiRun.deleteMany({ where: { idempotencyKey: { endsWith: ":fixture" } } });
      await db.paper.deleteMany({ where: { id: { in: [first.id, second.id] } } });
      await db.$disconnect();
    }
  });
});
