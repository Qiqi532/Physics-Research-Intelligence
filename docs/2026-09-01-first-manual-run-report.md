# Physics Research Intelligence — 2026-09-01 首次手动运行测试报告

## 一、运行概述

| 项目 | 值 |
|---|---|
| 运行日期 | 2026-09-01（周二） |
| 运行模式 | 手动触发（`manual-daily-run.ts`） |
| 总耗时 | 449.6 秒（约 7.5 分钟） |
| Kimi 调用次数 | 约 12 次（2 批筛选 + 10 篇解读） |
| 流程架构 | 三阶段筛选：期刊确定性过滤 → Kimi 批量筛选 → Kimi 摘要解读 |
| 模型 | Kimi K2.6（`kimi-k2.6`，baseUrl: `https://api.moonshot.cn/v1`） |
| 解读基础 | 仅基于公开摘要（`basis: abstract_only`），不上传 PDF |
| 费用计算 | 已完全删除，全程无费用估算或预算拦截 |

## 二、三阶段筛选结果

### 阶段 1：期刊确定性筛选

- 候选窗口：上海 2026-08-31 06:00 → 2026-09-01 06:00
- 窗口内论文总数：约 3900 篇
- 期刊白名单：~75 种高质量物理学期刊（Tier1/Tier2 分级）
- **筛选结果：24 篇**通过期刊质量过滤

#### 24 篇期刊分布

| 期刊 | 数量 |
|---|---|
| Physical Review D | 3 |
| Physical Review C | 3 |
| The Astrophysical Journal | 3 |
| Monthly Notices of the Royal Astronomical Society | 2 |
| The Astrophysical Journal Letters | 2 |
| Physical Review B | 2 |
| PNAS | 1 |
| Advanced Optical Materials | 1 |
| eLight | 1 |
| Laser & Photonics Review | 1 |
| Optical Engineering | 1 |
| Photonics Research | 1 |
| 其他（非物理期刊误匹配） | 3 |

> 注：SIAM Journal on Life Sciences、Journal of Environmental Science、Journal of Science Communication 等非物理期刊被误匹配，需后续优化白名单匹配逻辑。

### 阶段 2：Kimi 批量筛选

- 分批：2 批（15 篇 + 9 篇）
- 输入：标题 + 期刊 + 摘要前 200 字
- 输出：评分（0-1）+ 方向标签 + 推荐理由 + 选中标记
- **选中结果：10 篇**（0 批失败）
- AiRun SCREEN：2 条，全部 COMPLETE

### 阶段 3：Kimi 摘要解读

- 解读 10 篇，**8 篇成功，2 篇失败**
- 失败错误码：`invalid_json`（Kimi 返回 JSON 格式偶发问题）
- 单篇失败不阻断其他论文
- 解读内容结构：中文概述、研究问题、创新点、方法与证据、局限、阅读建议
- 每条结论附带证据等级（direct/inferred/uncertain）和原文引用

## 三、数据库统计快照（2026-09-01 运行后）

| 表 | 总数 | 今日新增 | 备注 |
|---|---|---|---|
| Paper | 8938 | 8938 | 含历史 ingest 数据 |
| PaperScreening | 24 | 24 | 其中 selected=true: 10 |
| PaperClassification | 22 | 22 | 筛选结果同步写入 |
| PaperInterpretation | 11 | 11 | 全部 COMPLETE（含历史 3 篇） |
| AiRun | 18 | 18 | SCREEN: 2, INTERPRET: 13（含失败 2） |
| Prisma 迁移 | 8/8 | — | 新增 `add_paper_screening` 迁移 |

## 四、选中的 10 篇论文详情

