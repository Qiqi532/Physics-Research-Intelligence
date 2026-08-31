# Physics Research Intelligence MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个单用户的 Today Physics MVP，合规聚合物理论文元数据、生成可追溯 AI 解读并提供个性化阅读推荐。

**Architecture:** 使用 Next.js 模块化单体提供网页与内部 API，Node worker 处理采集和 AI 任务，PostgreSQL 持久化事实与用户状态，Redis/BullMQ 解耦耗时任务。所有外部论文和模型服务通过各自适配层进入系统，受限全文永不进入数据库或模型请求。

**Tech Stack:** TypeScript、Next.js、PostgreSQL、Prisma、Redis、BullMQ、Zod、Vitest、Playwright、Docker Compose。

---

## 交付阶段与依赖关系

| 阶段 | 可独立验收的成果 | 依赖 |
|---|---|---|
| 0 | 可启动的本地骨架与密钥边界 | 无 |
| 1 | 论文事实层和数据浏览 API | 0 |
| 2 | 三个公开来源的合规采集 | 1 |
| 3 | 多模型分类与解读任务 | 1、2 |
| 4 | Today Physics 与论文详情界面 | 1、3 |
| 5 | 推荐、可靠性、部署和质量评审 | 2、3、4 |

## 目标文件结构

```text
apps/web/                 Next.js 页面、Route Handler 与组件
apps/worker/              BullMQ worker 与定时任务入口
packages/domain/          Zod schema、标签表、纯函数与共享类型
packages/db/              Prisma schema、迁移、仓储
packages/sources/         Crossref、OpenAlex、arXiv 连接器
packages/ai/              Provider Adapter、提示词、JSON 校验
packages/recommendation/  可解释排序函数
tests/                    单元、集成与端到端测试
infra/                    Docker Compose 与部署示例
```

### Task 1：初始化与安全边界（阶段 0）

**状态：** complete（2026-08-29；容器运行态由保存项目目录接管）

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`
- Create: `apps/web/`, `apps/worker/`, `packages/domain/`, `packages/db/`, `tests/`
- Create: `infra/docker-compose.yml`

- [x] 创建 pnpm monorepo，并初始化 Next.js Web、Node worker 和 Vitest。
- [x] 在 `.env.example` 中只列出变量名：`DATABASE_URL`、`REDIS_URL`、`AI_PROVIDER_*_API_KEY`、`DAILY_AI_BUDGET_USD`；不得填写真实值。
- [x] 编写 `packages/domain/src/config.ts`，启动时校验缺失的必填变量并拒绝将任意以 `_KEY` 结尾的值写入日志。
- [x] 写失败测试：缺少 `DATABASE_URL` 时配置解析返回明确错误；提供密钥时错误对象与日志序列化结果不得含密钥。
- [x] 运行配置安全测试，1 个测试文件、5 个测试通过；运行 `docker compose -f infra/docker-compose.yml config`，静态确认 PostgreSQL 与 Redis 仅绑定 `127.0.0.1`。

> 运行环境交接：当前 Codex worktree 未重建或检查保存项目目录中的容器。将变更同步到 `D:\Physics Research Intelligence` 后，在该目录执行 `docker compose -f infra/docker-compose.yml up -d --force-recreate postgres redis`，再执行 `docker compose -f infra/docker-compose.yml ps` 确认健康状态；这不阻塞阶段 1 的代码工作。

### Task 2：论文事实层与标签体系（阶段 1）

**状态：** complete（2026-08-29）

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/paper.ts`, `packages/domain/src/physics-tags.ts`
- Create: `packages/db/src/paper-repository.ts`
- Create: `apps/web/src/app/api/papers/route.ts`, `apps/web/src/app/api/papers/[doi]/route.ts`
- Test: `tests/domain/paper.test.ts`, `tests/db/paper-repository.test.ts`, `tests/api/papers.test.ts`

- [x] 先写失败测试：同一规范化 DOI 两次写入只产生一条 `Paper` 和两条 `PaperSource`；无 DOI 的近似标题只返回候选重复，不自动合并。
- [x] 定义 `Paper`、`PaperSource`、`PhysicsTag`、`PaperClassification`、`PaperInterpretation`、`UserInterest`、`UserPaperState`、`AiRun` 表，并建立 DOI 唯一索引与来源复合唯一索引。
- [x] 实现 DOI/标题/作者规范化和候选重复函数；标签表覆盖九个基础与交叉方向。
- [x] 运行两条 Prisma 迁移、领域/仓储/API 测试；4 个测试文件、31 个测试通过，`public` schema 已是最新状态。

