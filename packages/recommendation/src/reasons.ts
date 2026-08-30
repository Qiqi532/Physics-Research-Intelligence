import type {
  RecommendationBreakdown,
  RecommendationInput,
} from "./score";

type ReasonCandidate = {
  priority: number;
  text: string;
};

export function recommendationReasons(
  input: RecommendationInput,
  breakdown: RecommendationBreakdown,
): string[] {
  const reasons: ReasonCandidate[] = [];
  const strongestInterest = input.classifications
    .map((classification) => ({
      classification,
      weight: clamp(input.interests[classification.tagSlug] ?? 0, 0, 2),
    }))
    .filter(({ weight }) => weight > 0)
    .sort(
      (left, right) =>
        right.classification.relevance * right.weight -
          left.classification.relevance * left.weight ||
        left.classification.tagSlug.localeCompare(right.classification.tagSlug),
    )[0];

  if (strongestInterest && breakdown.interest > 0) {
    reasons.push({
      priority: 100,
      text: `匹配你的「${strongestInterest.classification.tagLabel}」兴趣（相关度 ${toPercent(strongestInterest.classification.relevance)}）`,
    });
  }

  if (breakdown.discovery > 0) {
    reasons.push({ priority: 90, text: "跨方向信号：连接多个物理方向" });
  }

  if (input.readingStatus === "SAVED") {
    reasons.push({ priority: 80, text: "已加入你的稍后阅读队列" });
  } else if (input.readingStatus === "READING") {
    reasons.push({ priority: 80, text: "你正在阅读这篇论文" });
  }

  const strongestClassification = input.classifications.slice().sort(
    (left, right) =>
      clamp(right.relevance, 0, 1) - clamp(left.relevance, 0, 1) ||
      left.tagSlug.localeCompare(right.tagSlug),
  )[0];
  if (strongestClassification && breakdown.classification > 0) {
    reasons.push({
      priority: 70,
      text: `物理主题相关度 ${toPercent(strongestClassification.relevance)}`,
    });
  }

  if (input.classifications.length === 0 && breakdown.recency > 0) {
    reasons.push({ priority: 65, text: "新近收录，尚待完成物理分类" });
  } else if (breakdown.recency >= 15) {
    reasons.push({ priority: 60, text: "发表于最近一周，时效性较高" });
  }

  if (input.feedback === "LIKE") {
    reasons.push({ priority: 50, text: "符合你此前标记为感兴趣的阅读反馈" });
  }

  if (reasons.length === 0) {
    reasons.push({ priority: 0, text: "近期论文池中的可探索条目" });
  }

  return reasons
    .sort((left, right) => right.priority - left.priority || left.text.localeCompare(right.text))
    .slice(0, 3)
    .map(({ text }) => text);
}

function toPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
