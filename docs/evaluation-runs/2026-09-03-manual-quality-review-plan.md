# 30 篇跨方向人工质量评审 — 执行清单

本文件是 `docs/evaluation-rubric.md` 的可执行落地版。Rubric 定义了"评什么、怎么打分"，本文件定义"评哪 30 篇、怎么拿到待评输出、怎么收口"。

状态：**AI 输出和第一轮 AI 初评已完成，第二位人工裁决未开始**。最终分数单元格必须留空，直到人真的读过论文原文与产品输出。

---

## 1. 这次评审要回答的问题

只回答三件事，不要扩大范围：

1. **分类能不能信** — 打上的方向与跨方向标签，是否符合论文实际内容？
2. **中文解读有没有编造** — 概述、创新点、局限，是否忠实于公开摘要，有没有无依据主张？
3. **推荐理由是否诚实有用** — 给出的理由是真的来自记录的兴趣/冷启动逻辑，还是套话？

附带记录：失败模式是否集中在某个方向、某个模型、某类论文（如无摘要、短摘要、综述）。

---

## 2. 前置准备（开评前必须冻结）

评审结果只有绑定版本才有意义。开评前记录下表，之后不允许改动任何一项：

| 项 | 取值方式 | 本次记录 |
|---|---|---|
| 应用 commit | `git rev-parse --short HEAD` | `6ab9658` |
| 分支 | `git branch --show-current` | `codex/review-manual-pipeline-automation` |
| 分类 prompt 版本 | `PaperClassification.promptVersion` | `classify-v1` |
| 解读 prompt 版本 | `PaperInterpretation.promptVersion` | `interpret-v1` |
| 分类 provider / model | `PaperClassification.model` | `kimi-k2.6` |
| 解读 provider / model | `PaperInterpretation.model` | `kimi` / `kimi-k2.6` |
| 评审日期 | 实际日期 | 2026-09-03 |

环境前置：

- [x] Docker Desktop 已启动，`docker compose -f infra/docker-compose.yml ps` 中 PostgreSQL 与 Redis 均 healthy（2026-09-03 已验证）。
- [x] 数据库 schema 已是最新（8 条迁移全部应用，无需再跑 `migrate deploy`）。
- [x] `.env` 与 `apps/web/.env` 已配置 `DATABASE_URL` / `REDIS_URL`，健康检查 `/api/health/ready` 返回 `ready`。
- [x] 模型管理台已有一条连接 `Kimi K2.6 首次试运行`（provider `kimi`，model `kimi-k2.6`，密钥已存），`AiRuntimeRouting` 的 default 路由把分类与解读主/备都指向它。
- [ ] **UserInterest 目前为 0 条** — 开评前必须在 `/settings/interests` 设置兴趣，否则推荐理由全部走冷启动分支，第 5、6 维度无可评内容。

注意：当前库是**开发库**（已含 8938 篇真实采集论文），不是专用评审库。好处是有现成材料，风险是后续管线运行会混入新数据。**开评前先导出快照**，之后每次管线运行都重新导出，避免评审对象被覆盖。

## 2.5 环境验证结果（2026-09-03）

| 检查项 | 结果 |
|---|---|
| PostgreSQL / Redis | healthy |
| 迁移状态 | 8/8 applied，`Database schema is up to date!` |
| `/api/health/ready` | `{"postgres":"ready","redis":"ready","queue":"disabled","worker":"disabled"}` |
| 页面可达性 | `/`、`/library`、`/settings/models`、`/settings/interests`、`/api/today` 均 200 |
| 已有论文 | 8938 篇（openalex 8935 / arxiv 3） |
| 已有 AI 输出 | 分类 22、解读 11（全部 `COMPLETE`）、筛选 24 |
| 模型连接 | 1 条：Kimi K2.6（密钥已存） |

**两个会影响评审的发现：**

