import { dailyReportSchema, expectedReportDate } from "@pri/domain/daily-report";
import { interpretationOutputSchema } from "@pri/ai";
import type { DatabaseClient } from "./client";
import type { TodayData, TodayRecommendation } from "./today-repository";

export async function loadDailyToday(client: DatabaseClient, input: {
  userId: string; now: Date; schedule?: { time: string; timezone: string };
}): Promise<TodayData> {
  const [report, run, queue] = await Promise.all([
    client.dailyReport.findFirst({ orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }] }),
    client.dailyRun.findFirst({ orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }] }),
    client.paper.findMany({ where: { userStates: { some: { userId: input.userId, status: { in: ["SAVED", "READING"] } } } },
      take: 100, orderBy: { updatedAt: "desc" }, include: { userStates: { where: { userId: input.userId }, take: 1 } } }),
  ]);
  const snapshot = report ? dailyReportSchema.parse(report.snapshot) : null;
  const ids = snapshot?.items.map((item) => item.paperId) ?? [];
  const states = ids.length ? await client.userPaperState.findMany({
    where: { userId: input.userId, paperId: { in: ids } },
    select: { paperId: true, status: true, feedback: true, isFavorite: true, updatedAt: true },
  }) : [];
  const byId = new Map(states.map((state) => [state.paperId, state]));
  const recommendations: TodayRecommendation[] = (snapshot?.items ?? []).map((item) => {
    const state = byId.get(item.paperId);
    return { id: item.paperId, doi: item.doi, title: item.title, journal: item.journal,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null, createdAt: new Date(item.createdAt),
      originalUrl: item.originalUrl, accessStatus: item.accessStatus, sourceName: item.sourceName,
      tags: [{ slug: item.topicId, labelZh: item.topicLabel, relevance: item.score, isCrossDisciplinary: item.topicKind === "adjacent" }],
      readingStatus: state?.status ?? "UNREAD", feedback: state?.feedback ?? "NONE", isFavorite: state?.isFavorite ?? false,
      stateUpdatedAt: state?.updatedAt ?? null, hasInterpretation: !!item.interpretation, score: item.score * 100,
      scoreBreakdown: { interest: 0, classification: item.score * 100, recency: 0, discovery: 0, readingState: 0 },
      reasons: item.reasons, evidence: item.evidence,
      ...(item.interpretation ? { reportInterpretation: interpretationOutputSchema.parse(item.interpretation.content) } : {}),
      provenance: { screening: item.screening, interpretation: item.interpretation ? { provider: item.interpretation.provider,
        model: item.interpretation.model, promptVersion: item.interpretation.promptVersion, inputHash: item.interpretation.inputHash } : null },
    };
  });
  const readingQueue: TodayRecommendation[] = queue.map((paper) => ({
    id: paper.id, doi: paper.doi, title: paper.title, journal: paper.journal, publishedAt: paper.publishedAt,
    createdAt: paper.createdAt, originalUrl: paper.originalUrl, accessStatus: paper.accessStatus, sourceName: null,
    tags: [], readingStatus: paper.userStates[0]!.status, feedback: paper.userStates[0]!.feedback,
    isFavorite: paper.userStates[0]!.isFavorite, stateUpdatedAt: paper.userStates[0]!.updatedAt, hasInterpretation: false,
    score: 0, scoreBreakdown: { interest: 0, classification: 0, recency: 0, discovery: 0, readingState: 0 }, reasons: [],
  })).sort((a, b) => b.stateUpdatedAt!.getTime() - a.stateUpdatedAt!.getTime() || a.id.localeCompare(b.id));
  const adjacent = recommendations.filter((paper) => paper.tags.some((tag) => tag.isCrossDisciplinary));
  return { generatedAt: report?.createdAt ?? input.now, recommendations, readingQueue,
    stats: { newPapers: recommendations.length, openPapers: recommendations.filter((paper) => paper.accessStatus === "OPEN").length,
      interpretedPapers: recommendations.filter((paper) => paper.hasInterpretation).length, crossDisciplinaryPapers: adjacent.length },
    crossSignals: [...new Map(adjacent.flatMap((paper) => paper.tags.filter((tag) => tag.isCrossDisciplinary).map((tag) => [tag.slug, tag]))).values()]
      .map((tag) => ({ tagSlug: tag.slug, labelZh: tag.labelZh, paperCount: adjacent.filter((paper) => paper.tags.some((entry) => entry.slug === tag.slug)).length })),
    report: { id: report?.id ?? null, dateKey: report?.dateKey ?? null, profileLabel: snapshot?.profileLabel ?? null,
      status: !report ? "missing" : report.dateKey < expectedReportDate(input.now, input.schedule?.time, input.schedule?.timezone) ? "stale" : "current",
      runStatus: run?.status ?? null, stage: run?.stage ?? null, errorCode: run?.errorCode ?? null,
      sourceCoverage: snapshot?.sourceCoverage ?? [], ...(snapshot ? { validation: snapshot.validation } : {}) },
  };
}
