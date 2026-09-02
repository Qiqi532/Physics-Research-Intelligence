"use client";

import { useCallback, useState } from "react";
import type { TodayRecommendationDto } from "@/presentation/today";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

type InterpretState = "idle" | "loading" | "in_progress" | "success" | "failed";

type InterpretUiOutcome = {
  state: Exclude<InterpretState, "idle" | "loading">;
  error: string | null;
};

export function interpretUiOutcome(
  httpStatus: number,
  responseOk: boolean,
  payload: unknown,
): InterpretUiOutcome {
  const data = isRecord(payload) ? payload : {};
  if (httpStatus === 202 || data.status === "in_progress") {
    return { state: "in_progress", error: null };
  }
  if (
    responseOk &&
    (data.status === "complete" || data.status === "duplicate")
  ) {
    return { state: "success", error: null };
  }
  return {
    state: "failed",
    error: typeof data.errorCode === "string"
      ? data.errorCode
      : "解读请求失败",
  };
}

export function RecommendationCard({ paper }: { paper: TodayRecommendationDto }) {
  const detailHref = paper.doi ? `/papers/${encodeURIComponent(paper.doi)}` : null;
  const sourceLine = [paper.sourceName, paper.journal].filter(Boolean).join(" · ");
  const [interpretState, setInterpretState] = useState<InterpretState>("idle");
  const [interpretError, setInterpretError] = useState<string | null>(null);

  const handleInterpret = useCallback(async () => {
    if (!paper.doi || interpretState === "loading") return;
    setInterpretState("loading");
    setInterpretError(null);
    try {
      const response = await fetch(
        `/api/papers/${encodeURIComponent(paper.doi)}/interpret`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      const outcome = interpretUiOutcome(response.status, response.ok, data);
      setInterpretState(outcome.state);
      setInterpretError(outcome.error);
      if (outcome.state === "success") {
        // 延迟刷新页面，让用户看到成功状态
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setInterpretError("网络错误，请稍后重试");
      setInterpretState("failed");
    }
  }, [paper.doi, interpretState]);

  return (
    <article className="paper-card">
      <div className="paper-card-topline">
        <span className={`access-badge access-${paper.accessStatus.toLowerCase()}`}>
          {accessLabel(paper.accessStatus)}
        </span>
        <span className="paper-date">
          {paper.publishedAt ? dateFormatter.format(new Date(paper.publishedAt)) : "日期待确认"}
        </span>
      </div>
      <div>
        <p className="paper-source">{sourceLine || "来源待确认"}</p>
        <h3>{paper.title}</h3>
      </div>
      <ul className="tag-list" aria-label="物理标签">
        {paper.tags.length > 0 ? (
          paper.tags.map((tag) => <li key={tag.slug}>{tag.labelZh}</li>)
        ) : (
          <li className="tag-pending">尚待分类</li>
        )}
      </ul>
      <div className="reason-box">
        <p className="reason-title">为什么推荐</p>
        <ul>
          {paper.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="paper-card-actions">
        {detailHref ? (
          <a className="text-link" href={detailHref}>
            {paper.hasInterpretation ? "查看解读" : "详情页"}
          </a>
        ) : (
          <span className="muted-label">暂无 DOI 详情页</span>
        )}
        {!paper.hasInterpretation && paper.doi && (
          <button
            type="button"
            className="text-link interpret-button"
            onClick={handleInterpret}
            disabled={
              interpretState === "loading" ||
              interpretState === "in_progress" ||
              interpretState === "success"
            }
          >
            {interpretState === "loading"
              ? "AI 解读中..."
              : interpretState === "in_progress"
                ? "解读任务进行中"
              : interpretState === "success"
                ? "解读完成，刷新中..."
                : interpretState === "failed"
                  ? "重试解读"
                  : "AI 解读"}
          </button>
        )}
        {interpretError && (
          <span className="muted-label error-label">{interpretError}</span>
        )}
        {paper.originalUrl ? (
          <a
            className="text-link external-link"
            href={paper.originalUrl}
            rel="noreferrer"
            target="_blank"
          >
            原文入口 <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="muted-label">暂无原文链接</span>
        )}
      </div>
    </article>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function accessLabel(status: TodayRecommendationDto["accessStatus"]): string {
  if (status === "OPEN") {
    return "开放获取";
  }
  if (status === "RESTRICTED") {
    return "可能需要校园网/VPN";
  }
  return "访问状态待确认";
}
