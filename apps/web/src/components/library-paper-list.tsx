import Link from "next/link";
import { PaperStateControls } from "@/components/paper-state-controls";
import type { FavoritePaperDto } from "@/server/papers";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export function LibraryPaperList({ papers }: { papers: FavoritePaperDto[] }) {
  if (papers.length === 0) {
    return (
      <p className="empty-copy card-empty">
        还没有收藏的论文。在论文详情页点击「收藏」即可加入这里，收藏的论文不会被 30 天清理。
      </p>
    );
  }

  return (
    <ul className="library-list" aria-label="我的收藏论文列表">
      {papers.map((paper) => {
        const detailHref = paper.doi ? `/papers/${encodeURIComponent(paper.doi)}` : null;
        return (
          <li className="library-item" key={paper.id}>
            <article className="paper-card">
              <div className="paper-card-topline">
                <span className={`access-badge access-${paper.accessStatus.toLowerCase()}`}>
                  {accessLabel(paper.accessStatus)}
                </span>
                <span className="paper-date">
                  {paper.publishedAt
                    ? dateFormatter.format(new Date(paper.publishedAt))
                    : "日期待确认"}
                </span>
              </div>
              <p className="paper-source">{paper.journal ?? "期刊待确认"}</p>
              {detailHref ? (
                <h3>
                  <Link href={detailHref}>{paper.title}</Link>
                </h3>
              ) : (
                <h3>{paper.title}</h3>
              )}
              <ul className="tag-list" aria-label="物理标签">
                {paper.tags.length > 0 ? (
                  paper.tags.map((tag) => <li key={tag.slug}>{tag.labelZh}</li>)
                ) : (
                  <li className="tag-pending">尚待分类</li>
                )}
              </ul>
              <p className="paper-favorite-date">
                {`收藏于 ${dateFormatter.format(new Date(paper.favoritedAt))}`}
              </p>
              {paper.doi ? (
                <PaperStateControls
                  doi={paper.doi}
                  currentStatus={paper.readingStatus}
                  currentFeedback={paper.feedback}
                  currentFavorite
                />
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function accessLabel(status: FavoritePaperDto["accessStatus"]): string {
  if (status === "OPEN") {
    return "开放获取";
  }
  if (status === "RESTRICTED") {
    return "可能需要校园网/VPN";
  }
  return "访问状态待确认";
}
