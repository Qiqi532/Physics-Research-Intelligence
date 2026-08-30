# 发现与决策

## 需求
- 服务对象：物理学本科生，未来继续研究生学习；第一版只供本人使用。
- 核心体验：打开网站即看到 `Today Physics`，先获知全学科动态，再得到个人化推荐。
- 覆盖范围：AMO/光学、凝聚态与材料、高能/核/天体及其他物理分支；交叉方向必须可见。
- 论文页：中文概述、创新点、方法与证据、局限、置信度、阅读建议，以及原文链接。

## 研究发现
- Crossref 适合作为 DOI 与期刊论文元数据的基础来源；OpenAlex、arXiv 与重点期刊公开 RSS/API 用于互补。
- 学校订阅应留在用户浏览器访问出版社页面的环节，不应用于批量下载、存储或发送付费全文。
- AI 解读应分为“原文直接信息”“归纳推断”“不确定”三类，且记录可追溯证据。

## 阶段 2 公开来源约束（2026-08-29）
- Crossref 增量同步使用有上下界的 created/indexed 日期窗口与 cursor；请求带可识别 User-Agent，可选 `mailto`，并在 429/5xx 时退避。
- Crossref Works 窗口本身不是物理学过滤器；一次性采集只在配置明确 `CROSSREF_ISSN` 时启用，避免宽泛拉取全学科记录。
- OpenAlex 的 Physics and Astronomy field ID 为 `31`；Works 可以 `topics.field.id:31`、`from_publication_date`、`to_publication_date` 组合过滤，每页支持上限 100，超过 10,000 条时必须使用 cursor。
- OpenAlex 允许无 key 的低频请求，规模化使用应通过环境变量提供 API key；不将 key 放入 URL 日志。
- arXiv API 返回 Atom XML，使用 `start`/`max_results` 分页，多次连续请求之间至少等待约 3 秒；相同查询每日无需重复拉取。
- 阶段 2 只持久化公开元数据、摘要、许可证与原文链接，不下载或传递全文。

## 阶段 3 工作区约束（2026-08-29）
- 保存项目目录仍位于旧本地 main@e355a1d，并含既有未跟踪文件，不能作为阶段 3 基线。
- 阶段 3 的唯一编辑、测试和提交工作区是 D:\Physics Research Intelligence\.worktrees\stage-3；其基线固定为 origin/main@6101ea5。
- 旧手工阶段 3 目录已由用户删除；清理只移除了对应失效 Git 注册和无领先提交的本地分支，没有删除现存目录或其他分支。
- 当前 Codex 桌面补丁入口的 Windows workspace 刷新辅助进程在新增 Git 根后失败；内建 apply_patch 引擎可正常更新同一文件系统，因此后续继续以补丁方式编辑，不使用脚本覆写文件。

## 阶段 3 设计与配置盘点（2026-08-29）
- 已批准设计要求统一 classify、interpret、healthCheck Provider Adapter，并明确 DeepSeek、OpenAI、Gemini、Qwen 四个独立边界。
- 回退最多一次且只适用于网络、超时、429 和临时 5xx；合法 uncertain、输入不足、JSON/schema 错误、鉴权、永久 4xx、配置和预算错误均不得回退。
- 只输入标题、公开元数据和摘要时必须标记“基于摘要解读”，不得声称访问受限全文；重要项使用 direct、inferred、uncertain 证据等级和引用。
- 当前根脚本已提供全量 test、lint、typecheck、build，Vitest 统一收集 tests/**/*.test.ts；workspace 会自动包含新的 packages/ai。
- .env.example 当前仅列 provider 密钥和 DAILY_AI_BUDGET_USD，阶段 3 需补充分类/解读主备 provider、模型、base URL、请求超时及成本估算配置名称。
- 现有 MVP Task 4 尚未精确覆盖每次物理 provider 尝试的独立 AiRun 审计、预算 UTC 边界与并发/重复任务顺序，实施计划需补齐。
- PostgreSQL 集成测试通过 TEST_DATABASE_URL 可选启用并使用独立 schema；阶段 3 测试只能清理该 schema 中的相关模型，不得操作 public。
- 数据库迁移采用只追加的新目录与 SQL，阶段 3 必须新增第 4 条 migration，不改写前三条历史迁移。
- 现有仓储从 packages/db/src/index.ts 集中导出，worker job 以 Pick 形成窄写入接口并通过 Vitest mock 注入，阶段 3 沿用此边界。
- AiRun 当前全局唯一 idempotencyKey 与主备两次审计冲突；实施采用稳定 logical idempotency key 与 attempt 序号组合唯一，每次物理 provider 调用独立一行，成功幂等查询按 logical key + COMPLETE。
- 预算跳过不调用 provider，不创建虚假的物理调用 attempt；逻辑 AiRun 以 SKIPPED_BUDGET 留痕。分类不参与深度解读预算阻断，也不得计入解读预算消耗。
- packages/domain 没有 src/index.ts，包通过 exports 子路径暴露模块；新代码不得假设存在聚合入口。