### Task 3：公开来源连接器（阶段 2）

**Files:**
- Create: `packages/sources/src/types.ts`, `packages/sources/src/crossref.ts`, `packages/sources/src/openalex.ts`, `packages/sources/src/arxiv.ts`
- Create: `apps/worker/src/jobs/ingest-source.ts`
- Test: `tests/sources/crossref.test.ts`, `tests/sources/openalex.test.ts`, `tests/sources/arxiv.test.ts`

- [x] 为 `SourceConnector` 定义统一返回类型：记录、来源 URL、许可证、游标、重试建议和可见错误码。
- [x] 对每个来源先写 fixture 测试：缺 DOI、空摘要、分页游标、429 与临时 5xx 必须产生预期状态。
- [x] 实现按日期增量采集、请求超时、指数退避和来源级最后成功时间；所有 HTTP 调用设定用户代理和速率限制。
- [x] 将来源记录写入事实层并执行 DOI 去重；任务失败只标记该来源，不能使其他来源任务失败。
- [x] 使用录制 fixture 跑连接器集成测试，不在测试中访问真实生产 API。

### Task 4：多云 AI 适配层与提示词（阶段 3）

**Files:**
- Create: `packages/ai/src/provider.ts`, `packages/ai/src/router.ts`, `packages/ai/src/prompts/classify.ts`, `packages/ai/src/prompts/interpret.ts`
- Create: `packages/ai/src/schemas.ts`, `apps/worker/src/jobs/classify-paper.ts`, `apps/worker/src/jobs/interpret-paper.ts`
- Test: `tests/ai/router.test.ts`, `tests/ai/schemas.test.ts`, `tests/ai/prompts.test.ts`

- [x] 先写失败测试：非法 JSON、无证据的创新点、声称读取受限全文、主 provider 网络错误与预算耗尽分别得到安全的结构化结果。
- [x] 定义统一 `AiProvider`：`classify(input)`、`interpret(input)`、`healthCheck()`；为 DeepSeek、OpenAI、Gemini、Qwen 创建独立 adapter，adapter 不得泄露密钥。
- [x] 使用 Zod 校验分类与解读 JSON；解读字段包含证据声明、置信度和证据引用，受限全文输入明确披露仅基于摘要。
- [x] 实现路由规则：批量分类使用低成本主模型，深度解读使用质量主模型；仅对网络/限流/5xx 回退一次到备用模型。
- [x] 写入逻辑 `AiRun` 和物理 `AiRunAttempt`：provider、模型、提示词版本、输入哈希、token、耗时、状态与成本；超过 UTC 每日预算时跳过深度解读。
- [x] 使用 mock provider 跑完整 worker 测试，确保相同幂等键不会重复调用模型。

### Task 5：推荐和内部 API（阶段 4 的后端部分）

**状态：** complete（2026-08-30；未引入无依据的重点期刊权重）

**Files:**
- Create: `packages/recommendation/src/score.ts`, `packages/recommendation/src/reasons.ts`
- Create: `apps/web/src/app/api/today/route.ts`, `apps/web/src/app/api/papers/[doi]/route.ts`, `apps/web/src/app/api/papers/[doi]/state/route.ts`
- Test: `tests/recommendation/score.test.ts`, `tests/api/today.test.ts`

- [x] 先写失败测试：兴趣权重、分类相关度、交叉新颖度、时间衰减、跳过惩罚和收藏加分改变排序，且每篇结果最多生成三条真实理由。
- [x] 实现纯函数评分；返回 `score_breakdown` 与人类可读理由，禁止用模型临时生成推荐理由。
- [x] 实现 Today、论文详情和用户状态 Route Handler；验证 DOI 参数、限制响应字段，不返回密钥、受限全文或内部错误堆栈。
- [x] 运行 API 集成测试，覆盖空数据、失败来源、无 AI 结果和已收藏论文。

### Task 6：Today Physics 与论文解读界面（阶段 4 的前端部分）

**状态：** complete（2026-08-30；首页、详情、阅读状态、兴趣设置和正式 Playwright E2E 已完成）

