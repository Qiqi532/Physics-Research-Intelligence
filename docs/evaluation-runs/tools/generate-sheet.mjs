import fs from 'node:fs';

const ROOT = 'D:/Physics Research Intelligence/docs/evaluation-runs';
const snap = JSON.parse(fs.readFileSync(ROOT + '/output-snapshot-2026-09-03.json', 'utf8'));
const today = JSON.parse(fs.readFileSync(ROOT + '/today-response-2026-09-03.json', 'utf8'));

const targets = [
  '10.1103/94sm-dm7x', '10.1103/zbfv-zx72', '10.1103/8fr2-cyf5',
  '10.3847/2041-8213/ae9a89', '10.3847/2041-8213/ae984f',
  '10.1186/s43593-026-00141-0', '10.1002/lpor.71822',
  '10.1093/mnras/stag1623',
  '10.1126/science.ads5962', '10.1126/science.adt1712', '10.1126/science.adx1707',
];

function tagsOf(p) {
  const rows = p.classifications || [];
  return rows.map((c) => c.tagSlug).filter(Boolean);
}

function preflight(p) {
  const flags = [];
  const hasAbs = !!(p.abstract && p.abstract.trim().length > 0);
  const content = p.interpretations?.[0]?.content;
  if (!content) return { flags, hasAbs };
  const fields = ['overviewZh', 'innovations', 'limitations', 'methodsAndEvidence',
    'significanceAndImpact', 'relatedWork', 'openQuestions', 'keyResults', 'experimentalSetup', 'futureDirections'];
  const arr = (x) => (x == null ? [] : (Array.isArray(x) ? x : [x]));
  let quoteNull = 0;
  for (const f of fields) {
    for (const it of arr(content[f])) {
      if (!it || !it.evidenceReferences) continue;
      for (const r of it.evidenceReferences) {
        const q = r?.quote;
        if (q == null || String(q).trim().toLowerCase() === 'null') quoteNull++;
      }
    }
  }
  if (quoteNull > 0) flags.push(`H: 引用字段含 ${quoteNull} 处字面 "null"（无实际证据）`);
  if (content.basis === 'abstract_only' && !hasAbs) flags.push('M: basis=abstract_only 但论文无摘要（语义失真，实际仅元数据）');
  const tags = tagsOf(p);
  if (tags.length <= 1) flags.push('L: 仅 1 个分类标签（跨方向覆盖可能不足）');
  return { flags, hasAbs };
}

const byDoi = {};
for (const p of snap.papers) byDoi[p.doi] = p;
const todayByDoi = {};
for (const r of today.recommendations || []) todayByDoi[r.doi] = r;

let md = '';
md += '# 试点评审工作表 — 11 篇已解读论文（零成本样本）\n\n';
md += '快照：`docs/evaluation-runs/output-snapshot-2026-09-03.json`（11 篇，kimi/kimi-k2.6/interpret-v1，commit `6ab9658`）\n\n';
md += '本表由自动预检生成。**"预检红旗"列是机器扫出的可疑点，不是结论** —— 红旗处需人工核实，干净处也需抽查。\n\n';

const inTodayList = targets.filter((d) => todayByDoi[d]).map((d) => targets.indexOf(d) + 1).sort((a, b) => a - b);
md += '> **开评前必读（2026-09-03 环境核对后追加）**：推荐理由（第 5 维）和跨方向（第 6 维）只有出现在 `/api/today` 里的论文才能评。\n';
md += `> 11 篇中当前在 Today 候选池内的有 **${inTodayList.length}** 篇：#${inTodayList.join(' / #')}（见文末"推荐理由证据"一节）。\n`;
md += '> 建议首批按能覆盖全部 6 个维度的有摘要、在 Today 的论文开评（如 #06 → #07 → #05 → #04），再评无摘要的 #01/#02/#03（第 5/6 维记 N/A）。\n\n';

md += '| # | DOI | 标题 | 摘要 | 在 Today | 分类标签 | 预检红旗 | 分类 | 中文忠实 | 创新证据 | 局限 | 推荐理由 | 跨方向 | 证据与缺陷笔记 |\n';
md += '|---:|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|\n';

