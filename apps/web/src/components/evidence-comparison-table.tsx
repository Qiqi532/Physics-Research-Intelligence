"use client";

import Link from "next/link";
import { useState } from "react";
import {
  comparisonMeasurements, illuminationLabels, type ComparisonFields, type ComparisonRow,
} from "@pri/domain/evidence-comparison";
import { EvidenceComparisonEditor } from "./evidence-comparison-editor";

export function EvidenceComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const count = rows.filter((row) => selected.includes(row.id)).length;
  return <>
    <form id="comparison-export" action="/api/evidence/comparison/export" className="evidence-tools">
      <label><input type="checkbox" checked={count === rows.length} onChange={(event) =>
        setSelected(event.target.checked ? rows.map((row) => row.id) : [])} /> 全选本页</label>
      <span aria-live="polite">已选 {count} 行</span>
      <button type="submit" name="format" value="md" disabled={!count}>导出 Markdown</button>
      <button type="submit" name="format" value="csv" disabled={!count}>导出 CSV</button>
    </form>
    <div className="ranking-table evidence-comparison-table" role="region" tabIndex={0} aria-label="器件测量记录">
      <table>
        <thead><tr><th scope="col">导出</th><th scope="col">论文与证据页</th><th scope="col">材料与器件</th>
          <th scope="col">偏压与工况</th><th scope="col">入射光</th><th scope="col">光响应</th><th scope="col">记录</th>
        </tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id}>
          <td><input name="row" type="checkbox" form="comparison-export" value={row.id} aria-label={`勾选第 ${index + 1} 行`}
            checked={selected.includes(row.id)} onChange={(event) => {
              const checked = event.target.checked;
              setSelected((current) => checked ? [...current, row.id] : current.filter((id) => id !== row.id));
            }} /></td>
          <th scope="row">{row.sourceTitle}
            <p><Link className="text-link" href={`/evidence/${row.documentId}/${row.page}`} prefetch={false}>物理第 {row.page} 页</Link>
              {row.figure && <> · {row.figure}</>}</p>
            {row.quote && <details><summary>原文摘录</summary><blockquote>{row.quote}</blockquote></details>}
          </th>
          <td>{row.fields.material}{row.fields.structure && <p>{row.fields.structure}</p>}</td>
          <td><Quantity fields={row.fields} name="gate" /><Quantity fields={row.fields} name="drain" />
            {row.fields.conditions && <p>{row.fields.conditions}</p>}</td>
          <td><Quantity fields={row.fields} name="wavelength" /><Quantity fields={row.fields} name="illumination" /></td>
          <td><Quantity fields={row.fields} name="responsivity" /><Quantity fields={row.fields} name="responseTime" /></td>
          <td><EvidenceComparisonEditor row={row} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function Quantity({ fields, name }: { fields: ComparisonFields; name: keyof typeof comparisonMeasurements }) {
  const quantity = fields[name];
  if (!quantity) return null;
  const label = name === "illumination" && fields.illuminationKind
    ? illuminationLabels[fields.illuminationKind] : comparisonMeasurements[name];
  return <p>{label} {quantity.value} {quantity.unit}</p>;
}
