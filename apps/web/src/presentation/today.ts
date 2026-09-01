export type TodayStatsDto = {
  newPapers: number;
  openPapers: number;
  interpretedPapers: number;
  crossDisciplinaryPapers: number;
};

export type TodayRecommendationDto = {
  id: string;
  doi: string | null;
  title: string;
  journal: string | null;
  publishedAt: string | null;
  originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
  sourceName: string | null;
  tags: Array<{
    slug: string;
    labelZh: string;
    relevance: number;
    isCrossDisciplinary: boolean;
  }>;
  readingStatus: "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
  feedback: "NONE" | "LIKE" | "DISLIKE";
  isFavorite: boolean;
  hasInterpretation: boolean;
  score: number;
  scoreBreakdown: {
    interest: number;
    classification: number;
    recency: number;
    discovery: number;
    readingState: number;
  };
  reasons: string[];
};

export type TodayDto = {
  generatedAt: string;
  stats: TodayStatsDto;
  crossSignals: Array<{
    tagSlug: string;
    labelZh: string;
    paperCount: number;
  }>;
  recommendations: TodayRecommendationDto[];
  readingQueue: TodayRecommendationDto[];
};

export type TodayLoadState =
  | { kind: "ready"; data: TodayDto }
  | { kind: "error" };

export function presentToday(state: TodayLoadState):
  | {
      kind: "ready";
      data: TodayDto;
      emptyMessage: null;
    }
  | { kind: "empty"; data: TodayDto; emptyMessage: string }
  | { kind: "error"; title: string; message: string } {
  if (state.kind === "error") {
    return {
      kind: "error",
      title: "Today Physics 暂时不可用",
      message: "论文数据暂时无法读取，请稍后重试。",
    };
  }
  const empty =
    state.data.recommendations.length === 0 &&
    state.data.readingQueue.length === 0 &&
    state.data.crossSignals.length === 0;
  if (empty) {
    return {
      kind: "empty",
      data: state.data,
      emptyMessage: "今天还没有可展示的论文，采集完成后会出现在这里。",
    };
  }
  return { kind: "ready", data: state.data, emptyMessage: null };
}