| 排名 | 期刊 | 方向 | 评分 | 解读状态 | 标题（截断） |
|---|---|---|---|---|---|
| 1 | The Astrophysical Journal Letters | astrophysics | 0.80 | ✅ COMPLETE | Flyby-induced Second Accretion as a Pathway to Giant Planets... |
| 2 | Advanced Optical Materials | amo-optics | 0.78 | ❌ 未解读 | Shape-Sensitive Second-Harmonic Generation in Mie-resonant TMDC... |
| 3 | eLight | amo-optics | 0.78 | ✅ COMPLETE | Light-driven molecular reorientation for large-scale photonic... |
| 4 | Physical Review C | nuclear | 0.75 | ✅ COMPLETE | Many-body perturbation theory for the nuclear equation of state... |
| 5 | Laser & Photonics Review | amo-optics | 0.75 | ✅ COMPLETE | On-Chip Erbium-Doped Tantalum Oxide Single-Mode Laser... |
| 6 | MNRAS | astrophysics | 0.72 | ❌ 未解读 | Flyby-induced high-eccentricity migration and the prevalence... |
| 7 | MNRAS | astrophysics | 0.72 | ✅ COMPLETE | On the collimation properties of jets with finite Poynting flux... |
| 8 | Physical Review D | high-energy-particle | 0.70 | ✅ COMPLETE | Probing the dark axion portal via J/ψ decays at BESIII and STCF |
| 9 | Physical Review C | nuclear | 0.68 | ✅ COMPLETE | Role of nuclear shell effects of different nuclear physics... |
| 10 | The Astrophysical Journal Letters | astrophysics | 0.68 | ✅ COMPLETE | Dust Activity Evolution and Constraints on Icy Grains... |

### 方向分布

- 天体物理（astrophysics）：4 篇
- 光学/光子学（amo-optics）：3 篇
- 核物理（nuclear）：2 篇
- 高能物理（high-energy-particle）：1 篇

## 五、失败记录

| 时间（UTC） | 类型 | 模型 | 错误码 | 论文 |
|---|---|---|---|---|
| 2026-09-01 15:31:51 | INTERPRET | kimi-k2.6 | invalid_json | Shape-Sensitive Second-Harmonic Generation... (Advanced Optical Materials) |
| 2026-09-01 15:33:27 | INTERPRET | kimi-k2.6 | invalid_json | Flyby-induced high-eccentricity migration... (MNRAS) |

- 错误特征：Kimi 返回内容无法解析为预期 JSON schema
- 影响范围：仅单篇，不阻断其他论文
- 重试策略：幂等机制会跳过已成功的，下次运行自动重试失败的

## 六、代码修改文件清单

### 新增文件

| 文件 | 说明 |
|---|---|
| `packages/domain/src/journal-whitelist.ts` | ~75 种高质量物理学期刊白名单，Tier1/Tier2 分级，含匹配函数 |
| `packages/ai/src/prompts/screen.ts` | 批量筛选 prompt（标题+期刊+摘要→评分+方向+理由+选中） |
| `packages/db/prisma/migrations/20260901230000_add_paper_screening/` | Prisma 迁移：AiRunType.SCREEN + PaperScreening 表 |
| `apps/worker/src/jobs/screen-papers.ts` | 批量筛选 job：期刊过滤→分批 Kimi 筛选→保存结果+同步分类 |
| `apps/worker/src/manual-daily-run.ts` | 手动运行入口脚本 |
| `tests/domain/journal-whitelist.test.ts` | 11 个白名单测试 |
| `tests/worker/screen-papers.test.ts` | 5 个筛选 job 测试 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `packages/domain/package.json` | 添加 `./journal-whitelist` 子路径导出 |
| `packages/ai/src/schemas.ts` | 新增 screenPaperOutputSchema/screenBatchOutputSchema |
| `packages/ai/src/provider.ts` | AiProvider 接口新增 screenBatch 方法 |
| `packages/ai/src/router.ts` | 新增 routeScreenBatch 批量路由 |
| `packages/ai/src/providers/openai-compatible.ts` | 实现 screenBatch |
| `packages/ai/src/providers/gemini.ts` | 实现 screenBatch |
| `packages/ai/src/providers/openai.ts` | 实现 screenBatch |
| `packages/ai/src/mock-provider.ts` | 新增 screenBatch mock |
| `packages/ai/src/index.ts` | 导出 screen 相关类型/函数/prompt |
| `packages/db/prisma/schema.prisma` | 新增 PaperScreening 表 + AiRunType.SCREEN |
| `packages/db/src/ai-repository.ts` | 新增 listPapersForScreening/listScreenedSelectionCandidates/saveScreeningResults |
| `packages/db/src/index.ts` | 导出 ScreeningResultInput |
| `apps/worker/src/jobs/ai-job.ts` | 新增 toScreenInput/createBatchInputHash/createBatchIdempotencyKey |
| `apps/worker/src/configured-daily-processor.ts` | 三阶段流程接入，candidateLimit 50→500 |
| `apps/worker/src/daily-pipeline.ts` | 流程阶段改为 ingest→screen→interpret |
| `apps/web/src/server/today.ts` | candidateLimit 50→500（修复候选池过小问题） |
| `tests/worker/daily-pipeline.test.ts` | 适配 screen 接口 |
| `tests/worker/configured-daily-processor.test.ts` | 适配 screen 接口 |

