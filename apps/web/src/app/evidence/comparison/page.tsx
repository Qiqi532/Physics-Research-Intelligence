import Link from "next/link";
import { headers } from "next/headers";
import { EvidenceComparisonTable } from "@/components/evidence-comparison-table";
import { allowEvidence, withEvidence } from "@/server/evidence";

export const dynamic = "force-dynamic";
export const metadata = { title: "器件证据对照表 · PRI", referrer: "no-referrer" as const };

export default async function ComparisonPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const allowed = allowEvidence(await headers());
  const requested = (await searchParams).page;
  const number = typeof requested === "string" && /^[1-9]\d{0,5}$/.test(requested) ? Number(requested) : 1;
  const result = allowed ? await withEvidence((repo) => repo.comparison.list(number)).catch(() => null) : null;
  return <main className="today-shell evidence-shell">
    <Link href="/evidence" prefetch={false}>返回本地证据检索</Link>
    <h1>器件证据对照表</h1>
    {!allowed ? <p>请在本机模式下通过 localhost 或 127.0.0.1 打开。</p> : !result
      ? <p role="alert">对照表暂时不可用，请检查 PostgreSQL 和数据库迁移。</p>
      : <>
        <p>从检索结果或原文页添加记录。勾选本页所需行后导出。</p>
        {result.rows.length ? <EvidenceComparisonTable rows={result.rows} /> : <p>本页没有对照记录。</p>}
        {(number > 1 || result.hasNext) && <nav className="evidence-pagination" aria-label="对照表翻页">
          {number > 1 && <Link href={`/evidence/comparison?page=${number - 1}`} prefetch={false}>上一页</Link>}
          <span>第 {number} 页</span>
          {result.hasNext && <Link href={`/evidence/comparison?page=${number + 1}`} prefetch={false}>下一页</Link>}
        </nav>}
      </>}
  </main>;
}
