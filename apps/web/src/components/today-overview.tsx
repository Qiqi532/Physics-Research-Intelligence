import type { TodayStatsDto } from "@/presentation/today";

const STAT_LABELS: Array<{ key: keyof TodayStatsDto; label: string }> = [
  { key: "newPapers", label: "今日新论文" },
  { key: "openPapers", label: "开放获取" },
  { key: "interpretedPapers", label: "已有解读" },
  { key: "crossDisciplinaryPapers", label: "跨方向信号" },
];

export function TodayOverview({ stats }: { stats: TodayStatsDto }) {
  return (
    <section className="overview-panel" aria-labelledby="today-overview-title">
      <div className="section-heading-row">
        <div>
          <p className="section-kicker">Daily signal</p>
          <h2 id="today-overview-title">今日统计</h2>
        </div>
        <p className="section-note">以上海自然日统计</p>
      </div>
      <dl className="stat-grid">
        {STAT_LABELS.map(({ key, label }) => (
          <div className="stat-item" key={key}>
            <dt>{label}</dt>
            <dd>{stats[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