## 阶段 3 Provider 官方 API 核验（2026-08-29）
- OpenAI Structured Outputs 官方文档：https://developers.openai.com/api/docs/guides/structured-outputs 。Responses API 使用 text.format 的 strict json_schema；usage 字段为 input_tokens、output_tokens、total_tokens，并需识别 refusal。
- DeepSeek Chat Completions 官方文档：https://api-docs.deepseek.com/api/create-chat-completion/ 与 https://api-docs.deepseek.com/guides/json_mode/ 。端点为 /chat/completions，JSON 模式使用 response_format json_object，提示词仍须明确要求 JSON；usage 为 prompt_tokens、completion_tokens、total_tokens。
- Gemini generateContent 官方文档：https://ai.google.dev/api/generate-content 。结构化输出配置在 generationConfig，usageMetadata 为 promptTokenCount、candidatesTokenCount、totalTokenCount；无 candidate 或安全拦截必须映射为稳定错误。
- Qwen OpenAI-compatible 官方文档：https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope 与 https://help.aliyun.com/zh/model-studio/qwen-api-via-dashscope 。端点为区域性 compatible-mode/v1/chat/completions，响应与 OpenAI Chat Completions 相同，JSON 模式仍要求提示词明确指定 JSON。
- 四家 adapter 均使用注入 fetch 的服务器端 HTTP 边界；OpenAI 和 Gemini 保持原生协议，DeepSeek 与 Qwen 只共享兼容协议 transport，不共享 provider 配置或密钥。
- 本地严格 Zod schema 是最终业务验证边界；provider 的结构化输出能力不能替代未知字段、枚举和证据引用校验。
- AiRun 保留为 idempotencyKey 唯一的逻辑任务与并发 claim；新增 AiRunAttempt 逐次记录 provider、model、token、耗时、错误码和成本，主备两次调用不会聚合伪装成一次。

## 阶段 3 实现结论（2026-08-30）
- 新增 @pri/ai：strict 分类/解读 schema、版本化安全 prompt、统一 provider contract、MockProvider、稳定错误码、成本/UTC 预算工具与配置工厂。
- OpenAI 使用 Responses strict JSON Schema；Gemini 使用 generateContent response schema；DeepSeek 与 Qwen 各自封装 OpenAI-compatible chat 边界。所有 HTTP 均可注入 fetch，adapter 内不重试。
- router 最多执行主、备各一次；仅 network_error、timeout、rate_limited、upstream_5xx 触发回退，所有业务、鉴权、配置及结构错误直接终止。
- worker 在调用前只读取标题、公开摘要、期刊、日期和访问状态；受限/摘要输入输出必须披露 abstract_only，并为关键结论附 direct、inferred 或 uncertain 证据等级。
- AiRun 表示逻辑幂等任务，AiRunAttempt 表示每次物理供应商调用；完成或失败时聚合 token、耗时和估算成本，主备尝试保持独立审计。
- 深度解读预算按 UTC 日、实际解读 attempt 成本和活跃 reservation 计算，并以事务级 advisory lock 串行化并发预留；分类成本明确排除。预算不足时不调用任何 provider。
- 第 4 条迁移已只追加部署到 pri_stage3_test 专用 schema；数据库集成测试未触碰 public。
- CodeRabbit CLI 未安装，未上传代码；本地审查发现并修复“分类成本被计入解读预算”的警告级问题，并增加无数据库回归测试。
- 本阶段所有 provider 测试均使用 mock HTTP/fixture，没有发起真实模型 API 请求，也没有读取或写入任何真实密钥。