1. **`UserInterest` = 0。** 推荐理由维度（第 5 维）与跨方向信号（第 6 维）依赖记录的兴趣。不设置兴趣，这两维只能评冷启动分支，样本价值大幅下降。**这是开评前必须先做的第一步。**
2. **`/api/today` 的 `crossSignals` 目前为空数组。** 与 2026-09-02 审查报告记录的 P1 遗留项一致。若不解决，第 6 维度（跨方向发现价值）将只能打低分或 `N/A`——那得到的不是"产品做得差"，而是"这项能力根本没被测到"。设置兴趣后需复测；仍为空则应先修再评，否则该维度数据无效。

**实际起点：30 篇候选中只有 3 篇已在库内**（`10.1126/science.adt1712`、`10.1126/science.ads5962`、`10.1126/science.adx1707`，且均已解读完成），另外 27 篇尚未入库、更无 AI 输出。

库内另有 8 篇已完成解读但不在候选清单中的论文（Kimi 首轮试运行产物），方向覆盖核物理、天体、AMO、高能。**建议用这批零成本材料先跑通流程**，再决定是否投入预算跑满 30 篇。

---

## 3. 三十篇候选集（基于 45 篇 journal-corpus，无需补抓）

> **2026-09-03 更新（用户最新要求）**：原计划的"review-corpus 9 篇 + journal 21 篇 + 4 篇待补抓"方案**已作废**。改为**全部复用现有 45 篇 `data/journal-corpus/manifest.json`**，由 `tools/select-30.mjs` 按方向配额选出 30 篇，写入 `2026-09-03-full-review-sheet.md`，跨方向样本指引见该表末尾。完整操作步骤见 `2026-09-03-self-review-guide.md`。
> 方向缺口（等离子体/统计/生物物理/高能/交叉各差 1–2 篇）由富余的 AMO/凝聚态补足，故本次自审**不覆盖**这些稀方向的全配额——若需完整覆盖，未来另补抓对应方向 arXiv 论文。
> 以下旧候选表保留备查，不再使用。

选篇依据：优先复用已下载且校验过的本地语料（`data/review-corpus/` 9 篇 + `data/journal-corpus/` 45 篇），按 `docs/evaluation-rubric.md` 的配额分配，只取 manifest 中**有 DOI** 的记录（当前详情与阅读状态以 DOI 为键，无 DOI 无法给出完整详情页）。

配额：AMO/光学 4、凝聚态与材料 4、高能 3、核物理 3、天体 4、统计与计算 3、等离子体 3、生物物理 3、交叉 3。

