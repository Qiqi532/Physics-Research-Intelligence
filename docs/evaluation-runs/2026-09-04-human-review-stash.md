# 人工评审交互任务 — 暂存（2026-09-04 续做）

> 本文件为「30 篇 AI 输出人工评审」的续做暂存。背景、素材、初评均已完成，下一步 = 用户通过对话逐篇人工裁决 6 维打分。明天开新工作任务后，让 AI 读取本文件 + 下面三个素材即可，无需重聊上下文。

## 已完成的前置（无需重做）
- 30 篇 AI 输出已产出（kimi-k2.6），自审表第 6 列已回填：`docs/evaluation-runs/2026-09-03-full-review-sheet.md`
- 评审员 #1 已做 6 维初评（D1–D4 打分，D5/D6 标 N/A）：`docs/evaluation-runs/2026-09-03-ai-firstpass-review.md`
- 30 篇完整 AI 输出（带证据引用）：`docs/evaluation-runs/2026-09-03-ai-outputs.md`
- 维度定义见 `docs/evaluation-rubric.md`（1–5 分，N/A 需写理由）

## 评分裁决要点（逐篇判分用的"判分尺"）
评分制 1–5，N/A 需写理由。6 维对应自审表第 7–12 列，第 13 列记录证据笔记。

- **D1 分类正确性** — 1=大错；3=抓对主领域但显著遗漏；5=主+交叉标签都精准。
  - 以 arXiv primary_category 为准：AI 的 top 标签是否=primary？cross 标签是否合理覆盖其他 categories？
  - 已知失败模式（重点复核）：`#04`、`#24` 为 3/5（quant-ph 量子计量或超导 qutrit 量子行走误标 amo-optics）；`#21`、`#17` 为 4/5 边界样本（分别漏"仪器/探测"本质和多个次要分类）。
  - 判分：主标签错配→3；仅漏次要→4；精准覆盖→5。
- **D2 中文忠实性** — 1=编造/矛盾；3=大体忠实但丢关键限定；5=保真数值/条件/不确定度。
  - 这 30 篇均有摘要，初评 30/30=5/5。抽样核对中文概述的数值/条件/不确定度有无添油加醋即可。
- **D3 创新点证据** — 1=无支撑；3=挂了摘要但夸大强度；5=每条创新都有可追溯证据且证据级别正确。
  - 核对每条 innovation 是否带 evidenceReferences；evidenceLevel=direct 不能只是 metadata 推导。
  - 稀疏主因是摘要截断（非编造）：`#20` `#11` 仅 1 条创新→3–4；`#27` 第 2 条因截断存疑→4。
- **D4 局限与边界** — 1=隐瞒/编造；3=泛泛而谈；5=区分"论文陈述的局限 / 基于摘要的推断 / 未知项"。
  - 好样本 `#06 #14 #16 #28 #07`（#16 点出"反应堆相关性声明缺定量支撑"批判性最强）→5；差样本 `#20 #11` 只写"摘要截断"→3。
- **D5 推荐理由真实性** — 本次 trial 未产出 screening/recommendation，**30 篇全标 N/A**（理由：trial 未产出 PaperScreening.reason）。除非改跑完整 daily pipeline，否则不动。
- **D6 跨方向发现价值** — 本次 trial 未产出 crossSignals，**30 篇全标 N/A**（理由：trial 未产出跨方向信号；arXiv 多分类仅作参考标注）。

**优先复核清单（精力放这 7 篇）：** D1 偏差 `#04 #24 #21 #17`；D3 稀疏/存疑 `#20 #11 #27`。

**结论：** D1–D4 全部可评（现有三份文件足矣）；D5/D6 受 trial 范围限制只能 N/A。实质是对 30 篇判 D1–D4 + 给 D5/D6 写 N/A 理由。

## 下个工作任务 prompt（复制粘贴给新任务的 AI）
明天开新工作任务，用侧边栏/文件读取让 AI 能读到本地，再把下面整段发过去。

````markdown
你是一个「30 篇 AI 输出人工评审」的引导助手。本次只评审本地已产出的 AI 输出：不要重新调用模型、不要联网、不要读取任何含密钥的文件。

