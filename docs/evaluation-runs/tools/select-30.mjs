import fs from 'node:fs';

const ROOT = 'D:/Physics Research Intelligence';
const manifest = JSON.parse(fs.readFileSync(ROOT + '/data/journal-corpus/manifest.json', 'utf8'));
const papers = Array.isArray(manifest) ? manifest : (manifest.papers || manifest.records || []);

const dirMap = {
  'physics.atom-ph': 'amo-optics', 'physics.optics': 'amo-optics', 'quant-ph': 'amo-optics', 'cond-mat.quant-gas': 'amo-optics',
  'cond-mat.mtrl-sci': 'condensed-matter-materials', 'cond-mat.str-el': 'condensed-matter-materials',
  'cond-mat.mes-hall': 'condensed-matter-materials', 'cond-mat.other': 'condensed-matter-materials',
  'cond-mat.supr-con': 'condensed-matter-materials', 'cond-mat.dis-nn': 'condensed-matter-materials',
  'cond-mat.stat-mech': 'statistical-computational', 'cond-mat.soft': 'biophysics',
  'physics.comp-ph': 'statistical-computational', 'stat.ML': 'statistical-computational',
  'physics.data-an': 'statistical-computational', 'cs.LG': 'statistical-computational',
  'hep-ph': 'high-energy-particle', 'hep-ex': 'high-energy-particle', 'hep-th': 'high-energy-particle', 'gr-qc': 'high-energy-particle',
  'nucl-ex': 'nuclear', 'nucl-th': 'nuclear',
  'astro-ph.GA': 'astrophysics', 'astro-ph.CO': 'astrophysics', 'astro-ph.HE': 'astrophysics',
  'astro-ph.SR': 'astrophysics', 'astro-ph.EP': 'astrophysics', 'astro-ph.IM': 'astrophysics',
  'physics.plasm-ph': 'plasma', 'physics.space-ph': 'plasma',
  'physics.bio-ph': 'biophysics', 'q-bio.BM': 'biophysics', 'q-bio.QM': 'biophysics',
};

const zh = {
  'amo-optics': '原子、分子与光学', 'condensed-matter-materials': '凝聚态与材料',
  'high-energy-particle': '高能与粒子物理', 'nuclear': '核物理', 'astrophysics': '天体物理',
  'statistical-computational': '统计与计算物理', 'plasma': '等离子体物理', 'biophysics': '生物物理',
  'cross-disciplinary': '交叉物理',
};

// Rubric quota
const quota = {
  'amo-optics': 4, 'condensed-matter-materials': 4, 'high-energy-particle': 3, 'nuclear': 3,
  'astrophysics': 4, 'statistical-computational': 3, 'plasma': 3, 'biophysics': 3, 'cross-disciplinary': 3,
};

// Pool: only papers with a DOI (detail page + reading state are DOI-keyed)
const pool = {};
for (const t of Object.keys(quota)) pool[t] = [];
const noDoi = [];
let crossCatCount = 0;
for (const p of papers) {
  const cats = p.categories || [p.primary_category];
  const primary = p.primary_category;
  const dir = dirMap[primary] || 'cross-disciplinary';
  if (cats.length > 1) crossCatCount++;
  const rec = { arxivId: p.arxiv_id, doi: p.doi, title: p.title, journal: p.journal, primary, cats };
  if (!p.doi) { noDoi.push(rec); continue; }
  pool[dir].push(rec);
}

const order = ['amo-optics', 'condensed-matter-materials', 'astrophysics', 'nuclear', 'plasma', 'statistical-computational', 'biophysics', 'high-energy-particle', 'cross-disciplinary'];

// Carry categories so we can flag cross-field samples later
function carry(rec, dir) { return { ...rec, dir, cats: rec.cats || [] }; }

console.log('=== 45 篇素材按方向分布（仅含 DOI 的可评审项）===');
for (const t of order) console.log('  ' + zh[t].padEnd(10) + ' (' + t + '): ' + pool[t].length);
console.log('  无 DOI 被排除: ' + noDoi.length + ' 篇');
console.log('  多分类(候选交叉): ' + crossCatCount + ' 篇');

// Allocate up to quota; for directions with 0, leave gap and reallocate to surplus.
const selected = [];
const note = {};
for (const t of order) {
  const arr = pool[t];
  const take = Math.min(quota[t], arr.length);
  if (take < quota[t]) note[t] = '配额 ' + quota[t] + '，实有 ' + arr.length + '，缺口 ' + (quota[t] - take);
  for (const x of arr.slice(0, take)) selected.push(carry(x, t));
}

