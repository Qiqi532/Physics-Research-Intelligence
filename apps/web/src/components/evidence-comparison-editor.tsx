"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  comparisonMeasurements, comparisonQuoteLimit, illuminationLabels, measurementKeys,
  type ComparisonRow, type ComparisonSource,
} from "@pri/domain/evidence-comparison";

type Props = { source: Pick<ComparisonSource, "documentId" | "page">; initialQuote?: string } | { row: ComparisonRow };

const errors: Record<string, string> = {
  invalid_row: "请填写摘录或图表号。测量值和单位须成对填写，并注明入射量类型。",
  quote_mismatch: "摘录须与所选物理页的提取文字一致。请复制该页中的原句。",
  page_missing: "这一版本的证据页暂时不可用。",
  row_missing: "该条记录已移除，请刷新对照表。",
};

export function EvidenceComparisonEditor(props: Props) {
  const router = useRouter();
  const row = "row" in props ? props.row : null;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const fields = row?.fields;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "");
    const quantities = Object.fromEntries(measurementKeys.map((key) => {
      const amount = value(key + "-value");
      const unit = value(key + "-unit");
      return [key, amount.trim() || unit.trim() ? { value: amount, unit } : null];
    }));
    const content = {
      quote: value("quote"), figure: value("figure"), fields: {
        material: value("material"), structure: value("structure"), conditions: value("conditions"),
        illuminationKind: value("illuminationKind") || null, ...quantities,
      },
    };
    await save("source" in props ? "POST" : "PATCH", {
      ...("source" in props ? props.source : { id: props.row.id }), ...content,
    }, () => { if (!row) form.reset(); });
  }
  async function save(method: string, body: object, onSuccess?: () => void) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/evidence/comparison", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
      });
      if (!response.ok) {
        const error = (await response.json()).error;
        setNotice({ text: errors[error] ?? "对照表暂时不可用，请稍后重试。", error: true });
        return;
      }
      onSuccess?.();
      setNotice({ text: method === "POST" ? "已加入对照表。" : method === "DELETE" ? "已移除记录。" : "已保存修改。" });
      if (row) router.refresh();
    } catch { setNotice({ text: "对照表暂时不可用，请稍后重试。", error: true }); }
    finally { setBusy(false); }
  }
  return <details className="evidence-editor">
    <summary>{row ? "编辑记录" : "加入对照表"}</summary>
    <form className="evidence-form" onSubmit={submit}>
      <p>每行记录一组测量条件。波长或偏压变化时请另加一行。缺失项留空。</p>
      <label>原文摘录<textarea name="quote" rows={3} maxLength={comparisonQuoteLimit}
        defaultValue={row?.quote ?? ("initialQuote" in props ? props.initialQuote : undefined)} /></label>
      <div className="evidence-fields">
        <label>图表号<input name="figure" maxLength={120} defaultValue={row?.figure} placeholder="例如 Fig. 2b" /></label>
        <label>材料<input name="material" maxLength={180} defaultValue={fields?.material} /></label>
        <label>器件结构<input name="structure" maxLength={240} defaultValue={fields?.structure} /></label>
      </div>
      <label>测量工况<textarea name="conditions" rows={2} maxLength={600} defaultValue={fields?.conditions} /></label>
      <label>入射量类型<select name="illuminationKind" defaultValue={fields?.illuminationKind ?? ""}>
        <option value="">未填写</option>
        {Object.entries(illuminationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <div className="evidence-fields">{measurementKeys.map((key) => <fieldset className="evidence-quantity" key={key}>
        <legend>{comparisonMeasurements[key]}</legend>
        <label>数值<input name={key + "-value"} maxLength={80} defaultValue={fields?.[key]?.value} /></label>
        <label>单位<input name={key + "-unit"} maxLength={40} defaultValue={fields?.[key]?.unit} /></label>
      </fieldset>)}</div>
      <p className="evidence-meta">图中读数可填写图表号，并从证据页复核。保留论文所用单位。</p>
      <div className="evidence-tools">
        <button type="submit" disabled={busy}>{busy ? "处理中…" : row ? "保存修改" : "保存到对照表"}</button>
        {row && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm("移除这条对照记录？")) void save("DELETE", { id: row.id });
        }}>移除记录</button>}
      </div>
      {notice && <p role={notice.error ? "alert" : "status"}>{notice.text}
        {!notice.error && !row && <> <Link className="text-link" href="/evidence/comparison" prefetch={false}>查看对照表</Link></>}
      </p>}
    </form>
  </details>;
}