| # | 方向 | arXiv ID | DOI | 来源 | 备注 |
|---:|---|---|---|---|---|
| 01 | 原子、分子与光学 | 2608.23596 | 10.35848/1347-4065/ad03a6 | review-corpus | 已有本地 PDF |
| 02 | 原子、分子与光学 | 2410.10611v2 | 10.1126/science.adt1712 | journal/Science | 兼 cond-mat.stat-mech, quant-ph |
| 03 | 原子、分子与光学 | 2508.08368v2 | 10.1126/science.aea9413 | journal/Science | 兼 nucl-ex, physics.chem-ph |
| 04 | 原子、分子与光学 | 2604.21383v1 | 10.1103/wmlj-gffb | journal/PRL | 兼 cond-mat.mtrl-sci |
| 05 | 凝聚态与材料 | 2608.28268 | 10.1016/j.jallcom.2026.190702 | review-corpus | 已有本地 PDF |
| 06 | 凝聚态与材料 | 2503.04621v2 | 10.1126/science.adx3027 | journal/Science | 兼 cond-mat.mtrl-sci, physics.app-ph |
| 07 | 凝聚态与材料 | 2506.16346v2 | 10.1126/science.aeh1429 | journal/Science | 兼 physics.app-ph |
| 08 | 凝聚态与材料 | 2608.17627v1 | 10.1103/74ky-d71n | journal/PRL | |
| 09 | 高能与粒子物理 | 2608.28201 | 10.1088/1361-6471/ae9ab6 | review-corpus | 已有本地 PDF |
| 10 | 高能与粒子物理 | 2512.07159v1 | 10.1038/s41586-025-09757-7 | journal/Nature | |
| 11 | 高能与粒子物理 | **待补抓** | — | — | 需 arXiv API 补 1 篇带 DOI 的 hep-* |
| 12 | 核物理 | 2608.25074 | 10.1103/x414-n6g9 | review-corpus | 已有本地 PDF |
| 13 | 核物理 | 2408.15441v2 | 10.1126/science.ads5962 | journal/Science | 兼 hep-ex |
| 14 | 核物理 | 2601.13374v2 | 10.1103/b2t4-km2r | journal/PRL | 兼 astro-ph.HE, hep-ph |
| 15 | 天体物理 | 2608.28388 | 10.1134/S1990341326600328 | review-corpus | 已有本地 PDF |
| 16 | 天体物理 | 2607.14326v1 | 10.1126/science.aea9708 | journal/Science | |
| 17 | 天体物理 | 2606.18410v1 | 10.1126/science.adu3916 | journal/Science | |
| 18 | 天体物理 | 2608.26320v1 | 10.1038/s41586-026-10257-5 | journal/Nature | |
| 19 | 统计与计算物理 | 2608.19267 | 10.54546/NaturalSciRev.100802 | review-corpus | 已有本地 PDF |
| 20 | 统计与计算物理 | 2602.22028v1 | 10.1103/1zk4-gx9x | journal/PRL | 兼 cond-mat.soft |
| 21 | 统计与计算物理 | **待补抓** | — | — | 需补 1 篇 comp-ph / stat-mech 带 DOI |
| 22 | 等离子体物理 | 2608.14137 | 10.7868/S3034576626080114 | review-corpus | 已有本地 PDF |
| 23 | 等离子体物理 | 2607.00287v1 | 10.1103/PhysRevLett.129.205001 | journal/PRL | |
| 24 | 等离子体物理 | 2604.11698v2 | 10.1103/h7fg-xjby | journal/PRL | 兼 astro-ph.HE, physics.class-ph |
| 25 | 生物物理 | 2606.13047 | 10.1016/j.plrev.2026.06.004 | review-corpus | 已有本地 PDF |
| 26 | 生物物理 | 2605.02590v1 | 10.1126/science.ady7618 | journal/Science | 兼 physics.bio-ph |
| 27 | 生物物理 | **待补抓** | — | — | 需补 1 篇 physics.bio-ph 带 DOI |
| 28 | 交叉物理 | 2608.08919 | 10.26044/ecr2026/C-28213 | review-corpus | 已有本地 PDF；注意该记录为会议摘要类，评前先确认是否适合作交叉样本 |
| 29 | 交叉物理 | 2504.21524v1 | 10.1126/science.adx1707 | journal/Science | |
| 30 | 交叉物理 | **待补抓** | — | — | 需补 1 篇明确跨方向带 DOI |

补抓要求：只走官方 arXiv API，只取明确带 DOI 的记录，把新条目加进 `data/journal-corpus/manifest.json` 并复用既有校验流程（SHA-256 + 字节数 + PDF 签名）。**不要把 PDF 提交进 Git。**

### 必须满足的两个覆盖条件

- **至少 5 篇首次采集时没有 AI 解读** — 从候选集中挑 5 篇（建议 11、21、27、30 及另 1 篇），先不触发解读，专门评冷启动态下的展示与推荐。
- **至少 5 篇触发有意义的跨方向信号** — 候选集中标了"兼"的条目优先用作此样本（02、03、13、14、20、24、26）。

---

## 4. 产出待评审的产品输出

**关键坑**：固定语料走不通每日管线。管线窗口是"最近一天"，而候选论文是 2024–2026 年提交的，`manual-daily-run` 抓不到它们。

正确的产出路径：

```bash
# 1) 期刊语料子集：一次跑完 导入 + 分类 + 解读，支持按 arXiv ID 限定子集
pnpm --filter @pri/worker corpus:journal:trial 2410.10611v2 2508.08368v2 2604.21383v1 ...
```

脚本结束时会输出 `trial.summary`，核对 `classificationComplete` 与 `interpretationComplete` 是否等于 `total`。不相等说明有论文 AI 环节失败，先按 `docs/operations.md` 排障再重跑，不要带着残缺输出开评。

```bash
# 2) review-corpus 的 9 篇：该脚本只导入公开事实，不跑 AI
pnpm --filter @pri/worker corpus:import
# 之后逐篇在 Web 端论文详情页点「AI 解读」，或调用 POST /api/papers/{doi}/interpret
```