// Fill to 30 from surplus directions (those with leftover after quota)
let remaining = 30 - selected.length;
const surplusOrder = ['amo-optics', 'condensed-matter-materials', 'astrophysics', 'nuclear', 'plasma', 'statistical-computational', 'biophysics'];
if (remaining > 0) {
  for (const t of surplusOrder) {
    if (remaining <= 0) break;
    const used = selected.filter((s) => s.dir === t).length;
    const extra = pool[t].slice(used, used + remaining);
    for (const x of extra) { selected.push(carry(x, t)); remaining--; }
  }
}
console.log('\n=== 已选 ' + selected.length + ' 篇（目标 30）===');
for (const t of order) {
  const c = selected.filter((s) => s.dir === t).length;
  if (c) console.log('  ' + zh[t].padEnd(10) + ': ' + c + ' 篇' + (note[t] ? '  ⚠ ' + note[t] : ''));
}

// Coverage gaps
const gaps = order.filter((t) => pool[t].length === 0);
console.log('\n方向覆盖缺口（45 篇素材完全不含）: ' + (gaps.map((g) => zh[g]).join('、') || '无'));

// Write draft sheet
let md = '# 完整 30 篇自审评分表（基于 45 篇 journal-corpus 素材）\n\n';
md += '快照版本：待产出（运行 `corpus:journal:trial` 后回填）。\n';
md += '生成日期：2026-09-03。候选素材：`data/journal-corpus/manifest.json`（45 篇，仅取有 DOI 的）。\n\n';
md += '> **引导说明**：本表前 5 列已由脚本从 45 篇素材按方向分配生成；第 6 列（AI 输出）需先运行管线产出后回填；第 7–12 列为 6 维评分，第 13 列为证据笔记。\n';
md += '> 评分维度与等级标准见 `docs/evaluation-rubric.md`；完整操作步骤见 `docs/evaluation-runs/2026-09-03-self-review-guide.md`。\n\n';

const gapText = gaps.length ? '⚠ **方向覆盖缺口**：本素材不含【' + gaps.map((g) => zh[g]).join('、') + '】方向的论文，这 ' + gaps.reduce((s, g) => s + quota[g], 0) + ' 个配额位已从富余方向（AMO/凝聚态）补足，因此本次自审**不覆盖**这些方向。若要完整覆盖，需另补抓对应方向 arXiv 论文。' : '';
if (gapText) md += '> ' + gapText + '\n\n';

md += '| # | arXiv ID | DOI | 标题 | 方向 | AI 输出 | 分类正确性 | 中文忠实性 | 创新点证据 | 局限与边界 | 推荐理由真实性 | 跨方向发现价值 | 证据与缺陷笔记 |\n';
md += '|---:|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|\n';
selected.forEach((s, i) => {
  const n = String(i + 1).padStart(2, '0');
  md += '| ' + n + ' | `' + s.arxivId + '` | ' + (s.doi || '—') + ' | ' + (s.title || '').slice(0, 46) + '… | ' + zh[s.dir] + ' | 待产出 | | | | | | | |\n';
});

// Cross-field sample hints: which selected rows are multi-category
const multiCat = selected
  .map((s, i) => ({ n: i + 1, s }))
  .filter(({ s }) => s.cats && s.cats.length > 1);
const crossDiscipline = selected
  .map((s, i) => ({ n: i + 1, s }))
  .filter(({ s }) => s.dir === 'cross-disciplinary');
md += '\n## 跨方向信号样本指引（评分维度 6 与冷启动覆盖用）\n\n';
md += '- **多分类论文（交叉信号样本，建议优先用于维度 6）**：本 30 篇中共有 **' + multiCat.length + '** 篇带多 arXiv 分类，对应行号：\n';
for (const { n, s } of multiCat) {
  md += '  - #' + String(n).padStart(2, '0') + ' `' + s.arxivId + '` (' + zh[s.dir] + '): 分类 ' + s.cats.join(' / ') + '\n';
}
md += '- **显式交叉方向论文**：**' + crossDiscipline.length + '** 篇，对应行号：\n';
for (const { n, s } of crossDiscipline) {
  md += '  - #' + String(n).padStart(2, '0') + ' `' + s.arxivId + '` (' + zh[s.dir] + '): 分类 ' + s.cats.join(' / ') + '\n';
}
md += '\n> 维度 5（推荐理由）与维度 6（跨方向价值）依赖已记录的兴趣（见 plan 第 2 节）。开评前请确认 `/settings/interests` 已设置，否则这两维只能评冷启动分支，样本价值大幅下降。\n';

fs.writeFileSync(ROOT + '/docs/evaluation-runs/2026-09-03-full-review-sheet.md', md);
console.log('\n已写出 docs/evaluation-runs/2026-09-03-full-review-sheet.md');