**Files:**
- Create: `apps/web/src/app/page.tsx`, `apps/web/src/app/papers/[doi]/page.tsx`, `apps/web/src/app/settings/interests/page.tsx`
- Create: `apps/web/src/components/today-overview.tsx`, `recommendation-card.tsx`, `paper-interpretation.tsx`, `reading-queue.tsx`
- Test: `tests/e2e/today.spec.ts`, `tests/e2e/paper-detail.spec.ts`

- [x] 先写 Playwright 测试：首页展示今日统计、推荐理由与阅读队列；论文页展示来源链接、字段置信度及“可能需要校园网/VPN”。
- [x] 实现首页，默认显示全学科概览；推荐按个人兴趣与反馈排序，不把凝聚态固定置顶。
- [x] 实现论文详情，分开渲染 `direct`、`inferred`、`uncertain`；当只拥有摘要时明确显示“基于摘要解读”。
- [x] 实现兴趣设置、收藏、稍后读、完成和不感兴趣操作，并在成功后刷新 Today 结果。
- [x] 在本地 fixture 数据上运行端到端测试；所有业务交互使用专用 PostgreSQL schema，外部网络在测试中被阻断。

### Task 7：可靠性、运维与试运行（阶段 5）

**Files:**
- Create: `apps/worker/src/scheduler.ts`, `apps/web/src/app/api/health/route.ts`
- Create: `infra/docker-compose.yml`, `docs/operations.md`, `docs/evaluation-rubric.md`
- Test: `tests/worker/retry.test.ts`, `tests/e2e/health.spec.ts`

- [x] 先写失败测试：来源连接器超时、模型主服务限流、Redis 重连和每日预算耗尽时，系统状态、重试次数和用户提示均符合规格。
- [x] 配置每天采集、分类、预算内深度解读和生成 Today 汇总的幂等定时任务。
- [x] 增加健康检查、结构化日志、备份恢复说明和既有成本审计字段；日志脱敏覆盖所有统一 provider 边界。
- [ ] 依据 `docs/evaluation-rubric.md` 人工评审至少 30 篇不同物理方向论文：分类正确性、摘要忠实性、创新点证据和推荐有用性。
- [x] 完整运行 `pnpm lint`、`pnpm test`、`pnpm test:e2e`、生产构建与 Compose 健康验证；阶段 7 本地试运行已记录版本、失败项与零外部 API 成本边界。

### Task 8：页面内模型连接管理（阶段 8）

- [x] 使用 AES-256-GCM 将多个命名连接的 API Key 以数据库密文保存，主密钥独立留在仓库外本机文件。
- [x] 提供 localhost 模型管理台、严格内部 API、轻量连接检查和合成论文分类/解读测试；LAN 模式保持只读。
- [x] 分类与解读分别配置主备连接，同一供应商可保存多个命名配置；worker 每批次读取一次快照并在下一批热切换。
- [x] 使用 loopback mock provider 和专用 PostgreSQL schema 覆盖桌面/移动 Playwright，不调用真实模型或论文来源。
- [ ] 由用户在 localhost 输入一个真实供应商 Key，核对当前价格后完成小额连接/样本测试。

## 实施顺序与里程碑

1. **第 1 周：骨架 + 事实层。** 阶段 0 已完成；下一步进入阶段 1，实现手动录入与检索 DOI。
2. **第 2 周：采集。** 阶段 2 已完成：三个公开来源、断点状态、独立失败和幂等入库已通过 fixture/数据库测试。
3. **第 3 周：AI。** 完成阶段 3，先用 mock，再接一主一备两家模型 API。
4. **第 4 周：体验。** 完成阶段 4，交付可日常使用的 Today Physics。
5. **第 5 周：试运行。** 完成阶段 5，积累 30 篇人工评审样本后再调整提示词和模型路由。

## 首次部署前检查清单

- [ ] `.env` 未被版本控制，且无任何真实密钥出现在日志、截图或浏览器网络响应中。
- [ ] 只启用了允许的公开来源；受限全文没有缓存、索引或传给模型。
- [ ] 设定每日模型成本上限、主/备 provider 与一次回退策略。
- [ ] 数据库备份、恢复演练和来源失败告警已验证。
- [ ] 人工阅读至少覆盖一个推荐、一个非推荐和一个交叉方向论文样本。
