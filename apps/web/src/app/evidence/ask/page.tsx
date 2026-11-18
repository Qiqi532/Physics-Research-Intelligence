import Link from "next/link";
import { headers } from "next/headers";
import { EvidenceAnswerForm } from "@/components/evidence-answer-form";
import { allowEvidence, validDocumentId, withEvidence } from "@/server/evidence";

export const dynamic = "force-dynamic";
export const metadata = { title: "本地证据问答 · PRI", referrer: "no-referrer" as const };

export default async function EvidenceAskPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const allowed = allowEvidence(await headers());
  const requested = (await searchParams).doc;
  const documentId = typeof requested === "string" && validDocumentId(requested) ? requested : undefined;
  const documents = allowed ? await withEvidence((repo) => repo.answerDocuments(documentId)).catch(() => null) : null;
  return <main className="today-shell evidence-shell">
    <Link href="/evidence" prefetch={false}>返回本地证据检索</Link>
    <h1>本地证据问答</h1>
    {!allowed ? <p>请在本机模式下通过 localhost 或 127.0.0.1 打开。</p> : !documents
      ? <p role="alert">问答暂时不可用，请检查 PostgreSQL 和数据库迁移。</p>
      : !documents.length ? <p>请先索引至少一份 PDF。</p>
      : <>
        <p>从已索引 PDF 中摘出可核对的原句。单篇可查某项结果与工况，跨篇逐篇展示对应证据。</p>
        <EvidenceAnswerForm documents={documents} initialDocument={documents.some((doc) => doc.id === documentId) ? documentId : undefined} />
      </>}
  </main>;
}