【第一步：读取本地材料】（用文件读取工具加载，不要让我手动打开）
读取并完整理解以下文件：
1. `D:\Physics Research Intelligence\docs\evaluation-runs\2026-09-03-full-review-sheet.md` —— 30 行自审表，第 6 列已回填 AI 输出摘要，第 7–12 列为 6 维打分，第 13 列证据笔记待填。
2. `D:\Physics Research Intelligence\docs\evaluation-runs\2026-09-03-ai-outputs.md` —— 30 篇完整 AI 输出（分类 + 中文概述 + 创新点 + 局限，均带证据引用）。
3. `D:\Physics Research Intelligence\docs\evaluation-runs\2026-09-03-ai-firstpass-review.md` —— 评审员 #1 的 6 维初评（D1–D4 已打分，D5/D6 标 N/A），含每篇 arXiv 真实分类与偏差分析。
4. `D:\Physics Research Intelligence\docs\evaluation-runs\2026-09-04-human-review-stash.md` —— 本次任务的裁决要点与续做说明（含 D5/D6 标 N/A 的依据与优先复核清单）。
参考 `D:\Physics Research Intelligence\docs\evaluation-rubric.md` 的维度定义（1–5 分，N/A 需写理由）。

【第二步：逐篇交互评审】
不要一次性倾倒 30 篇。一次呈现 3–5 篇，每篇按以下结构展示（直接从文件摘出，不要改写 AI 原意）：
- 序号 / arXiv ID / 标题 / 人工方向
- AI 分类（tag+相关度）与中文概述（关键事实：数值、条件、不确定度）
- AI 创新点（每条 + 其证据引用 evidenceLevel/evidenceReferences）
- AI 局限与边界
- 评审员 #1 初评分（D1–D4）与备注（尤其偏差点）
- arXiv 真实分类（供我核对 D1）

然后引导我判分，对 6 个维度逐一给判断建议，并明确指出：
- D1：top 标签是否贴合 arXiv primary_category？quant-ph/超导/量子计量类是否误标 amo-optics（重点核 #04 #24）？instrumentation 类是否漏"探测器"本质（#21）？高分类数是否漏次要分类（#17）？
- D2：中文概述是否保真（数值/条件/不确定度无添油加醋）？
- D3：每条创新点是否都有可追溯证据？摘要截断导致的稀疏是否记 3–4？
- D4：是否区分"论文陈述的局限 / 基于摘要的推断 / 未知项"？仅写"摘要截断"的泛泛而谈记 3。
- D5 推荐理由真实性：本次 trial 未产出 screening/recommendation，全部标 N/A（理由：trial 未产出 PaperScreening.reason），除非我要求改跑完整管线。
- D6 跨方向发现价值：本次 trial 未产出 crossSignals，全部标 N/A（理由：trial 未产出跨方向信号；arXiv 多分类仅作参考标注）。

我回复分数后，把它记下来，并同步写入进度文件 `D:\Physics Research Intelligence\docs\evaluation-runs\2026-09-04-human-scores.md`，格式一行一篇：`# | arXiv | D1 | D2 | D3 | D4 | D5 | D6 | 笔记`，便于回溯与最终回填。

【第三步：推进与收尾】
- 每批 3–5 篇后，给出累计进度（如「已完成 #01–#12，剩余 #13–#30」）。
- 我可说"继续""从第 X 篇开始""重评第 Y 篇"来控节奏。
- 全部 30 篇完成后，输出一张完整 6 维分数表和证据笔记（可直接复制回 `2026-09-03-full-review-sheet.md` 第 7–13 列），并列出需开 issue 的缺陷项（事实性幻觉 / 无支撑创新 / 隐藏不确定度 / 错误推荐理由）。

注意：不要替我打分，最终分由我给；你只提供判断依据、初评参考和提示。D5/D6 默认 N/A 不变，除非我明确说要评。
````

## 续做指引（明天如何开始）
1. 开新工作任务，用侧边栏/文件读取让 AI 能访问 `D:\Physics Research Intelligence\docs\evaluation-runs\` 下的文件。
2. 把上方"下个工作任务 prompt"整段发给 AI，它会先读取四份文件再开始。
3. 你说 **"从第 1 篇开始，每批 5 篇"**，AI 会逐篇把 AI 输出+初评摆出来引导你判分。
4. 重点精力放 `#04 #24 #21 #17 #20 #11 #27` 这 7 篇，其余按初评快速确认即可。
5. 进度自动累积到 `2026-09-04-human-scores.md`，中途断开说"从第 X 篇开始"就能续上。
6. 全部完成后，把 6 维分数和证据笔记回填 `2026-09-03-full-review-sheet.md` 第 7–13 列（此步可在评审任务里让 AI 直接帮你生成回填文本）。

> 所有交付物仍仅本地、未提交 GitHub（沿用用户要求）。如要提交，需用户另行确认。
