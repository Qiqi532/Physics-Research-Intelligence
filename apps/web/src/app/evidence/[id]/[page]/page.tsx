import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { allowEvidence, validDocumentId, withEvidence } from "@/server/evidence";

export const dynamic = "force-dynamic";
export const metadata = { title: "原文证据页 · PRI", referrer: "no-referrer" as const };
export default async function EvidenceReader({ params }: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await params;
  if (!allowEvidence(await headers()) || !validDocumentId(id) || !/^[1-9]\d{0,4}$/.test(page)) notFound();
  const number = Number(page);
  const result = await withEvidence((repo) => repo.page(id, number));
  if (!result) notFound();
  const title = result.document.zoteroLocations[0]?.title ?? result.document.title ?? result.document.locations[0]?.name ?? "历史文件版本";
  return <main className="today-shell evidence-shell">
    <Link href="/evidence">返回本地证据检索</Link><h1>{title}</h1>
    <nav className="evidence-pagination" aria-label="原文翻页">
      {number > 1 && <Link href={`/evidence/${id}/${number - 1}`}>上一页</Link>}
      <strong>物理第 {number} / {result.document.pageCount} 页</strong>
      {number < result.document.pageCount && <Link href={`/evidence/${id}/${number + 1}`}>下一页</Link>}
    </nav>
    <iframe className="evidence-viewer" key={id + page} title={`PDF 原文第 ${page} 页`} src={`/pri-evidence-reader.html#${id}/${page}`} />
    <details className="evidence-panel"><summary>查看本页提取文字</summary>
      {result.status === "columns" && <p>此页有多栏排版，请对照原件核对段落顺序。</p>}
      <pre>{result.text || "此页没有可检索文字，可能为扫描件或提取失败。"}</pre>
    </details></main>;
}
