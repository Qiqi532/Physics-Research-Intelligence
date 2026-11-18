"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { EvidenceHit } from "@pri/domain/evidence";
import { EvidenceComparisonEditor } from "./evidence-comparison-editor";

export function EvidenceSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EvidenceHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy || !query.trim()) return;
    setBusy(true); setError(false); setResults(null);
    try {
      const response = await fetch("/api/evidence/search", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }), cache: "no-store" });
      if (!response.ok) throw new Error("search_failed");
      setResults((await response.json()).results);
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="evidence-panel" aria-label="检索原文">
    <form onSubmit={search} className="evidence-search">
      <label htmlFor="evidence-query">课题问题或原文关键词</label>
      <div><input id="evidence-query" required maxLength={300} value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="例如：栅压如何改变光电流极性？" /><button disabled={busy} type="submit">{busy ? "检索中…" : "检索证据"}</button></div>
    </form>
    <div aria-live="polite">
      {error && <p role="alert">检索暂时不可用，请检查数据库后重试。</p>}
      {results?.length === 0 && <p>没有找到匹配的证据页。可尝试英文术语、材料名或文中数值。</p>}
      {!!results?.length && <ol className="evidence-hits">{results.map((hit) => <li key={hit.id + hit.page}>
        <p className="evidence-meta">{hit.role} · 物理第 {hit.page} / {hit.pageCount} 页{hit.status === "columns" ? " · 双栏，建议核对原页" : ""}</p>
        <h2>{hit.title}</h2><blockquote>{hit.quote}</blockquote>
        <Link className="text-link" href={`/evidence/${hit.id}/${hit.page}`} prefetch={false}>打开证据页</Link>
        <EvidenceComparisonEditor source={{ documentId: hit.id, page: hit.page }} initialQuote={hit.quote} />
      </li>)}</ol>}
    </div>
  </section>;
}