### 测试结果

- 全部 **293 个单元测试通过**（37 个测试文件）
- typecheck 全部通过

## 七、当前问题清单

### P0 — 已修复

| 问题 | 根因 | 修复 |
|---|---|---|
| Today 页面推荐列表无分类/解读 | candidateLimit=50 过小，有分类的论文被淹没在 8938 篇未分类论文中 | candidateLimit 提升至 500（Web 端 + Worker 端） |
| Web 服务无法启动 | standalone 模式缺少 DATABASE_URL/REDIS_URL 环境变量 | 从 .env 加载环境变量后启动 |
| 论文详情页 404 | DOI 含 `/` 未编码，直接访问 `/papers/10.1103/xxx` 被路由分割 | 前端已用 `encodeURIComponent` 编码，通过卡片点击正常访问 |

### P1 — 待修复（用户指定）

#### 1. 论文列表排列问题

**现状**：推荐列表按综合评分排序，有解读的论文和未解读的论文混排。

**需求**：
- 有解读的论文全部放前面
- 未解读的期刊论文（通过筛选但未解读）放后面
- 未解读的期刊论文增加"AI 解读"按钮，点击后按同样流程单独处理该篇论文（分类→解读→写入数据库→刷新页面）

**涉及文件**：
- `packages/db/src/today-repository.ts` — 修改排序逻辑，hasInterpretation 优先
- `apps/web/src/components/recommendation-card.tsx` — 未解读论文增加"AI 解读"按钮
- 新增单篇解读 API 端点和 worker job

#### 2. 页面统计功能问题

**现状**：今日统计（新论文/开放获取/已有解读/跨方向信号）均为 0，因为统计基于 `publishedAt` 在今天（上海时区 00:00 后），而论文发表日期是昨日（8-31）。

**需求**：今日看昨日的论文是合理的，统计应更新为**昨日数据**（以上海自然日计算，统计昨日 00:00–24:00 发表的论文）。

**涉及文件**：
- `packages/db/src/today-repository.ts` — 修改 `todayPapers` 过滤逻辑，使用昨日时间窗口

#### 3. 筛选机制微调

**现状**：第二轮 Kimi 批量筛选只基于标题+期刊+摘要，不考虑用户个人兴趣。

**需求**：第二轮筛选时访问用户个人兴趣设置（`UserInterest` 表），根据兴趣方向和权重微调筛选评分，优先推荐用户感兴趣的方向。

**涉及文件**：
- `apps/worker/src/jobs/screen-papers.ts` — 筛选前读取用户兴趣，注入 prompt 或后处理评分
- `packages/ai/src/prompts/screen.ts` — prompt 增加用户兴趣上下文
- `packages/db/src/ai-repository.ts` — 新增按用户兴趣排序的候选查询

### P2 — 后续优化

| 问题 | 说明 |
|---|---|
| 期刊白名单误匹配 | SIAM Journal on Life Sciences、Journal of Environmental Science 等非物理期刊被误匹配，需优化匹配逻辑（增加方向校验） |
| 跨方向信号为空 | 筛选只给单一 directionSlug，没有 crossDisciplinary 标签，需在筛选 prompt 中增加跨方向判断 |
| 2 篇解读失败（invalid_json） | Kimi JSON 格式偶发问题，可增加重试机制或 prompt 中强化 JSON 格式 |
| CSS 样式（standalone 模式） | standalone 构建下静态资源路径可能有问题，页面内容正确但样式可能未完全加载 |
| 单篇解读功能 | 用户点击"AI 解读"按钮后，需要单篇解读的 API 端点和 worker job |

