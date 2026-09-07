#!/usr/bin/env node
/**
 * Preflight check for AI interpretation outputs before human review.
 *
 * Scans an exported snapshot for evidence-integrity problems so that human
 * attention is spent on the suspicious rows instead of reading everything.
 *
 * Usage:
 *   node docs/evaluation-runs/tools/preflight-check.mjs <snapshot.json> [--json]
 *
 * Rules:
 *   HIGH  quote is the literal string "null"/"none"  -> unusable evidence presented as evidence
 *   HIGH  locator/source claims abstract but the paper has no abstract
 *   HIGH  a quote cannot be located in the field it cites (abstract or metadata)
 *   HIGH  evidenceLevel is direct/inferred but there is no reference at all
 *   MED   basis="abstract_only" while the paper has no abstract (misleading field)
 *   MED   evidenceLevel=direct while the evidence comes from metadata (title inference)
 *   MED   limitations is empty
 *   LOW   only one classification tag
 *
 * Deliberately NOT flagged:
 *   - Meta-absence quotes ("摘要未提及X") are legitimate uncertainty markers,
 *     not fabricated evidence.
 *   - ISO datetime formatting differences (.000Z vs +00:00).
 */

import fs from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const snapshotPath = args[0];

if (!snapshotPath) {
  console.error('usage: node preflight-check.mjs <snapshot.json> [--json]');
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

const norm = (s) =>
  String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[$$$]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 3);

const META_ABSENCE =
  /未提及|未涉及|未说明|未给出|未提供|未包含|未描述|未明确|未报告|未披露|无摘要|摘要缺失|摘要信息缺失|无法从|无法获取|无法确定|无法评估|无法验证|信息不足|缺乏|not (?:provided|reported|available|specified|stated)/i;
const NULLISH = /^(null|none|n\/a|undefined|-|)$/i;

const findQuote = (quote, hay) => {
  const q = norm(quote);
  const h = norm(hay);
  if (!q) return { ok: false, how: 'empty-quote' };
  if (!h) return { ok: false, how: 'empty-source' };
  if (h.includes(q)) return { ok: true, how: 'exact' };
  const dq = q.match(/^(\d{4})\s+(\d{2})\s+(\d{2})/);
  const dh = h.match(/(\d{4})\s+(\d{2})\s+(\d{2})/);
  if (dq && dh && dq[0] === dh[0]) return { ok: true, how: 'date-only' };
  const head = q.split(' ').slice(0, 12).join(' ');
  if (head.length > 20 && h.includes(head)) return { ok: true, how: 'head' };
  const qt = tokens(q);
  if (qt.length >= 4) {
    const r = qt.filter((t) => h.includes(t)).length / qt.length;
    return { ok: r >= 0.8, how: 'tokens-' + r.toFixed(2) };
  }
  return { ok: h.includes(q), how: 'short' };
};

const rows = [];

for (const p of snap.papers) {
  const abs = p.abstract || '';
  const hasAbs = abs.trim().length > 0;
  const metaHay = [p.title, p.journal, p.publishedAt].filter(Boolean).join(' || ');
  const c = p.interpretations?.[0]?.content || {};
  const flags = [];

  const walk = (label, items) => {
    if (!Array.isArray(items)) return;
    items.forEach((it, i) => {
      const lvl = it.evidenceLevel;
      const refs = Array.isArray(it.evidenceReferences) ? it.evidenceReferences : [];
      if ((lvl === 'direct' || lvl === 'inferred') && refs.length === 0) {
        flags.push({ sev: 'high', msg: `${label}[${i}] level=${lvl} 但无任何引用` });
        return;
      }
      refs.forEach((r, j) => {
        const src = String(r.source || '').toLowerCase();
        const loc = String(r.locator || '').toLowerCase();
        if (NULLISH.test(String(r.quote))) {
          flags.push({ sev: 'high', msg: `${label}[${i}].ref[${j}] 引用值为字面 "null"（无实际证据）` });
          return;
        }
        if (META_ABSENCE.test(String(r.quote))) return;
        if (src === 'metadata') {
          if (loc === 'abstract' && !hasAbs) {
            flags.push({ sev: 'high', msg: `${label}[${i}].ref[${j}] locator=abstract 但论文无摘要` });
            return;
          }
          if (!findQuote(r.quote, metaHay).ok) {
            flags.push({ sev: 'high', msg: `${label}[${i}].ref[${j}] 元数据引用在标题/期刊/日期中找不到` });
          }
          if (lvl === 'direct') {
            flags.push({ sev: 'med', msg: `${label}[${i}] level=direct 但证据来自 metadata（标题推导，非摘要实证）` });
          }
        } else if (src === 'abstract') {
          if (!hasAbs) {
            flags.push({ sev: 'high', msg: `${label}[${i}].ref[${j}] 声称引用摘要但论文无摘要` });
          } else if (!findQuote(r.quote, abs).ok) {
            flags.push({ sev: 'high', msg: `${label}[${i}].ref[${j}] 摘要引用找不到 (${findQuote(r.quote, abs).how})` });
          }
        } else {
          flags.push({ sev: 'low', msg: `${label}[${i}].ref[${j}] 未知 source=${r.source}` });
        }
      });
    });
  };

  walk('overviewZh', c.overviewZh ? [c.overviewZh] : []);
  walk('innovations', c.innovations);
  walk('limitations', c.limitations);
  walk('methodsAndEvidence', c.methodsAndEvidence);

  if (c.basis === 'abstract_only' && !hasAbs) {
    flags.push({ sev: 'med', msg: 'basis=abstract_only 但论文无摘要（字段语义误导，实际仅元数据）' });
  }
  if (Array.isArray(c.limitations) && c.limitations.length === 0) {
    flags.push({ sev: 'med', msg: 'limitations 为空' });
  }
  const cls = p.classifications || [];
  if (cls.length === 0) flags.push({ sev: 'high', msg: '无分类' });
  else if (cls.length === 1) flags.push({ sev: 'low', msg: '仅 1 个分类标签（跨方向覆盖可能不足）' });

  const sev = { high: 0, med: 0, low: 0 };
  for (const f of flags) sev[f.sev]++;

  rows.push({
    doi: p.doi,
    title: p.title,
    journal: p.journal,
    hasAbs,
    absLen: abs.trim().length,
    tags: cls.map((x) => x.tagSlug + ':' + x.relevance).join(', '),
    innovations: (c.innovations || []).length,
    limitations: (c.limitations || []).length,
    sev,
    flags,
  });
}

const totals = rows.reduce(
  (a, r) => ({ high: a.high + r.sev.high, med: a.med + r.sev.med, low: a.low + r.sev.low }),
  { high: 0, med: 0, low: 0 },
);

if (asJson) {
  console.log(JSON.stringify({ snapshot: snapshotPath, totals, rows }, null, 2));
} else {
  console.log('snapshot:', snapshotPath);
  console.log('papers:', rows.length, '| HIGH:', totals.high, ' MED:', totals.med, ' LOW:', totals.low, '\n');
  [...rows]
    .sort((a, b) => b.sev.high - a.sev.high || b.sev.med - a.sev.med)
    .forEach((r) => {
      console.log('● ' + r.doi + '  [H' + r.sev.high + '/M' + r.sev.med + '/L' + r.sev.low + ']' + (r.hasAbs ? '' : '  <<无摘要>>'));
      console.log('  ' + r.title.slice(0, 66));
      r.flags.forEach((f) => console.log('   [' + f.sev.toUpperCase() + '] ' + f.msg));
      console.log('');
    });
}

process.exitCode = totals.high > 0 ? 0 : 0;
