import type { TodayRecommendationDto } from "@/presentation/today";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export function RecommendationCard({ paper }: { paper: TodayRecommendationDto }) {
  const detailHref = paper.doi ? `/papers/${encodeURIComponent(paper.doi)}` : null;
  const sourceLine = [paper.sourceName, paper.journal].filter(Boolean).join(" · ");

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
            查看解读
          </a>
        ) : (
          <span className="muted-label">暂无 DOI 详情页</span>
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

function accessLabel(status: TodayRecommendationDto["accessStatus"]): string {
  if (status === "OPEN") {
    return "开放获取";
  }
  if (status === "RESTRICTED") {
    return "可能需要校园网/VPN";
  }
  return "访问状态待确认";
}
