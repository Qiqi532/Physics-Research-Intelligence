import { normalizeDoi } from "@pri/domain/paper";
import {
  rankRecommendations,
  type ReadingStatus,
  type RecommendationBreakdown,
  type UserFeedback,
} from "@pri/recommendation/score";
import type { DatabaseClient } from "./client";

const CANDIDATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const SHANGHAI_OFFSET_MINUTES = 8 * 60;

export type TodayTag = {
  slug: string;
  labelZh: string;
  relevance: number;
  isCrossDisciplinary: boolean;
};

export type TodayRecommendation = {
  id: string;
  doi: string | null;
  title: string;
  journal: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
  sourceName: string | null;
  tags: TodayTag[];
  readingStatus: ReadingStatus;
  feedback: UserFeedback;
  isFavorite: boolean;
  hasInterpretation: boolean;
  score: number;
  scoreBreakdown: RecommendationBreakdown;
  reasons: string[];
  stateUpdatedAt: Date | null;
};

export type TodayData = {
  generatedAt: Date;
  stats: {
    newPapers: number;
    openPapers: number;
    interpretedPapers: number;
    crossDisciplinaryPapers: number;
  };
  crossSignals: Array<{
    tagSlug: string;
    labelZh: string;
    paperCount: number;
  }>;
  recommendations: TodayRecommendation[];
  readingQueue: TodayRecommendation[];
};

export type PaperStateInput = {
  userId: string;
  doi: string;
  status: ReadingStatus;
  feedback: UserFeedback;
  note: string | null;
  isFavorite?: boolean;
};

export type StoredPaperState = {
  status: ReadingStatus;
  feedback: UserFeedback;
  note: string | null;
  isFavorite: boolean;
  favoritedAt: Date | null;
  updatedAt: Date;
};

export interface TodayRepository {
  getToday(input: {
    userId: string;
    now: Date;
    candidateLimit: number;
  }): Promise<TodayData>;
  setPaperStateByDoi(input: PaperStateInput): Promise<
    | { status: "updated"; state: StoredPaperState }
    | { status: "not_found" }
  >;
}

