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
            <p>全物理视野 · 可解释推荐 · 可追溯解读</p>
          </div>
        </section>

        {view.kind === "error" ? (
          <StatusPanel title={view.title} message={view.message} />
        ) : (
          <>
            <TodayOverview stats={view.data.stats} />
            {view.kind === "empty" ? (
              <StatusPanel title="今天的论文池还是空的" message={view.emptyMessage} />
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
                    <p className="section-note">评分由兴趣、分类、时间、跨方向和阅读状态组成</p>
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
