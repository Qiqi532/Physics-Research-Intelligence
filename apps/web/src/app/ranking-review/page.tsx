import Link from "next/link";
import { headers } from "next/headers";
import { createPrismaClient, createRankingRepository } from "@pri/db";
import { rankingMethodLabels, rankingWindowDays } from "@pri/domain/ranking-review";
import { PaperFeedbackButtons } from "@/components/paper-feedback-buttons";
import { allowEvidence } from "@/server/evidence";

export const dynamic = "force-dynamic";
export const metadata = { title: "日报排序回放 · PRI", referrer: "no-referrer" as const };
type RankingDays = Awaited<ReturnType<ReturnType<typeof createRankingRepository>["window"]>>;

async function readWindow(): Promise<RankingDays | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  let db: ReturnType<typeof createPrismaClient> | undefined;
  try {
    db = createPrismaClient(url);
    return await createRankingRepository(db).window();
  } catch {
    return null;
  } finally {
    await db?.$disconnect();
  }
}

export default async function RankingReview({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const allowed = allowEvidence(await headers());
  const days = allowed ? await readWindow() : null;
  const { date } = await searchParams;
  const active = days?.find((entry) => entry.date === date) ?? days?.[0];
  return <main className="today-shell evidence-shell" id="main-content">
    <Link href="/">返回 Today Physics</Link>
    <h1>日报排序回放</h1>
    {!allowed ? <p>请从本机打开排序回放。</p> : days === null ? <p role="alert">回放数据库暂时不可用。</p> : <>
      <p>当前研究画像已捕获 {days.length} / {rankingWindowDays} 个不同日报日。回放使用关键词过滤前的候选，模型调用为 0。</p>
      {!active ? <p>暂无符合条件的冻结候选。下一次运行日报并进入筛选时会记录首批候选。</p> : <>
        <nav className="ranking-dates" aria-label="回放日期">
          {days.map((day) => <Link key={day.date} href={`/ranking-review?date=${day.date}`}
            aria-current={day.date === active.date ? "page" : undefined}>{day.date}</Link>)}
        </nav>
        <section className="evidence-panel" aria-labelledby="metrics-title">
          <h2 id="metrics-title">{active.date} 排序比较</h2>
          <p>{active.profileLabel} · {active.candidateCount} 篇候选 · {active.unmatched} 篇未命中关键词</p>
          <p>可用公开种子摘要 {active.availableSeeds.length} / {active.configuredSeeds} 篇。日报审计记录 {active.modelAttempts} 次模型尝试。</p>
          {active.seedCache === "invalid" && <p>本地种子摘要缓存格式无效。</p>}
          <div className="ranking-table"><table>
            <thead><tr><th scope="col">排序</th><th scope="col">前五</th><th scope="col">已评</th>
              <th scope="col">值得精读</th><th scope="col">未评</th><th scope="col">样本中漏选</th></tr></thead>
            <tbody>{active.metrics.map(({ method, counts }) => <tr key={method}>
              <th scope="row">{rankingMethodLabels[method]}</th>
              {counts ? <><td>{counts.shown}</td><td>{counts.judged}</td><td>{counts.liked}</td>
                <td>{counts.unjudged}</td><td>{counts.missed}</td></> : <td colSpan={5}>缺少公开种子摘要</td>}
            </tr>)}</tbody>
          </table></div>
          <p>样本中漏选指已标为值得精读却未进入该方案前五的论文。再次点击已选反馈可清除评价。</p>
        </section>
        <section className="evidence-panel" aria-labelledby="review-title">
          <h2 id="review-title">候选抽查</h2>
          <p>包含三种方案的前五及额外抽样，按固定顺序展示。</p>
          <ul className="evidence-hits">{active.review.map((paper) => <li key={paper.id}>
            <h3>{paper.title}</h3>
            {paper.excerpt && <details><summary>查看公开摘要摘录</summary><p>{paper.excerpt}</p></details>}
            {paper.editable ? <PaperFeedbackButtons paperId={paper.id} feedback={paper.feedback} /> :
              <p>仅保留冻结的题录。</p>}
          </li>)}</ul>
        </section>
      </>}
    </>}
  </main>;
}
