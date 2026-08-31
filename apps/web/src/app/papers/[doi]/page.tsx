import Link from "next/link";
import { notFound } from "next/navigation";
import { PaperInterpretation } from "@/components/paper-interpretation";
import { PaperStateControls } from "@/components/paper-state-controls";
import { StatusPanel } from "@/components/status-panel";
import { presentPaperDetail } from "@/presentation/paper";
import { loadPaperDetailState } from "@/server/papers";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ doi: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export default async function PaperDetailPage({ params }: PageProps) {
  const { doi } = await params;
  const view = presentPaperDetail(await loadPaperDetailState(doi));
  if (view.kind === "not_found") {
    notFound();
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <Link className="brand" href="/">
          PRI <span>Today Physics</span>
        </Link>
        <Link className="header-back" href="/">
          ← 返回首页
        </Link>
      </header>
      <main className="paper-detail-shell" id="main-content">
        {view.kind === "error" ? (
          <StatusPanel
            actionHref="/"
            actionLabel="返回 Today Physics"
            title={view.title}
            message={view.message}
          />
        ) : (
          <>
            <header className="paper-hero">
              <div className="paper-hero-meta">
                <span className={`access-badge access-${view.data.accessStatus.toLowerCase()}`}>
                  {view.accessLabel}
                </span>
                <span>
                  {view.data.publishedAt
                    ? dateFormatter.format(new Date(view.data.publishedAt))
                    : "日期待确认"}
                </span>
              </div>
              <p className="paper-journal">{view.data.journal ?? "期刊待确认"}</p>
              <h1>{view.title}</h1>
              <p className="paper-author">
                {view.data.firstAuthor ?? "作者待确认"}
                {view.data.doi ? ` · DOI ${view.data.doi}` : " · 暂无 DOI"}
              </p>
              <ul className="tag-list" aria-label="物理标签">
                {view.data.tags.length > 0 ? (
                  view.data.tags.map((tag) => <li key={tag.slug}>{tag.labelZh}</li>)
                ) : (
                  <li className="tag-pending">尚待分类</li>
                )}
              </ul>
              <div className="paper-hero-actions">
                {view.data.originalUrl ? (
                  <a
                    className="button-link"
                    href={view.data.originalUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    打开原文 <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <span className="muted-label">暂无原文链接</span>
                )}
                <span className="access-disclosure">{view.accessLabel}</span>
              </div>
            </header>

            {view.data.doi ? (
              <PaperStateControls
                doi={view.data.doi}
                currentStatus={view.data.userState?.status ?? "UNREAD"}
                currentFeedback={view.data.userState?.feedback ?? "NONE"}
              />
            ) : null}

            <PaperInterpretation view={view} />

            <section className="provenance" aria-labelledby="provenance-title">
              <div className="section-heading-row">
                <div>
                  <p className="section-kicker">Public facts</p>
                  <h2 id="provenance-title">来源披露</h2>
                </div>
              </div>
              {view.data.sources.length === 0 ? (
                <p className="empty-copy">暂无可展示的来源快照。</p>
              ) : (
                <ul className="source-list">
                  {view.data.sources.map((source) => (
                    <li key={source.id}>
                      <div>
                        <strong>{source.sourceName}</strong>
                        <span>{source.sourceRecordId}</span>
                      </div>
                      <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                        查看公开来源 ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
