import { recommendationReasons } from "./reasons";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type ReadingStatus = "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
export type UserFeedback = "NONE" | "LIKE" | "DISLIKE";

export type RecommendationClassification = {
  tagSlug: string;
  tagLabel: string;
  relevance: number;
  isCrossDisciplinary: boolean;
};

export type RecommendationInput = {
  paperId: string;
  publishedAt: Date | null;
  classifications: RecommendationClassification[];
  interests: Readonly<Record<string, number>>;
  readingStatus: ReadingStatus;
  feedback: UserFeedback;
  hasInterpretation: boolean;
};

export type RecommendationBreakdown = {
  interest: number;
  classification: number;
  recency: number;
  discovery: number;
  readingState: number;
};

export type RecommendationScore = {
  total: number;
  breakdown: RecommendationBreakdown;
  reasons: string[];
};

export type RankedRecommendation = RecommendationScore & {
  paperId: string;
  publishedAt: Date | null;
};

export function scoreRecommendation(
  input: RecommendationInput,
  now: Date,
): RecommendationScore {
  const classificationValues = input.classifications.map((classification) => ({
    ...classification,
    relevance: clamp(classification.relevance, 0, 1),
  }));
  const classificationRelevance = maxOf(
    classificationValues.map(({ relevance }) => relevance),
  );
  const interestMatch = maxOf(
    classificationValues.map(
      ({ tagSlug, relevance }) =>
        relevance * (clamp(input.interests[tagSlug] ?? 0, 0, 2) / 2),
    ),
  );
  const crossDisciplinaryRelevance = maxOf(
    classificationValues
      .filter(({ isCrossDisciplinary }) => isCrossDisciplinary)
      .map(({ relevance }) => relevance),
  );

  const breakdown: RecommendationBreakdown = {
    interest: round(interestMatch * 40),
    classification: round(classificationRelevance * 30),
    recency: recencyScore(input.publishedAt, now),
    discovery: round(crossDisciplinaryRelevance * 10),
    readingState: readingStateScore(input.readingStatus, input.feedback),
  };
  const total = round(
    breakdown.interest +
      breakdown.classification +
      breakdown.recency +
      breakdown.discovery +
      breakdown.readingState,
  );

  return {
    total,
    breakdown,
    reasons: recommendationReasons(input, breakdown),
  };
}

export function rankRecommendations(
  inputs: RecommendationInput[],
  now: Date,
): RankedRecommendation[] {
  return inputs
    .map((input) => ({
      paperId: input.paperId,
      publishedAt: input.publishedAt,
      ...scoreRecommendation(input, now),
    }))
    .sort(
      (left, right) =>
        right.total - left.total ||
        dateValue(right.publishedAt) - dateValue(left.publishedAt) ||
        left.paperId.localeCompare(right.paperId),
    );
}

function recencyScore(publishedAt: Date | null, now: Date): number {
  if (!publishedAt) {
    return 0;
  }

  const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / DAY_MS);
  return round(20 * Math.max(0, 1 - ageDays / 30));
}

function readingStateScore(status: ReadingStatus, feedback: UserFeedback): number {
  const statusScore: Record<ReadingStatus, number> = {
    UNREAD: 0,
    SAVED: 10,
    READING: 8,
    COMPLETE: -20,
    SKIPPED: -35,
  };
  const feedbackScore: Record<UserFeedback, number> = {
    NONE: 0,
    LIKE: 8,
    DISLIKE: -25,
  };
  return statusScore[status] + feedbackScore[feedback];
}

function maxOf(values: number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, value), 0);
}

function dateValue(value: Date | null): number {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
