import { describe, expect, it } from "vitest";
import { PaperInterpretation } from "../../apps/web/src/components/paper-interpretation";
import { PaperPublicAbstract } from "../../apps/web/src/components/paper-public-abstract";
import {
  favoritePayloadForToggle,
  readingStatePayloadForAction,
} from "../../apps/web/src/components/paper-state-controls";
import { ReadingQueue } from "../../apps/web/src/components/reading-queue";
import { RecommendationCard } from "../../apps/web/src/components/recommendation-card";
import { TodayOverview } from "../../apps/web/src/components/today-overview";
import { presentPaperDetail } from "../../apps/web/src/presentation/paper";
import type { TodayRecommendationDto } from "../../apps/web/src/presentation/today";

describe("Today Physics server components", () => {
  it("renders all four Today statistics", () => {
    const output = textContent(
      TodayOverview({
        stats: {
          newPapers: 12,
          openPapers: 8,
          interpretedPapers: 5,
          crossDisciplinaryPapers: 3,
        },
      }),
    );

    expect(output).toContain("今日新论文 12");
    expect(output).toContain("开放获取 8");
    expect(output).toContain("已有解读 5");
    expect(output).toContain("跨方向信号 3");
  });

  it("renders required paper-card facts, reasons and links", () => {
    const tree = RecommendationCard({ paper: recommendation() });
    const output = textContent(tree);
    const hrefs = collectProps(tree, "href");

    expect(output).toContain("A recommended paper");
    expect(output).toContain("arXiv · Test Physics");
    expect(output).toContain("2026年8月30日");
    expect(output).toContain("原子、分子与光学");
    expect(output).toContain("为什么推荐");
    expect(output).toContain("开放获取");
    expect(hrefs).toContain("/papers/10.1103%2Fexample");
    expect(hrefs).toContain("https://example.test/paper");
  });

  it("renders an explicit empty reading queue", () => {
    const output = textContent(ReadingQueue({ papers: [] }));

    expect(output).toContain("阅读队列");
    expect(output).toContain("还没有稍后读或正在阅读的论文");
  });
});

describe("paper interpretation component", () => {
  it("keeps the public abstract visible when AI interpretation is missing", () => {
    expect(textContent(PaperPublicAbstract({ abstract: "A verified public abstract." })))
      .toContain("公开摘要 A verified public abstract.");
    expect(textContent(PaperPublicAbstract({ abstract: null })))
      .toContain("该公开来源未提供摘要");
  });

  it("renders bilingual overview, required fields and evidence boundaries", () => {
    const view = presentPaperDetail({ kind: "ready", data: paperDetail() });
    if (view.kind !== "ready") {
      throw new Error("Expected a ready fixture");
    }

    const output = textContent(PaperInterpretation({ view }));

    expect(output).toContain("中文概述");
    expect(output).toContain("English abstract");
    expect(output).toContain("研究问题");
    expect(output).toContain("创新");
    expect(output).toContain("方法与证据");
    expect(output).toContain("局限");
    expect(output).toContain("证据等级：原文直接信息");
    expect(output).toContain("证据等级：归纳推断");
    expect(output).toContain("证据等级：不确定");
    expect(output).toContain("置信度：高");
    expect(output).toContain("基于摘要解读");
  });
});

describe("paper state controls", () => {
  it("clears a previous dislike when the reader chooses an active reading state", () => {
    expect(readingStatePayloadForAction("SAVED", "DISLIKE")).toEqual({
      status: "SAVED",
      feedback: "NONE",
    });
    expect(readingStatePayloadForAction("READING", "LIKE")).toEqual({
      status: "READING",
      feedback: "LIKE",
    });
    expect(readingStatePayloadForAction("SKIPPED", "NONE")).toEqual({
      status: "SKIPPED",
      feedback: "DISLIKE",
    });
  });
});

describe("paper favorite control", () => {
  it("toggles an explicit favorite boolean while preserving reading state and feedback", () => {
    expect(favoritePayloadForToggle("READING", "LIKE", false)).toEqual({
      status: "READING",
      feedback: "LIKE",
      isFavorite: true,
    });
    expect(favoritePayloadForToggle("SAVED", "NONE", true)).toEqual({
      status: "SAVED",
      feedback: "NONE",
      isFavorite: false,
    });
    expect(favoritePayloadForToggle("COMPLETE", "DISLIKE", false)).toEqual({
      status: "COMPLETE",
      feedback: "DISLIKE",
      isFavorite: true,
    });
  });
});

function recommendation(): TodayRecommendationDto {
  return {
    id: "paper-1",
    doi: "10.1103/example",
    title: "A recommended paper",
    journal: "Test Physics",
    publishedAt: "2026-08-30T01:00:00.000Z",
    originalUrl: "https://example.test/paper",
    accessStatus: "OPEN",
    sourceName: "arXiv",
    tags: [
      {
        slug: "amo-optics",
        labelZh: "原子、分子与光学",
        relevance: 0.8,
        isCrossDisciplinary: false,
      },
    ],
    readingStatus: "UNREAD",
    feedback: "NONE",
    isFavorite: false,
    hasInterpretation: true,
    score: 72,
    scoreBreakdown: {
      interest: 32,
      classification: 24,
      recency: 16,
      discovery: 0,
      readingState: 0,
    },
    reasons: ["匹配你的「原子、分子与光学」兴趣（相关度 80%）"],
  };
}

function paperDetail() {
  const direct = claim("中文概述。", "direct" as const);
  return {
    id: "paper-1",
    doi: "10.1103/example",
    title: "A safe paper",
    abstract: "Public English abstract.",
    journal: "Test Physics",
    firstAuthor: "A. Researcher",
    publishedAt: "2026-08-20T00:00:00.000Z",
    originalUrl: "https://example.test/paper",
    accessStatus: "RESTRICTED" as const,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    sources: [],
    tags: [],
    interpretation: {
      status: "complete" as const,
      basis: "abstract_only" as const,
      sourceDisclosure: "基于摘要解读" as const,
      overviewZh: direct,
      researchQuestion: claim("研究问题。", "inferred" as const),
      innovations: [claim("创新点。", "inferred" as const)],
      methodsAndEvidence: [claim("方法与证据。", "direct" as const)],
      limitations: [claim("仍需核验。", "uncertain" as const)],
      readingAdvice: ["先读摘要。"],
      provider: "openai",
      model: "fixture-model",
      promptVersion: "interpret-v1",
      createdAt: "2026-08-30T00:00:00.000Z",
    },
    userState: null,
  };
}

function claim<T extends "direct" | "inferred" | "uncertain">(
  text: string,
  evidenceLevel: T,
) {
  return {
    text,
    evidenceLevel,
    evidenceReferences: [{ source: "abstract" as const, locator: "sentence 1" }],
  };
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).filter(Boolean).join(" ");
  }
  if (isElementLike(node)) {
    return textContent(node.props.children);
  }
  return "";
}

function collectProps(node: unknown, name: string): unknown[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectProps(child, name));
  }
  if (!isElementLike(node)) {
    return [];
  }
  return [
    ...(name in node.props ? [node.props[name]] : []),
    ...collectProps(node.props.children, name),
  ];
}

function isElementLike(value: unknown): value is { props: Record<string, unknown> } {
  return typeof value === "object" && value !== null && "props" in value;
}
