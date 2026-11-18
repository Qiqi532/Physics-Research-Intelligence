# 本地科研工作台开发路线与技术栈

2026 年 11 月 18 日确认阶段 0–1。[实施与验收记录](../../changes/2026-11-18-local-evidence-search.md)

**建议首版先解决写综述时的一个问题。** 在本机输入“哪些器件在改变栅压后发生光电流符号翻转”，得到论文、逐字摘录和页码，点击即可回到正确版本的 PDF。先让这个动作比手动翻文献更快，再用同一批证据做器件对照表或带引用的问答。

## 从现有成果起步

- 已有 arXiv、OpenAlex 课题日报、运行台账、固定发布名单和失败恢复。11 月 13 日真实运行从 97 条记录中冻结 40 篇候选，25 篇完成筛选，6 篇入围，最终投递 2 篇摘要解读和 1 篇题录。这给后续筛选实验提供了基线。11 月 18 日核查时 Windows 日报任务为停用状态，定时运行情况和论文相关性分别评估。[日报验收记录](../../changes/2026-11-13-research-daily-loop.md)
- GitHub 的 `main` 位于 `9f846f4`，工作分支位于 `0d3eb46`，11 月日报实现仍在工作区。旧 PDF 实现末端 `1774aa3` 有 7 个超出远端同名分支的提交，包含资产登记、SHA-256 文件校验和导入测试。它把 PDF 复制到受管目录。新版可以复用文件校验逻辑和测试样例，原件继续留在用户目录。[已提交版本差异](https://github.com/Qiqi532/Physics-Research-Intelligence/compare/9f846f4...0d3eb46)
- 当前公开画像的主线是二维光电器件、类视网膜及运动感知，相邻方向包括神经形态器件与 CFET。后续用这些方向的真实问题验证效果。[课题画像](../../../data/research-profile.json) · [上一版规划](2026-11-13-local-research-tool-rag-plan.md)

## 交付路径

| 顺序 | 用户能拿到什么 | 验收依据 |
|---|---|---|
| 0　保全已有版本 | 给 `1774aa3` 建立本地保留分支。按运行入口、日报及迁移、验证材料整理 11 月工作区，形成可评审的提交。远端集成单独处理。 | 能从明确的提交找到日报源码、迁移和测试，也能独立查看旧 PDF 实现。原始文献、模型凭据和数据库备份保存在 Git 之外。 |
| 1　目录检索与原文页 | 从 10–20 份有代表性的 PDF 起步，包含无 DOI 文稿、双栏论文和补充材料。只读登记文件，逐页提取文本，本地搜索返回论文、原句、物理页码和“打开此页”。先用课题中英别名支持中文查询，例如“光电流符号翻转”对应论文中可能出现的英文表述。 | 准备 20 道各有一个已知证据页的问题，调试题与验收题分开。建议首轮目标为前五条命中至少 **17/20**，所有返回的摘录均可回到对应文件版本与页码。另测库外问题、扫描空页和双栏错序，并对同一批问题比较手动查页与工具查页的中位耗时。 |
| 2　接入 Zotero 选定收藏夹 | 通过本地 API 只读取得题录与附件，用库标识、条目键和附件键关联目录中的资产。新增或替换附件时增量索引，Zotero 关闭时仍可查最近一次完整索引。 | 用一个收藏夹演示首次导入、重复同步、替换附件、客户端离线。相同文件只索引一次，主文与 SI 可分别跳页，离线状态可见。 |
| 3　让日报更贴合课题 | 在现有阅读控件上补齐显式“值得精读”反馈。用同一批公开候选，离线比较现有关键词排序、种子摘要相似度和两者结合。此项可与阶段 2 独立推进。 | 放在关键词过滤**之前**取样，保留未命中词的记录，按日期留出测试集。观察 7 个不同日报日期，记录前五篇的已判数、值得读数、抽查发现的漏选及模型调用数。反馈为 `NONE` 的样本单列。回放沿用冻结数据，已发布日报仍可复现。 |
| 4　生成器件证据对照表 | 从阶段 1 的证据卡勾选并导出 Markdown 或 CSV，用于综述或组会。首版支持手工选摘录、填写字段，随后再评估自动提取。 | 用 5–10 篇论文完成一张真实对照表，检查每个已填数值的单位、测量条件及页码，并记录相比手工制表节省的时间。仅见于图中的数值保留图号，缺失项明确留空。 |
| 5　按需要增加证据问答 | 公开题录与摘要可走现有模型路由。私人全文问答只在本机检索、切块和生成，先试单篇，再评估跨篇回答。 | 先抽查每条回答是否被所引原句支持，再测库外问题的拒答、错误拒答、内存和延迟。本地生成达不到使用要求时，页码检索和对照表仍可独立使用。 |

**器件对照表的最小字段**为材料与器件结构、栅压和漏压、波长、入射功率或功率密度、响应度或响应时间、原始单位、证据页及图表号。每个数值保留对应工况。同一论文在两个波长下的结果分行记录，便于写作时说明差异。

## 技术栈与选型

| 层次 | 采用的方案 | 在 PRI 中的职责 |
|---|---|---|
| 界面与运行 | 沿用 TypeScript、pnpm 11.19、Next.js 16 App Router、React 19。引入 PDF.js 后最低 Node 版本为 22.13，本机核查为 24.15。 | 在现有 Web 中增加检索、原文跳页和证据选择。保留现有 DOI 链接，通过内部标识打开无 DOI 资产。 |
| 任务与存储 | 沿用一次性 Node worker、PostgreSQL 17、Prisma 7。Windows 任务计划程序承载可选日报排程，Redis/BullMQ 仅在显式队列模式启用。 | 扫描与增量索引可单独按需运行。沿用现有连接、迁移和测试设施，小型个人库共用一个数据库。 |
| PDF 提取与展示 | 首选试验 Mozilla PDF.js 的 `pdfjs-dist`。Node 端按页取文本，浏览器按相同物理页码渲染原件。先在目标 Node 版本和 Windows 构建上验证，再锁定依赖版本。 | 索引保存原文和页号，印刷页码可另记。双栏、扫描、表格与公式分别抽查，提取失败的页显示原因。精确框选和 OCR 由实际失败样本决定。[官方 Node 示例](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs) |
| 检索 | 首版使用 PostgreSQL 的 `tsvector`、GIN 索引和 `ts_rank_cd`，配合材料名、缩写和中英术语别名。原文与归一化检索文本分开保存。 | 保留 MoS₂/MoS2 等写法的原始出处。若同义表达仍明显漏检，再试本地多语 embedding，例如 Transformers.js 加兼容的多语 E5 小模型，在同一组问题上比较命中率和 CPU 耗时。小库先做精确相似度计算，规模或延迟实测需要时再评估 pgvector。[PostgreSQL 索引](https://www.postgresql.org/docs/17/textsearch-indexes.html) · [排名函数](https://www.postgresql.org/docs/17/textsearch-controls.html) · [离线模型配置](https://huggingface.co/docs/transformers.js/en/custom_usage) |
| Zotero 与模型 | Zotero Desktop 本地 HTTP API 用于读取选定收藏夹。公开摘要使用已有 `packages/ai` 路由、结构校验和调用审计。 | 私人题录、全文片段、笔记和由其生成的向量留在本机。第二模型可在有分歧样本时参与独立复核。首版页码检索无需模型密钥。[Zotero 本地 API](https://www.zotero.org/support/dev/web_api/v3/local_api) |

## 数据与现有代码的衔接

首版的文件扫描和解析归 `apps/worker` 的一次性任务，资产、页文本和索引迁移归 `packages/db`，证据卡的共享类型归 `packages/domain`。查询与原文读取在 `apps/web/src/server`，页面在 `apps/web/src/app`。这样，同一张证据卡可供阅读、导出和后续问答使用。

1. **区分公开论文与私人资产。** `Paper.id` 已是 UUID，`doi` 可空。私人文件用本地资产标识和文件版本登记，可选关联已有公开 `Paper.id`。日报当前按发表日期从 `Paper` 查询候选，因此私人标题、摘要和本地路径只进入本地资产记录。已关联的论文也只允许用公开来源的字段参与云端解读。[数据库模型](../../../packages/db/prisma/schema.prisma) · [日报候选查询](../../../apps/worker/src/configured-research-daily.ts) · [单篇解读入口](../../../apps/web/src/server/single-interpretation.ts)
2. **让证据经得起文件变更。** 相同字节用 SHA-256 识别，文件位置可有多个。预印本、正式版和 SI 保留各自版本或角色。每条证据绑定资产版本、从 1 开始的物理页码、原文及解析版本。新索引完成后再切换，历史证据指向原版本，版本缺失时给出提示。文件夹暂时离线时沿用上次索引；普通候选的 30 天清理应保护用户资产和关联条目。网页按资产标识在已选根目录中解析文件。[现有清理逻辑](../../../packages/db/src/paper-repository.ts)
3. **复用已有交互。** `UserPaperState.feedback` 已支持 `LIKE/DISLIKE/NONE`，阅读状态和收藏另有字段。继续沿用这些语义，补正向入口与无 DOI 身份支持。比较排序时分别呈现来源覆盖、批次失败和用户评价，避免把未完成筛选计作偏好。[阅读控件](../../../apps/web/src/components/paper-state-controls.tsx) · [今日卡片](../../../apps/web/src/components/recommendation-card.tsx) · [现有排序与冻结逻辑](../../../apps/worker/src/research-daily.ts)

## 开源项目怎样参考

前两项已在独立临时目录浅克隆并核对源码与测试。下表记录所查版本，便于实施时复核。首版在现有 TypeScript 工作区实现，AGPL 项目用于对照行为和验收样例。

| 项目与版本 | 可直接用来做决策的部分 |
|---|---|
| tdccccc/arxiv-daily · MIT · `0626be3` | 借鉴摘录的页码定位、解析器版本及稳定标识。该版本实际建立索引的内容是标题和摘要，PRI 的物理页必须来自真实逐页解析。[证据结构](https://github.com/tdccccc/arxiv-daily/blob/0626be37d16c3c0d62c06523ed9421ea8b14e24a/packages/core/src/library/fulltext/evidence-chunk.ts) · [摘要提取说明](https://github.com/tdccccc/arxiv-daily/blob/0626be37d16c3c0d62c06523ed9421ea8b14e24a/packages/core/src/library/fulltext/abstract-extraction.ts) |
| tomozzz/Zotero-Research-MCP · AGPL-3.0 · `2b01568` | 对照附件变更检测、逐页提取、页级校验和增量同步测试。PRI 在本机 Node 和 PostgreSQL 中落实这些行为。[逐页解析](https://github.com/tomozzz/Zotero-Research-MCP/blob/2b01568a34c013cc192412cb9fe88076320e596c/src/zotero_research_mcp/pdf/parser.py) · [同步与检索测试](https://github.com/tomozzz/Zotero-Research-MCP/blob/2b01568a34c013cc192412cb9fe88076320e596c/tests/integration/test_sync_search.py) |
| TideDra/zotero-arxiv-daily · AGPL-3.0 · `35c23ec` | 它对文库摘要相似度加权，近期入库文献权重较高。PRI 的 5 个种子只有题录和核验日期。先按 DOI 补齐可取得的公开摘要，记录覆盖数，在各方向内等权比较。将来取得真实的 Zotero 入库时间后，再单独试时间权重。[排序实现](https://github.com/TideDra/zotero-arxiv-daily/blob/35c23ec44617b7595b30ac8e5bf4326c6cfd2336/src/zotero_arxiv_daily/reranker/base.py) |
| ChemDataExtractor2 · MIT · `f7b122f` | 借鉴量纲、原单位与数值的建模方式。器件工况、页码和图号由 PRI 的证据记录补足。[单位模型](https://github.com/CambridgeMolecularEngineering/chemdataextractor2/tree/f7b122f22da0d60a40d2d9400cb7c679c79c2d01/chemdataextractor/model/units) |
| Future-House/paper-qa · Apache-2.0 · `c692d0d` | 后续问答参考其先收集证据、再生成回答的接口。先分别测检索命中与陈述支持度，便于判断失败发生在哪一步。[证据与问答实现](https://github.com/Future-House/paper-qa/blob/c692d0dfeac4a0296599f7fe21a253a58b7ac12a/src/paperqa/docs.py) |

## 实施时的验证

| 检查 | 仓库现有命令及用途 |
|---|---|
| 日报回归 | `pnpm exec vitest run tests/domain/research-profile.test.ts tests/worker/research-daily.test.ts tests/worker/research-screening.test.ts`，验证画像、固定日报、失败恢复和摘录检查。 |
| 数据兼容 | `pnpm --filter @pri/db prisma:validate` 检查 schema；在独立测试数据库运行 `pnpm exec vitest run tests/db/paper-repository.test.ts tests/db/daily-repository.test.ts`。实施时补资产保留、重复扫描、页码版本切换和断点重建用例。 |
| 用户路径 | `pnpm typecheck`、`pnpm lint`、`pnpm build`。用专用测试库运行 `pnpm test:e2e`，补中文查询到正确页、无 DOI 本地文献、Zotero 离线场景。用 Mock Provider 核查私人测试标记没有出现在任何模型请求中。 |

**已确认的首版范围为阶段 0 和 1。** 交付边界是一套有版本依据、可以在自己的电脑上查到原文页的工具。阶段 2 至 5 按实际查页耗时、日报反馈和制表需求评估。