## 技术决策
## 阶段 4 工作区与初始边界（2026-08-30）
- 主工作区 `main` 存在用户未跟踪的 `.superpowers/`、`.worktrees/` 和 `apps/web/tsconfig.tsbuildinfo`，本阶段不得修改或暂存它们。
- 阶段 4 唯一编辑、测试和提交工作区是 `D:\Physics Research Intelligence\.worktrees\stage-4`，分支 `codex/stage-4`，基线精确为 `00afc9aa0dcc96445e18a6e3e132e4892f79aa4b`。
- `codex/stage-3` 工作区状态干净；新 worktree 只从指定提交创建，未触碰其他分支或用户数据。
- 阶段 3 已提供可直接消费的论文分类、结构化解读、证据等级和来源披露；阶段 4 不得新增模型调用。
- 现有 Prisma 已包含 `UserInterest`、`UserPaperState`、`PaperClassification` 和 `PaperInterpretation`；阶段 4 可通过新增窄仓储完成，不需要修改 schema 或追加迁移。
- 推荐应作为新的 `packages/recommendation` 纯函数包实现；现有 workspace 自动发现 `packages/*`，无需改 workspace 路径。
- 当前 Web 边界是 Route Handler → 可注入服务 → `@pri/db` 仓储；阶段 4 应沿用此结构，不在页面或 Route Handler 中直接写 Prisma 查询。
- 当前 UI 只有米白背景、砖红 eyebrow、深蓝正文和 Georgia 标题；阶段 4 扩展这一风格，不引入组件库或设计系统重构。
- 冷启动没有兴趣时仍以分类相关度、时间新鲜度和交叉发现价值排序；没有分类时仅保留时间/状态信号并明确“尚待分类”；没有解读不影响排序但详情页必须显示缺少 AI 解读。
- 现有设计没有重点期刊配置或权重来源；阶段 4 不硬编码主观期刊名单，先完成用户明确要求的兴趣、分类、发布时间、跨领域和阅读状态五类信号。
- React 页面优先使用服务端组件；仅状态更新控件使用最小客户端边界，独立数据库读取并行执行，避免页面自请求内部 API 和串行瀑布。

## 阶段 4 实现与审查结论（2026-08-30）
- `@pri/recommendation` 使用注入的 `now`、固定权重和稳定并列规则；无随机数、AI、遥测、外部网络或隐藏模块状态。
- Today 仓储并行读取兴趣与候选论文，消费阶段 3 的分类和已完成解读；冷启动、缺分类、缺解读、保存/阅读/完成/跳过状态都有确定行为。
- 详情 DTO 只暴露公开事实、来源、验证过的结构化解读与安全用户状态；损坏的持久化解读降级为 unavailable，不影响公开事实展示。
- 本地审查发现并以红绿测试修复两个警告级问题：切换阅读状态时旧 DISLIKE 未清除，以及重复分类版本导致详情标签重复。LIKE 反馈保持不变，非兴趣状态恢复为 NONE。
- CodeRabbit CLI 未安装且其服务会上传差异；遵守本阶段无外部网络边界，未上传代码，改用完整本地差异审查。
- Next.js standalone 默认不复制 `.next/static`；新增可测试 postbuild 复制步骤后，生产预览 CSS 请求恢复 200。
- 390px 视觉检查发现首屏标题横向溢出；新增 CSS 回归测试并通过最小宽度/小屏字号修复。
- 专用 `pri_stage4_test` schema 复用了既有 4 条迁移，无 Prisma schema 或历史迁移变更；浏览器 fixture 已全部清除。
- 正式兴趣设置页与 Playwright E2E 不属于本次已交付差异，保留为后续任务；本阶段用隔离本地 Chrome 完成桌面、390px、详情、空态和安全错误态验收。

## 技术决策
| 决策 | 理由 |
|---|---|
| 模块化单体 | MVP 部署和调试简单，同时内部边界可拆分 |
| PostgreSQL | 适合 DOI 唯一约束、筛选、全文检索与后续向量检索 |
| 后台任务队列 | 采集、分类、深度解读与日简报不阻塞网页请求 |
| Provider Adapter | 统一多家云端 API 的调用、JSON 校验、计费记录和回退 |
| Prisma 固定为 7.10.0 | 当前 `prisma` 最新标签指向 8.0 RC，而 client/adapter 稳定版为 7.10.0；统一固定版本避免候选版混装 |
| DOI 唯一、无 DOI 保守候选 | DOI 提供确定性身份；缺 DOI 时避免相似标题导致错误合并 |
| 独立测试 schema | `pri_stage1_test` 隔离集成测试清理，不触碰应用 `public` 数据 |
| 显式 adapter schema | `pg` 不解释 Prisma URL 的 `schema` 参数，客户端工厂必须校验后传给 `PrismaPg` |
| 原生来源适配层 | 统一返回类型与错误码，同时保留三个上游的分页、限流与字段差异 |
| fixture-only 连接器测试 | 使测试可重现，不消耗公开 API 配额，不将生产网络状态当作测试前置 |

## 视觉/浏览器发现
- Today Physics 首屏应包含：今日统计、跨方向信号、个性推荐和阅读队列。
- 推荐卡需要直接显示“为什么推荐”，而非只显示不透明分数。
- 论文页需要将事实提取与审慎推断分栏，避免模型结论被误认为论文结论。