**每跑完一批，立刻导出快照存档**——从 `PaperClassification`、`PaperInterpretation`、`PaperScreening` 按 paperId 导出为 `docs/evaluation-runs/output-snapshot-<date>.json`。不要只依赖数据库，后续 prompt 一改就对不上了。

---

## 5. 打分表（每篇一行，六个维度）

维度定义见 `docs/evaluation-rubric.md` 第 9–14 行，1–5 分，`N/A` 必须写理由。

| # | 分类正确性 | 中文忠实性 | 创新点证据 | 局限与不确定性 | 推荐理由 | 跨方向价值 | 证据、缺陷、评审人 |
|---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 01 | | | | | | | |
| 02 | | | | | | | |
| 03 | | | | | | | |
| 04 | | | | | | | |
| 05 | | | | | | | |
| 06 | | | | | | | |
| 07 | | | | | | | |
| 08 | | | | | | | |
| 09 | | | | | | | |
| 10 | | | | | | | |
| 11 | | | | | | | |
| 12 | | | | | | | |
| 13 | | | | | | | |
| 14 | | | | | | | |
| 15 | | | | | | | |
| 16 | | | | | | | |
| 17 | | | | | | | |
| 18 | | | | | | | |
| 19 | | | | | | | |
| 20 | | | | | | | |
| 21 | | | | | | | |
| 22 | | | | | | | |
| 23 | | | | | | | |
| 24 | | | | | | | |
| 25 | | | | | | | |
| 26 | | | | | | | |
| 27 | | | | | | | |
| 28 | | | | | | | |
| 29 | | | | | | | |
| 30 | | | | | | | |

打分纪律：

- 只在**读过论文公开摘要（合法获取时可看全文）并对照产品输出**之后打分。
- 看全文后发现的证据，必须与"产品当时看到的公开事实"分开标注，否则会高估产品。
- 不要因为输出"看起来不错"就选它进样本；也不要因为一篇难评就换掉它。

---

## 6. 双评与分歧裁决

- 主评人打满 30 行。
- 第二评人**独立**打分至少 10 行，且这 10 行要覆盖全部六个维度、尽量横跨九个方向。
- 同一维度两人分差 ≥ 2 的，必须书面引用证据裁决，**保留双方原分**，不要直接改成中间值。

---

## 7. 汇总口径与放行阈值

按维度统计：**中位数、取值范围、失败数（1–2 分）**，并列出反复出现的失败模式。

**不要对事实性幻觉求平均**——幻觉是计数项，不是可以被高分拉平的分数项。

阈值必须在看到汇总结果**之前**定好并写在这里（防止事后给自己放水）：

| 维度 | 放行要求（建议，待确认） |
|---|---|
| 分类正确性 | 中位数 ≥ 4，失败数 ≤ 3 |
| 中文忠实性 | 中位数 ≥ 4，失败数 ≤ 2 |
| 创新点证据 | 中位数 ≥ 3，任何"无依据创新主张"计数必须逐条开 issue |
| 局限与不确定性 | 中位数 ≥ 3 |
| 推荐理由 | 中位数 ≥ 3，任何虚假个性化理由逐条开 issue |
| 跨方向价值 | 中位数 ≥ 3，虚假跨方向标签计数为 0 |

---

## 8. 交付物 checklist

- [ ] 第 2 节版本冻结表全部填完
- [ ] 30 个候选 ID 与 DOI 全部落实（4 篇待补抓已补齐）
- [ ] `output-snapshot-<date>.json` 已存档
- [ ] 30 行六维分数 + 证据笔记全部填完（非合成）
- [ ] 双评子集与分歧裁决记录
- [ ] 逐维度中位数 / 范围 / 失败数 / 失败模式汇总
- [ ] 每一个事实性幻觉、无依据创新主张、隐藏不确定性、虚假推荐理由，都开了具体的 follow-up issue
- [ ] 更新 `docs/evaluation-rubric.md` 的三十篇模板为实际结果，并在 `task_plan.md` 勾选"完成至少 30 篇跨方向人工质量评审"