## 八、后续开发方向

### 阶段 A：修复用户指定的 P1 问题（优先）

1. **论文列表排序 + 单篇解读按钮**
   - 修改 `today-repository.ts` 排序：hasInterpretation 优先，然后按评分
   - 推荐卡片增加"AI 解读"按钮（仅未解读的期刊论文显示）
   - 新增 `POST /api/papers/[doi]/interpret` 端点，触发单篇解读
   - 新增单篇解读 worker job（复用现有解读逻辑，单篇模式）
   - 解读完成后前端自动刷新

2. **今日统计改为昨日数据**
   - 修改 `today-repository.ts` 中 `todayPapers` 的时间窗口
   - 统计昨日 00:00–24:00（上海时区）发表的论文
   - 页面标题/说明同步更新为"昨日统计"

3. **筛选机制接入用户兴趣**
   - `screen-papers.ts` 筛选前读取 `UserInterest` 表
   - 将用户兴趣方向和权重注入筛选 prompt
   - 或后处理：Kimi 评分 × 兴趣权重 = 最终评分
   - 优先推荐用户感兴趣方向的论文

### 阶段 B：质量优化

4. **期刊白名单匹配优化**
   - 增加方向校验，非物理方向期刊即使名称匹配也过滤
   - 增加期刊-方向映射表，明确每个期刊的物理方向
   - 补充更多高质量期刊（如 Nature Physics、Nature Materials、PRX 等）

5. **解读失败重试机制**
   - `invalid_json` 错误自动重试 1-2 次
   - prompt 中强化 JSON 格式要求（如"只输出 JSON，不要任何解释文字"）
   - 增加 JSON 解析容错（如提取 ```json 代码块）

6. **跨方向信号**
   - 筛选 prompt 增加 `crossDisciplinary` 字段
   - 保存筛选结果时同步写入跨方向标签
   - Today 页面跨方向信号正常显示

### 阶段 C：长期功能

7. **启用永久定时任务**
   - 用户验收通过后，将 `DAILY_PIPELINE_ENABLED` 改为 `true`
   - 每天 06:00 Asia/Shanghai 自动运行
   - 增加运行结果通知（如飞书消息/邮件）

8. **推送 GitHub**
   - 用户批准后，将本地 main 推送到 GitHub
   - 整理 commit message，确保不包含秘密信息

9. **单篇解读队列**
   - 用户点击"AI 解读"后，加入解读队列
   - 支持批量选择多篇论文同时解读
   - 解读进度实时显示

10. **解读质量评估**
    - 增加解读质量评分（用户点赞/点踩）
    - 基于用户反馈优化解读 prompt
    - 对比不同模型的解读质量

## 九、配置快照

| 配置项 | 当前值 |
|---|---|
| `DAILY_PIPELINE_ENABLED` | `false`（手动运行，待用户批准后启用） |
| `DAILY_PIPELINE_TIME` | `06:00` |
| `DAILY_PIPELINE_TIMEZONE` | `Asia/Shanghai` |
| `PAPER_RETENTION_DAYS` | `30` |
| `DAILY_PAPER_TARGET_MIN` | `10` |
| `DAILY_PAPER_TARGET_MAX` | `15` |
| Kimi 连接 | 已配置于本地数据库（不记录连接 ID） |
| Kimi model | `kimi-k2.6` |
| Kimi baseUrl | `https://api.moonshot.cn/v1` |
| Kimi timeout | `120000ms` |
| 分类路由 | Kimi K2.6 |
| 解读路由 | Kimi K2.6 |
| 筛选批次大小 | 15 篇/批 |
| 候选池大小 | 500 篇 |

## 十、未跟踪文件（必须保留）

- `.superpowers/`
- `.worktrees/`
- `data/journal-corpus/`（含 candidates.json 126 条、science_arxiv_meta.json 7 条、scripts/）

---

*报告生成时间：2026-09-01*
*Git HEAD：cfd5086（含核心去成本提交 7338bb6）*
*数据库备份：`backups/pri-pre-stage9-nocost-20260901.dump`*
