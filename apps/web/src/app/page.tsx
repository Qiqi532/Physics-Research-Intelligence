import Link from "next/link";
import { ReadingQueue } from "@/components/reading-queue";
import { RecommendationCard } from "@/components/recommendation-card";
import { StatusPanel } from "@/components/status-panel";
import { TodayOverview } from "@/components/today-overview";
import { presentToday } from "@/presentation/today";
import { loadTodayPageState } from "@/server/today";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "full",
  timeZone: "Asia/Shanghai",
});

export default async function HomePage() {
  const view = presentToday(await loadTodayPageState());

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <Link className="brand" href="/">
          PRI <span>Physics Research Intelligence</span>
        </Link>
        <nav className="site-nav" aria-label="主要导航">
          <Link className="header-link" href="/settings/interests">兴趣设置</Link>
          <Link className="header-link" href="/settings/models">模型管理台</Link>
          <Link className="header-link" href="/library">我的收藏</Link>
        </nav>
      </header>
      <main className="today-shell" id="main-content">
        <section className="hero">
          <div>
            <p className="eyebrow">Physics Research Intelligence</p>
            <h1>Today Physics</h1>
          </div>
          <div className="hero-note">
            <p>{dateFormatter.format(new Date())}</p>
            <p>课题追踪 · 固定日报 · 摘要证据</p>
          </div>
        </section>

        {view.kind === "error" ? (
          <StatusPanel title={view.title} message={view.message} />
        ) : (
          <>
            {view.data.report ? (
              <section className="status-panel" aria-label="日报状态">
                <h2>{view.data.report.dateKey ? `${view.data.report.dateKey} 日报` : "尚无日报"}</h2>
                <p>{view.data.report.profileLabel ?? "请配置模型后生成首份推荐"}</p>
                {view.data.report.status === "stale" ? <p>最新排程尚未完成，当前显示上次已发布日报。</p> : null}
                {view.data.report.runStatus === "RUNNING" ? <p>最近任务尚未完成；若进程已退出，重跑可恢复进度。</p> : null}
                {view.data.report.runStatus === "FAILED" || view.data.report.runStatus === "PARTIAL" ? (
                  <p>最近任务未完整完成（{view.data.report.stage} / {view.data.report.errorCode}），已发布名单保持不变。</p>
                ) : null}
                <p>{view.data.report.sourceCoverage.map((source) => `${source.name}：${source.status === "complete" ? "完成" : source.errorCode === "api_key_required_for_paging" ? "仅首页，翻页需免费 API key" : source.status === "limited" ? "达到分页上限，下次继续" : "失败"}（${source.records} 条）`).join("；")}</p>
                <p>公开标题与摘要 · 单模型判断 · 已检查摘录来源，学术结论仍未经独立核验</p>
                {(view.data.report.validation?.unscreenedCandidates ?? 0) > 0 ? <p>{view.data.report.validation!.unscreenedCandidates} 篇候选所在筛选批次未完成，本次未纳入。</p> : null}
                {(view.data.report.validation?.unavailableInterpretations ?? 0) > 0 ? (
                  <p>{view.data.report.validation!.unavailableInterpretations} 篇解读未通过检查，未投递，后续日期可再次参与筛选。</p>
                ) : null}
                {(view.data.report.validation?.titleOnly ?? 0) > 0 ? <p>{view.data.report.validation!.titleOnly} 篇缺少公开摘要，仅展示题录。</p> : null}
              </section>
            ) : null}
            <TodayOverview stats={view.data.stats} />
            {view.kind === "empty" ? (
              <StatusPanel title="暂无推荐条目" message={view.emptyMessage} />
            ) : null}
            <div className="today-layout">
              <div className="today-main-column">
                <section aria-labelledby="cross-signals-title" className="signal-panel">
                  <div className="section-heading-row">
                    <div>
                      <p className="section-kicker">Across fields</p>
                      <h2 id="cross-signals-title">跨方向信号</h2>
                    </div>
                  </div>
                  {view.data.crossSignals.length === 0 ? (
                    <p className="empty-copy">今天尚未检测到明确的交叉方向分类。</p>
                  ) : (
                    <ul className="signal-list">
                      {view.data.crossSignals.map((signal) => (
                        <li key={signal.tagSlug}>
                          <span>{signal.labelZh}</span>
                          <strong>{signal.paperCount} 篇</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="recommendations-title">
                  <div className="section-heading-row section-spaced">
                    <div>
                      <p className="section-kicker">For you</p>
                      <h2 id="recommendations-title">个性推荐</h2>
                    </div>
                    <p className="section-note">按课题与相邻方向筛选；不足 5 篇时允许少推</p>
                  </div>
                  {view.data.recommendations.length === 0 ? (
                    <p className="empty-copy card-empty">暂无可推荐论文。</p>
                  ) : (
                    <div className="recommendation-list">
                      {view.data.recommendations.map((paper) => (
                        <RecommendationCard key={paper.id} paper={paper} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
              <aside className="today-sidebar">
                <ReadingQueue papers={view.data.readingQueue} />
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
