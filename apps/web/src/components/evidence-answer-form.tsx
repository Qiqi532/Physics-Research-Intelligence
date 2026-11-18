"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { EvidenceAnswer, EvidenceAnswerScope } from "@pri/domain/evidence-answer";

export function EvidenceAnswerForm({ documents, initialDocument }: {
  documents: { id: string; title: string }[];
  initialDocument?: string;
}) {
  const [scope, setScope] = useState<EvidenceAnswerScope>("single");
  const [documentId, setDocument] = useState(initialDocument ?? "");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<EvidenceAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy || !query.trim() || (scope === "single" && !documentId)) return;
    setBusy(true);
    setError(false);
    setAnswer(null);
    try {
      const response = await fetch("/api/evidence/answer", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ query, scope, ...(scope === "single" ? { documentId } : {}) }),
      });
      if (!response.ok) throw new Error("answer_unavailable");
      setAnswer(await response.json());
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <section className="evidence-panel" aria-label="提问">
    <form className="evidence-form" onSubmit={ask}>
      <label>检索范围<select value={scope} disabled={busy} onChange={(event) => {
        setScope(event.target.value === "cross" ? "cross" : "single");
        setAnswer(null);
      }}><option value="single">单篇论文</option><option value="cross">跨篇查证</option></select></label>
      {scope === "single" && <label>论文<select required value={documentId} disabled={busy} onChange={(event) => {
        setDocument(event.target.value);
        setAnswer(null);
      }}>
        <option value="">请选择已索引的 PDF</option>
        {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
      </select></label>}
      <label>证据问题<textarea required maxLength={300} rows={3} value={query} disabled={busy}
        placeholder="例如 532 nm 下的响应度是多少？" onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="evidence-tools"><button type="submit" disabled={busy}>{busy ? "检索证据中…" : "回答并引用原文"}</button></div>
    </form>
    <div aria-live="polite">
      {error && <p role="alert">问答暂时不可用，请检查本地数据库后重试。</p>}
      {answer?.status === "insufficient" && <p role="status">{scope === "cross"
        ? "当前索引中未找到至少两篇同时支持所问术语和条件的论文。可用单篇查证。"
        : "当前范围内缺少足以引用的原文。可试试论文所用术语，或拆开不同工况分别查证。"}</p>}
      {answer?.status === "answered" && <>
        <h2>{scope === "cross" ? "各篇证据" : "支持这一问题的原文"}</h2>
        <ol className="evidence-hits">{answer.references.map((ref, index) => <li key={ref.id + ":" + ref.page}>
          <p className="evidence-meta">{ref.title}{ref.status === "columns" && " · 双栏，建议核对原页"}</p>
          <blockquote>{ref.quote}</blockquote>
          <Link className="text-link" href={`/evidence/${ref.id}/${ref.page}`} prefetch={false}>[{index + 1}] 物理第 {ref.page} 页</Link>
        </li>)}</ol>
      </>}
    </div>
  </section>;
}
