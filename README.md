# Physics Research Intelligence

> 面向实验 AMO 物理研究者的本地优先论文情报工作台。

Physics Research Intelligence 将公开论文元数据、可审计的 AI 解读和个人阅读状态组织在同一个本地应用中。它不是自动写综述的黑箱，而是一套帮助研究者筛选、核验和持续跟踪论文的单用户 MVP。

## 项目状态

| 项目 | 当前状态 |
|---|---|
| 产品阶段 | 可本地试运行的单用户 MVP |
| 论文来源 | Crossref、OpenAlex、arXiv，以及本地公开元数据清单 |
| AI 能力 | 保守分类、中文结构化解读、主备模型路由、调用审计 |
| 个人工作流 | Today、兴趣权重、阅读状态、收藏库、30 天普通论文清理 |
| 每日流水线 | 支持滚动窗口、10–15 篇多样化选择和论文级投递去重；自动调度默认关闭 |
| 质量验证 | Kimi 三论文摘要基线已完成；30 篇 AI 初评已产出，第二位人工评审未完成 |

当前重点是把本地试运行做可靠，而不是公开部署。来源事实、AI 生成内容和用户状态分层保存；当摘要、证据或模型调用失败时，界面应如实呈现，不用生成内容覆盖事实。

## 为什么做这个项目

实验物理研究者通常同时面对来源分散、每日新增不稳定、跨方向信息难筛和模型输出难核验四个问题。这个项目希望提供一条可解释的工作流：

1. 从公开接口获取论文事实，并保留来源与原文链接；
2. 用可切换模型做第一轮方向筛选和基于摘要的结构化解读；
3. 按显式兴趣与多样性规则生成 Today，而不是交给不可解释的推荐黑箱；
4. 将收藏、阅读进度和未来的本地全文能力留在用户自己的环境中。

## 核心能力

| 模块 | 已实现能力 |
|---|---|
| 采集与事实层 | 公开来源连接器、游标与有界重试、DOI/来源标识保守去重、PostgreSQL/Prisma 持久化 |
| AI 流水线 | 物理方向分类、中文概述、创新点、局限、证据等级、来源披露和幂等审计 |
| 模型管理 | OpenAI、DeepSeek、Gemini、Qwen、GLM、Kimi、混元及通用 OpenAI-compatible 端点；分类/解读独立主备路由 |
| Today Physics | 兴趣加权、跨方向信号、确定性排序、10–15 篇多样化选择和推荐理由 |
| 个人论文库 | 收藏与阅读状态正交；普通论文按保留期清理，收藏论文长期保留 |
| 运维与验证 | 存活/就绪检查、脱敏日志、Vitest、PostgreSQL 集成测试和 Playwright 桌面/移动端 E2E |

模型管理台允许在 localhost 保存多个命名连接。API Key 经 AES-256-GCM 加密后写入本地数据库，主密钥独立保存在仓库外；浏览器不会收到已保存的明文 Key。

## 系统架构

```text
Crossref / OpenAlex / arXiv / 本地公开元数据
                       │
                       ▼
             Worker 采集与 AI 任务 ───── Redis / BullMQ
                       │                   可重建的队列状态
                       ▼
                 PostgreSQL / Prisma
       论文事实、AI 结果、审计、兴趣与阅读状态
                       │
                       ▼
                 Next.js Web 应用
          Today · 详情 · 收藏库 · 设置
```

PostgreSQL 是业务事实来源，Redis/BullMQ 只承载可重建的运行状态。Web 与 worker 共用数据库和模型设置，但职责保持分离。

## 快速开始

### 前置要求

- Node.js 22 或更高版本
- pnpm 11.19.0
- PostgreSQL 17 与 Redis 7，或 Docker Compose
- 仅在真实 AI 分类/解读时需要模型供应商 API Key

### 本地启动

在 Windows PowerShell 中从仓库根目录运行：

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

迁移前请检查 `.env`，确保 `DATABASE_URL` 指向专用本地数据库，而不是个人生产数据。`.env` 已被 Git 忽略，不应提交。

启动后可访问：

- Today 首页：`http://127.0.0.1:3000`
- 收藏库：`http://127.0.0.1:3000/library`
- 兴趣设置：`http://127.0.0.1:3000/settings/interests`
- 模型设置：`http://127.0.0.1:3000/settings/models`
- 存活检查：`http://127.0.0.1:3000/api/health/live`
- 就绪检查：`http://127.0.0.1:3000/api/health/ready`

使用 `Ctrl+C` 停止 Web 与 worker。需要保留本地 PostgreSQL 数据时，请停止服务而不要删除 Compose volume。完整启动、备份、恢复和排障步骤见[个人部署与运维](docs/operations.md)。

## 模型与密钥配置

1. 启动应用并打开 `http://127.0.0.1:3000/settings/models`。
2. 新建命名连接，选择供应商并填写当前可用的模型与 Base URL。
3. 只在本地页面输入 API Key；不要把密钥放入命令、README、日志或 Git。
4. 先运行轻量连通测试，再按需运行合成论文契约测试。
5. 将验证过的连接分别配置为“分类”和“解读”的主路由；备用路由是可选项。

模型名称、限额和兼容行为可能随供应商变化，真实调用前应以供应商当前官方文档为准。仓库内默认值只是初始配置，不是长期兼容承诺。

`data/journal-corpus/manifest.json` 保存了 45 篇论文的可追溯公开元数据。项目还提供一个明确受控的三论文摘要试运行：

```powershell
pnpm --filter @pri/worker corpus:journal:trial -- 2504.21524v1 2410.10611v2 2408.15441v2
```

