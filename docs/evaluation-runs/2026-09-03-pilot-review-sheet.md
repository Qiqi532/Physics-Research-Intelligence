# 试点评审工作表 — 11 篇已解读论文（零成本样本）

快照：`docs/evaluation-runs/output-snapshot-2026-09-03.json`（11 篇，kimi/kimi-k2.6/interpret-v1，commit `6ab9658`）

本表由自动预检生成。**"预检红旗"列是机器扫出的可疑点，不是结论** —— 红旗处需人工核实，干净处也需抽查。

> **开评前必读（2026-09-03 环境核对后追加）**：推荐理由（第 5 维）和跨方向（第 6 维）只有出现在 `/api/today` 里的论文才能评。
> 11 篇中当前在 Today 候选池内的有 **4** 篇：#4 / #5 / #6 / #7（见文末"推荐理由证据"一节）。
> 建议首批按能覆盖全部 6 个维度的有摘要、在 Today 的论文开评（如 #06 → #07 → #05 → #04），再评无摘要的 #01/#02/#03（第 5/6 维记 N/A）。

| # | DOI | 标题 | 摘要 | 在 Today | 分类标签 | 预检红旗 | 分类 | 中文忠实 | 创新证据 | 局限 | 推荐理由 | 跨方向 | 证据与缺陷笔记 |
|---:|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 01 | `10.1103/94sm-dm7x` | Probing the dark axion portal via J / ψ decays at BESI… | **无** | 否 | high-energy-particle | · H: 引用字段含 3 处字面 "null"（无实际证据）<br>· M: basis=abstract_only 但论文无摘要（语义失真，实际仅元数据）<br>· L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 02 | `10.1103/zbfv-zx72` | Role of nuclear shell effects of different nuclear phy… | **无** | 否 | nuclear | · H: 引用字段含 2 处字面 "null"（无实际证据）<br>· M: basis=abstract_only 但论文无摘要（语义失真，实际仅元数据）<br>· L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 03 | `10.1103/8fr2-cyf5` | Many-body perturbation theory for the nuclear equation… | **无** | 否 | nuclear | · H: 引用字段含 1 处字面 "null"（无实际证据）<br>· M: basis=abstract_only 但论文无摘要（语义失真，实际仅元数据）<br>· L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 04 | `10.3847/2041-8213/ae9a89` | Dust Activity Evolution and Constraints on Icy Grains … | 有 | 是 | astrophysics | · L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 05 | `10.3847/2041-8213/ae984f` | Flyby-induced Second Accretion as a Pathway to Giant P… | 有 | 是 | astrophysics | · L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 06 | `10.1186/s43593-026-00141-0` | Light-driven molecular reorientation for large-scale p… | 有 | 是 | amo-optics | · L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 07 | `10.1002/lpor.71822` | On‐Chip Erbium‐Doped Tantalum Oxide Single‐Mode Laser … | 有 | 是 | amo-optics | · L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 08 | `10.1093/mnras/stag1623` | On the collimation properties of jets with finite Poyn… | 有 | 否 | astrophysics | · L: 仅 1 个分类标签（跨方向覆盖可能不足） | | | | | | | |
| 09 | `10.1126/science.ads5962` | Tracking the baryon number with nuclear collisions… | 有 | 否 | nuclear/high-energy-particle/statistical-computational/cross-disciplinary | 无 | | | | | | | |
| 10 | `10.1126/science.adt1712` | A phase microscope for quantum gases… | 有 | 否 | amo-optics/condensed-matter-materials/statistical-computational/cross-disciplinary | 无 | | | | | | | |
| 11 | `10.1126/science.adx1707` | Levitated Sensor for Magnetometry in Ambient Environme… | 有 | 否 | amo-optics/condensed-matter-materials/statistical-computational/cross-disciplinary | 无 | | | | | | | |

---

## 推荐理由证据（来自 /api/today，仅供第 5/6 维评分参照）

