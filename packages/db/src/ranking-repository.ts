import { rankingSnapshotSchema, rankingWindowDays, replayRanking, type RankingFeedback } from "@pri/domain/ranking-review";
import type { DatabaseClient } from "./client";

export function createRankingRepository(client: DatabaseClient) {
  return {
    async window({ before, userId = "default" }: { before?: string; userId?: string } = {}) {
      const dateRange = before ? { dateKey: { lt: before } } : {};
      const orderBy = [{ dateKey: "desc" as const }, { capturedAt: "desc" as const }, { runId: "asc" as const }];
      const latest = await client.dailyRankingSample.findFirst({ where: dateRange, orderBy, select: { profileHash: true } });
      if (!latest) return [];
      const samples = await client.dailyRankingSample.findMany({
        where: { profileHash: latest.profileHash, ...dateRange }, orderBy, distinct: ["dateKey"], take: rankingWindowDays,
        include: { run: { select: { executionKey: true, profileLabel: true, status: true, stage: true } } },
      });
      const frozen = samples.map((sample) => ({ ...sample, snapshot: rankingSnapshotSchema.parse(sample.snapshot) }));
      const ids = [...new Set(frozen.flatMap((sample) =>
        replayRanking(sample.snapshot, sample.dateKey, new Map()).review.map((paper) => paper.id)))];
      const [papers, attempts] = await Promise.all([
        ids.length ? client.paper.findMany({
          where: { id: { in: ids } }, select: { id: true, userStates: { where: { userId }, select: { feedback: true } } },
        }) : [],
        Promise.all(frozen.map(({ run }) => client.aiRunAttempt.count({
          where: { aiRun: { idempotencyKey: { startsWith: `daily:${run.executionKey}:` } } },
        }))),
      ]);
      const labels = new Map(papers.map((paper) => [paper.id, paper.userStates[0]?.feedback ?? "NONE"] as const));
      return frozen.map((sample, i) => {
        const replay = replayRanking(sample.snapshot, sample.dateKey, labels);
        return {
          date: sample.dateKey, profileLabel: sample.run.profileLabel, status: sample.run.status, stage: sample.run.stage,
          capturedAt: sample.capturedAt, configuredSeeds: sample.snapshot.configuredSeeds,
          availableSeeds: sample.snapshot.availableSeeds, seedCache: sample.snapshot.seedCache,
          candidateCount: sample.snapshot.papers.length, unmatched: replay.unmatched, modelAttempts: attempts[i],
          metrics: replay.metrics, review: replay.review.map((paper) => ({ ...paper, editable: labels.has(paper.id),
            feedback: (labels.get(paper.id) ?? "NONE") as RankingFeedback })),
        };
      });
    },
  };
}