此命令会发起真实模型请求。它只发送公开元数据与摘要，不读取或上传本地 PDF 字节。结果与已发现问题记录在 [Kimi 三论文摘要试运行报告](docs/trials/2026-09-01-kimi-abstract-trial.md)。

## 每日流水线

worker 已具备按时区运行的每日流程：滚动采集窗口、筛选、兴趣与多样性选择、逐篇解读、Today 准备、投递标记和过期清理。

- `DAILY_INGEST_WINDOW_DAYS` 默认 30，用较宽候选窗口适配期刊低频发布。
- `DAILY_DELIVERY_RECENCY_DAYS` 默认跟随采集窗口；设为 `0` 可关闭投递去重。
- 去重作用于整篇论文：只要任一已选筛选记录在近期投递过，该论文就不会再次入选。
- 只有 Today 成功准备后才写入投递时间；写入失败会让运行失败并暴露给调度器。
- 自动调度默认关闭。当前还没有跨进程锁、持久化 run ledger、陈旧运行恢复和主动告警；启用时应保持单 worker。

无人值守门禁与后续可靠性要求见[每日全自动流程开发、验收与部署规范](docs/daily-automation-development-and-deployment.md)。

## 数据、安全与隐私

- 公开事实与模型解读分层保存，AI 输出不能改写论文来源事实。
- 当前自动模型输入只包含公开元数据和摘要，不包含受限全文。
- `data/journal-corpus/pdfs/` 与 `data/review-corpus/pdfs/` 只留在本机，并由 Git 忽略。
- arXiv 可访问不等于可以任意再分发或发送给外部模型；全文功能必须同时检查许可证和用户授权。
- 应用目前没有登录，只适合 localhost 或受保护的可信私网，不能直接暴露到公共互联网。
- 数据库备份和模型主密钥必须分开保护；主密钥丢失后，已有连接密文无法恢复。
- 自动化测试使用本地 Mock Provider，不应访问真实模型或真实论文接口。

## 开发与测试

工作区使用 pnpm 管理 Web、worker 和共享包。常用质量门禁：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

测试必须使用独立 PostgreSQL schema，不能指向个人数据或生产数据库。Playwright 场景使用本地 Mock Provider，并阻断外部网络请求。

主要目录：

```text
apps/web/          Next.js 页面与内部 API
apps/worker/       采集、调度与 AI 任务
packages/          领域配置、数据库、模型与推荐模块
tests/             单元、集成、文档契约与 E2E 测试
docs/              设计、运维、评估记录与实施计划
data/              可追溯的公开元数据清单；PDF 不入库
infra/             本地 PostgreSQL / Redis 编排
```

## 当前限制

- 30 篇人工评审尚未完成：30 篇 AI 输出与第一轮 AI 初评已经生成，但第二位人工评审仍需逐篇裁决，D5/D6 也缺少完整流水线证据。
- 浏览器 PDF 上传、全文解析、段落定位、单篇问答和跨论文 RAG 尚未实现。
- 每日流水线没有持久化 run ledger、跨进程锁/租约、陈旧运行恢复与主动告警，因此不应按生产级无人值守服务宣传。
- 这是无登录的单用户 MVP；公开部署前必须增加认证或可靠的外部访问控制。
- 仓库尚未提供完整生产容器、自动发布、回滚和灾难恢复编排。
- 仓库尚未提供开源许可证；在许可证明确前，不应推断代码或数据拥有任何特定的再分发许可。

## 路线图与项目文档

建议按以下顺序继续：

1. 完成 30 篇人工双评，建立可重复的 Prompt/模型质量基线；
2. 增加每日运行台账、跨进程锁、失败恢复、告警和连续影子运行；
3. 实现按许可证控制的本地 PDF 获取与手动导入；
4. 构建带段落证据定位的单篇阅读助手；
5. 在收藏论文上建立可重建、可评估的 RAG 索引与跨论文问答。

文档入口：

- [系统设计](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [本轮审查修复与 README 设计](docs/superpowers/specs/2026-09-07-review-remediation-readme-design.md)
- [本地论文库与 AI 阅读路线图](docs/superpowers/plans/2026-09-01-local-library-ai-reading-roadmap.md)
- [个人部署与运维](docs/operations.md)
- [每日自动化开发与部署规范](docs/daily-automation-development-and-deployment.md)
- [人工质量评审标准](docs/evaluation-rubric.md)
- [30 篇评审材料](docs/evaluation-runs/2026-09-03-full-review-sheet.md)
- [顶刊物理论文公开元数据说明](data/journal-corpus/README.md)

## English overview

Physics Research Intelligence is a local-first, single-user paper intelligence workspace for experimental AMO physics research. It collects public paper metadata, keeps source facts separate from AI-generated interpretations, and provides explainable Today recommendations, interest weighting, reading states, and a favorites library.

Implemented components include Crossref/OpenAlex/arXiv ingestion, PostgreSQL/Prisma persistence, BullMQ worker jobs, conservative classification, structured Chinese interpretations, encrypted provider connections, deterministic daily selection, paper-level delivery deduplication, retention cleanup, and Vitest/Playwright verification.

The project is ready for local trials, not public production. Scheduling is disabled by default; authentication, a persistent run ledger, a distributed lock, production deployment automation, full-text reading, and RAG remain future work. The 30-paper AI first pass exists, but the second human review is still incomplete.

Quick start:

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

Use `http://127.0.0.1:3000` and keep the deployment on localhost or a protected private network. Model keys must be entered only through the local model console. See [operations](docs/operations.md), [architecture](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md), and the [evaluation rubric](docs/evaluation-rubric.md) for details.