> 此节自动抓取，避免评审时反复请求接口。机器生成，人工核对需以论文详情页实际展示为准。

### 10.3847/2041-8213/ae9a89 — Dust Activity Evolution and Constraints on Icy Grains in the
- **综合分**：38.3　**解读**：有
- **分类标签（Today 视角）**：astrophysics(相关度 0.68)
- **评分拆解**：{"interest":0,"classification":20.4,"recency":17.85,"discovery":0,"readingState":0}
- **推荐理由**：
  - 物理主题相关度 68%
  - 发表于最近一周，时效性较高

### 10.3847/2041-8213/ae984f — Flyby-induced Second Accretion as a Pathway to Giant Planets
- **综合分**：41.9　**解读**：有
- **分类标签（Today 视角）**：astrophysics(相关度 0.8)
- **评分拆解**：{"interest":0,"classification":24,"recency":17.85,"discovery":0,"readingState":0}
- **推荐理由**：
  - 物理主题相关度 80%
  - 发表于最近一周，时效性较高

### 10.1186/s43593-026-00141-0 — Light-driven molecular reorientation for large-scale photoni
- **综合分**：49.0　**解读**：有
- **分类标签（Today 视角）**：amo-optics(相关度 0.78)
- **评分拆解**：{"interest":7.8,"classification":23.4,"recency":17.85,"discovery":0,"readingState":0}
- **推荐理由**：
  - 匹配你的「原子、分子与光学」兴趣（相关度 78%）
  - 物理主题相关度 78%
  - 发表于最近一周，时效性较高

### 10.1002/lpor.71822 — On‐Chip Erbium‐Doped Tantalum Oxide Single‐Mode Laser via Ph
- **综合分**：47.9　**解读**：有
- **分类标签（Today 视角）**：amo-optics(相关度 0.75)
- **评分拆解**：{"interest":7.5,"classification":22.5,"recency":17.85,"discovery":0,"readingState":0}
- **推荐理由**：
  - 匹配你的「原子、分子与光学」兴趣（相关度 75%）
  - 物理主题相关度 75%
  - 发表于最近一周，时效性较高

---

## 预检汇总

- 论文总数：**11**；无摘要 3 篇全部 HIGH 红旗，有摘要 8 篇中 3 篇零红旗。
- 无摘要论文：`10.1103/94sm-dm7x`、`10.1103/zbfv-zx72`、`10.1103/8fr2-cyf5`。

## 预检发现的两个产品缺陷（建议直接开 issue）

1. **引用字段被填成字面量 `"null"`（6 处）。** 无摘要论文的 `evidenceReferences[].quote` 出现字符串 `"null"`，却仍带有 `evidenceLevel`。这不是模型编造（正文措辞诚实），但引用字段没做空值处理，把不可用证据包装成看起来可用的引用。
2. **`basis` 字段语义失真。** 无摘要时仍写入 `basis: "abstract_only"`，实际证据只来自元数据。
3. **证据等级过宽。** 有 3 处 `evidenceLevel: "direct"` 的证据实际来自 metadata（标题推导），应降级为 `inferred`。

**根因**：摘要缺失时管线没阻断/降级，照常生成完整结构。建议解读前校验摘要存在性：无摘要则标记 `basis: "metadata_only"`、拒绝填引用、或置 `SKIPPED`。

## 人工核对时特别注意

- **不要因为"模型诚实声明了摘要缺失"就给低分。** 第 1 维（分类）与第 2 维（中文忠实）分开看：措辞诚实是加分，引用填 `"null"` 是独立工程缺陷，记入缺陷清单而非打在忠实性维度。
- **"仅 1 个分类标签"不等于分类错误。** 需人工判断是真单方向还是漏标跨方向标签——后者才扣分。
- **8 篇有摘要的论文要抽查，不要略过。** 机器查不出"忠实但遗漏重要限定条件"（rubric 第 2 维 3 分档），这正是人工评审不可替代处。