export function createTodayRepository(client: DatabaseClient): TodayRepository {
  return {
    async getToday({ userId, now, candidateLimit }) {
      const candidateFrom = new Date(now.getTime() - CANDIDATE_WINDOW_MS);
      const [interestRows, paperRows] = await Promise.all([
        client.userInterest.findMany({
          where: { userId },
          select: { tagSlug: true, weight: true },
        }),
        client.paper.findMany({
          where: {
            OR: [
              { publishedAt: { gte: candidateFrom, lte: now } },
              {
                userStates: {
                  some: { userId, status: { in: ["SAVED", "READING"] } },
                },
              },
            ],
          },
          take: candidateLimit,
          orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            doi: true,
            title: true,
            journal: true,
            publishedAt: true,
            createdAt: true,
            originalUrl: true,
            accessStatus: true,
            sources: {
              take: 1,
              orderBy: [{ retrievedAt: "desc" }, { id: "desc" }],
              select: { sourceName: true },
            },
            classifications: {
              orderBy: [{ relevance: "desc" }, { createdAt: "desc" }, { tagSlug: "asc" }],
              select: {
                tagSlug: true,
                relevance: true,
                createdAt: true,
                tag: {
                  select: {
                    slug: true,
                    labelZh: true,
                    isCrossDisciplinary: true,
                  },
                },
              },
            },
            interpretations: {
              where: { status: "COMPLETE" },
              take: 1,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true },
            },
            userStates: {
              where: { userId },
              take: 1,
              select: {
                status: true,
                feedback: true,
                note: true,
                isFavorite: true,
                updatedAt: true,
              },
            },
          },
        }),
      ]);
      const interests = Object.fromEntries(
        interestRows.map(({ tagSlug, weight }) => [tagSlug, weight]),
      );
      const mappedPapers = paperRows.map((paper) => {
        const classifications = deduplicateClassifications(paper.classifications);
        const state = paper.userStates[0];
        return {
          id: paper.id,
          doi: paper.doi,
          title: paper.title,
          journal: paper.journal,
          publishedAt: paper.publishedAt,
          createdAt: paper.createdAt,
          originalUrl: paper.originalUrl,
          accessStatus: paper.accessStatus,
          sourceName: paper.sources[0]?.sourceName ?? null,
          tags: classifications.map(({ tag, relevance }) => ({
            slug: tag.slug,
            labelZh: tag.labelZh,
            relevance,
            isCrossDisciplinary: tag.isCrossDisciplinary,
          })),
          readingStatus: state?.status ?? "UNREAD",
          feedback: state?.feedback ?? "NONE",
          isFavorite: state?.isFavorite ?? false,
          hasInterpretation: paper.interpretations.length > 0,
          stateUpdatedAt: state?.updatedAt ?? null,
        };
      });
      const ranking = rankRecommendations(
        mappedPapers.map((paper) => ({
          paperId: paper.id,
          publishedAt: paper.publishedAt,
          classifications: paper.tags.map((tag) => ({
            tagSlug: tag.slug,
            tagLabel: tag.labelZh,
            relevance: tag.relevance,
            isCrossDisciplinary: tag.isCrossDisciplinary,
          })),
          interests,
          readingStatus: paper.readingStatus,
          feedback: paper.feedback,
          hasInterpretation: paper.hasInterpretation,
        })),
        now,
      );
      const papersById = new Map(mappedPapers.map((paper) => [paper.id, paper]));
      const ranked = ranking.flatMap((ranked) => {
        const paper = papersById.get(ranked.paperId);
        return paper
          ? [
              {
                ...paper,
                score: ranked.total,
                scoreBreakdown: ranked.breakdown,
                reasons: ranked.reasons,
              },
            ]
          : [];
      });
      // 排序：有解读的论文优先，然后按评分降序
      const recommendations = ranked.sort((a, b) => {
        if (a.hasInterpretation !== b.hasInterpretation) {
          return a.hasInterpretation ? -1 : 1;
        }
        return b.score - a.score || a.id.localeCompare(b.id);
      });

      // 统计昨日数据（上海时区昨日 00:00–24:00），基于入库时间而非发布时间
      const todayStart = startOfDayAtOffset(now, SHANGHAI_OFFSET_MINUTES);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayPapers = recommendations.filter(
        ({ createdAt }) =>
          createdAt !== null && createdAt >= yesterdayStart && createdAt < todayStart,
      );

      return {
        generatedAt: now,
        stats: {
          newPapers: yesterdayPapers.length,
          openPapers: yesterdayPapers.filter(({ accessStatus }) => accessStatus === "OPEN")
            .length,
          interpretedPapers: yesterdayPapers.filter(({ hasInterpretation }) => hasInterpretation)
            .length,
          crossDisciplinaryPapers: yesterdayPapers.filter(({ tags }) =>
            tags.some(({ isCrossDisciplinary }) => isCrossDisciplinary),
          ).length,
        },
        crossSignals: collectCrossSignals(yesterdayPapers),
        recommendations,
        readingQueue: recommendations
          .filter(({ readingStatus }) =>
            readingStatus === "SAVED" || readingStatus === "READING",
          )
          .sort(
            (left, right) =>
              dateValue(right.stateUpdatedAt) - dateValue(left.stateUpdatedAt) ||
              left.id.localeCompare(right.id),
          ),
      };
    },

    async setPaperStateByDoi(input) {
      const doi = normalizeDoi(input.doi);
      const paper = await client.paper.findUnique({
        where: { doi },
        select: { id: true },
      });
      if (!paper) {
        return { status: "not_found" as const };
      }

      const existing = input.isFavorite === undefined
        ? null
        : await client.userPaperState.findUnique({
            where: {
              userId_paperId: { userId: input.userId, paperId: paper.id },
            },
            select: { isFavorite: true, favoritedAt: true },
          });
      const createFavorite = input.isFavorite ?? false;
      const createFavoritedAt = createFavorite ? new Date() : null;
      const favoriteUpdate = input.isFavorite === undefined
        ? {}
        : {
            isFavorite: input.isFavorite,
            favoritedAt: input.isFavorite
              ? existing?.isFavorite ? existing.favoritedAt : new Date()
              : null,
          };

      const state = await client.userPaperState.upsert({
        where: {
          userId_paperId: { userId: input.userId, paperId: paper.id },
        },
        create: {
          userId: input.userId,
          paperId: paper.id,
          status: input.status,
          feedback: input.feedback,
          note: input.note,
          isFavorite: createFavorite,
          favoritedAt: createFavoritedAt,
        },
        update: {
          status: input.status,
          feedback: input.feedback,
          note: input.note,
          ...favoriteUpdate,
        },
        select: {
          status: true,
          feedback: true,
          note: true,
          isFavorite: true,
          favoritedAt: true,
          updatedAt: true,
        },
      });
      return { status: "updated" as const, state };
    },
  };
}

function deduplicateClassifications<T extends { tagSlug: string }>(rows: T[]): T[] {
  const byTag = new Map<string, T>();
  for (const row of rows) {
    if (!byTag.has(row.tagSlug)) {
      byTag.set(row.tagSlug, row);
    }
  }
  return [...byTag.values()];
}

function collectCrossSignals(papers: TodayRecommendation[]): TodayData["crossSignals"] {
  const signals = new Map<string, { labelZh: string; paperIds: Set<string> }>();
  for (const paper of papers) {
    for (const tag of paper.tags) {
      if (!tag.isCrossDisciplinary) {
        continue;
      }
      const signal = signals.get(tag.slug) ?? {
        labelZh: tag.labelZh,
        paperIds: new Set<string>(),
      };
      signal.paperIds.add(paper.id);
      signals.set(tag.slug, signal);
    }
  }
  return [...signals.entries()]
    .map(([tagSlug, signal]) => ({
      tagSlug,
      labelZh: signal.labelZh,
      paperCount: signal.paperIds.size,
    }))
    .sort(
      (left, right) =>
        right.paperCount - left.paperCount || left.tagSlug.localeCompare(right.tagSlug),
    );
}

function startOfDayAtOffset(now: Date, offsetMinutes: number): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) -
      offsetMinutes * 60_000,
  );
}

function dateValue(value: Date | null): number {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}