targets.forEach((doi, i) => {
  const p = byDoi[doi];
  const n = String(i + 1).padStart(2, '0');
  if (!p) { md += `| ${n} | ${doi} | **快照缺失** | — | — | — | — | | | | | | | |\n`; return; }
  const { flags, hasAbs } = preflight(p);
  const tags = tagsOf(p);
  const inT = todayByDoi[doi];
  const title = (p.title || '').slice(0, 54);
  const flagStr = flags.length ? flags.map((f) => '· ' + f).join('<br>') : '无';
  md += `| ${n} | \`${doi}\` | ${title}… | ${hasAbs ? '有' : '**无**'} | ${inT ? '是' : '否'} | ${tags.join('/') || '—'} | ${flagStr} | | | | | | | |\n`;
});

md += '\n---\n\n';
md += '## 推荐理由证据（来自 /api/today，仅供第 5/6 维评分参照）\n\n';
md += '> 此节自动抓取，避免评审时反复请求接口。机器生成，人工核对需以论文详情页实际展示为准。\n\n';
for (const doi of targets) {
  const r = todayByDoi[doi];
  if (!r) continue;
  const p = byDoi[doi];
  md += `### ${doi} — ${(p?.title || '').slice(0, 60)}\n`;
  md += `- **综合分**：${r.score?.toFixed?.(1) ?? r.score}　**解读**：${r.hasInterpretation ? '有' : '无'}\n`;
  md += `- **分类标签（Today 视角）**：${r.tags.map((t) => `${t.slug}(相关度 ${t.relevance}${t.isCrossDisciplinary ? '，跨方向' : ''})`).join('；')}\n`;
  if (r.scoreBreakdown) md += `- **评分拆解**：${JSON.stringify(r.scoreBreakdown)}\n`;
  if (r.reasons?.length) {
    md += '- **推荐理由**：\n';
    for (const x of r.reasons) md += `  - ${x}\n`;
  }
  md += '\n';
}

md += '---\n\n';
md += '## 预检汇总\n\n';
md += '- 论文总数：**11**；无摘要 3 篇全部 HIGH 红旗，有摘要 8 篇中 3 篇零红旗。\n';
md += '- 无摘要论文：`10.1103/94sm-dm7x`、`10.1103/zbfv-zx72`、`10.1103/8fr2-cyf5`。\n\n';
md += '## 预检发现的两个产品缺陷（建议直接开 issue）\n\n';
md += '1. **引用字段被填成字面量 `"null"`（6 处）。** 无摘要论文的 `evidenceReferences[].quote` 出现字符串 `"null"`，却仍带有 `evidenceLevel`。这不是模型编造（正文措辞诚实），但引用字段没做空值处理，把不可用证据包装成看起来可用的引用。\n';
md += '2. **`basis` 字段语义失真。** 无摘要时仍写入 `basis: "abstract_only"`，实际证据只来自元数据。\n';
md += '3. **证据等级过宽。** 有 3 处 `evidenceLevel: "direct"` 的证据实际来自 metadata（标题推导），应降级为 `inferred`。\n\n';
md += '**根因**：摘要缺失时管线没阻断/降级，照常生成完整结构。建议解读前校验摘要存在性：无摘要则标记 `basis: "metadata_only"`、拒绝填引用、或置 `SKIPPED`。\n\n';
md += '## 人工核对时特别注意\n\n';
md += '- **不要因为"模型诚实声明了摘要缺失"就给低分。** 第 1 维（分类）与第 2 维（中文忠实）分开看：措辞诚实是加分，引用填 `"null"` 是独立工程缺陷，记入缺陷清单而非打在忠实性维度。\n';
md += '- **"仅 1 个分类标签"不等于分类错误。** 需人工判断是真单方向还是漏标跨方向标签——后者才扣分。\n';
md += '- **8 篇有摘要的论文要抽查，不要略过。** 机器查不出"忠实但遗漏重要限定条件"（rubric 第 2 维 3 分档），这正是人工评审不可替代处。\n';

fs.writeFileSync(ROOT + '/2026-09-03-pilot-review-sheet.md', md);
console.log('written. inToday count =', inTodayList.length, 'papers:', inTodayList.join(','));
