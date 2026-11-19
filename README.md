# Physics Research Intelligence

> 面向个人物理研究的本地文献工作台，支持论文发现、阅读管理、PDF 查证和器件制表。

## 主要功能

| 功能 | 能做什么 |
|---|---|
| 论文发现与日报 | 按课题从 arXiv、Crossref、OpenAlex 等来源收集论文，生成带推荐理由和摘要解读的 Today Physics 日报。已发布日报保留固定快照，失败任务可从检查点恢复。 |
| 收藏与推荐反馈 | 管理收藏和阅读进度，标记论文与课题的相关性，并用同一批候选比较关键词、摘要相似度和混合排序。 |
| 本地 PDF 与 Zotero | 索引指定目录和 Zotero 选定收藏夹，按中英术语或测量条件查找原文，打开对应 PDF 物理页。 |
| 器件对照与证据问答 | 按工况记录器件参数、原始单位和图表出处，导出 Markdown 或 CSV。单篇与跨篇问答返回可跳回原页的摘录。 |
| 多模型 API | 支持 OpenAI、DeepSeek、Google Gemini、通义千问、智谱 GLM、Kimi、腾讯混元及 OpenAI Chat Completions 兼容接口。可保存多个连接并独立配置分类和解读的主备路由。 |

当前版本供单用户在本机使用。公开题录和摘要用于模型筛选与解读，本地 PDF 的索引、对照表和证据问答在本机运行。

## 现在怎样使用

Windows 用户可双击根目录 **Start-PRI.cmd**，打开本地 PostgreSQL 和网页。

```powershell
.\Start-PRI.cmd check       # 只读检查
.\Start-PRI.cmd             # 打开平台
.\Start-PRI.cmd daily       # 生成或恢复固定日报，会调用已配置的模型
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daily-task.ps1 status
```

公开研究画像在 `data/research-profile.json`。日报默认 5–8 篇，允许不足，预印本可入选。失败可恢复，发布名单固定，重复运行复用结果。Windows 午间任务提供 install/status/disable/remove 脚本。

应用数据库迁移后，运行 `pnpm evidence:index --root "文献目录"`，从首页进入“本地证据检索”。它从选定目录只读提取 PDF 文字，支持中文术语查页、原文摘录和打开对应物理页。

Zotero 桌面端开启本地 API 后，运行 `pnpm evidence:zotero --list` 查看收藏夹键，再用 `pnpm evidence:zotero --collection KEY` 同步选定收藏夹。首页的“排序回放”可以查看关键词过滤前的候选并记录课题反馈。

在本地证据卡点“加入对照表”，可按工况记录测量、保存原始单位并勾选导出 Markdown 或 CSV。“本地证据问答”支持单篇查证与跨篇原句对照，每条引文都链接到 PDF 物理页。

详细操作见[使用说明](docs/quick-start.zh-CN.md)，本阶段实现与验收见[开发记录](docs/changes/2026-11-13-research-daily-loop.md)。

## 系统架构

```text
Crossref / OpenAlex / arXiv / 本地公开元数据
                       │
                       ▼
             一次性采集与 AI 任务 ───── Redis / BullMQ
                       │                   仅可选旧队列模式
                       ▼
                 PostgreSQL / Prisma
       论文事实、AI 结果、审计、兴趣与阅读状态
                       │
                       ▼
                 Next.js Web 应用
          Today · 详情 · 收藏库 · 设置
```

PostgreSQL 是业务事实来源。默认 `RUNTIME_MODE=local`，Web 与一次性任务分开运行，不连接 Redis；旧队列模式保留为显式选项。Web 与任务共用数据库和模型设置。

## 快速开始

### 前置要求

- Node.js 22.13.0 或更高版本
- pnpm 11.19.0
- PostgreSQL 17，或 Docker Compose；仅旧队列模式需要 Redis 7
- 仅在真实 AI 分类/解读时需要模型供应商 API Key

### 本地启动

在 Windows PowerShell 中从仓库根目录运行：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose -f infra/docker-compose.yml up -d postgres
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

迁移前请检查 `.env`，确保 `DATABASE_URL` 指向专用本地数据库，而不是个人生产数据。`.env` 已被 Git 忽略，不应提交。

Web 沿用 Next.js 的 `apps/web/.env*` 或继承的环境变量；一次性任务读取仓库根目录 `.env`。通过便捷入口启动时根目录配置会传给 Web；直接使用 pnpm dev 时，两者的数据库、运行模式及主密钥设置应保持一致。

启动后可访问：

- Today 首页：`http://127.0.0.1:3000`
- 收藏库：`http://127.0.0.1:3000/library`
- 兴趣设置：`http://127.0.0.1:3000/settings/interests`
- 模型设置：`http://127.0.0.1:3000/settings/models`
- 存活检查：`http://127.0.0.1:3000/api/health/live`
- 就绪检查：`http://127.0.0.1:3000/api/health/ready`

`pnpm dev` 只启动 Web，使用 `Ctrl+C` 停止。Compose 默认只启用 PostgreSQL，Redis 位于可选的 `queue` profile；现有容器和数据卷不会被这次配置修改删除。需要保留本地数据时停止服务即可。完整启动、备份、恢复和排障步骤见[个人部署与运维](docs/operations.md)。

## 多模型 API 配置

1. 启动应用并打开 `http://127.0.0.1:3000/settings/models`。
2. 新建命名连接，选择供应商并填写当前可用的模型与 Base URL。
3. 在本机表单填写 API Key。应用使用 AES-256-GCM 加密保存，并在仓库外保存主密钥。
4. 保存后运行「轻量连通测试」。需要验证分类与结构化解读时，可运行「合成论文示例」。
5. 按需为“分类”和“解读”分别选择已验证的主连接和备用连接。

按供应商官方文档核对模型名称、接口地址和账号权限。公开语料和早期实测记录可作为测试参考。[论文语料说明](data/journal-corpus/README.md) · [三论文摘要试运行](docs/trials/2026-09-01-kimi-abstract-trial.md)

## 每日流水线

本地流程从公开研究画像收窄来源，通过持久化 run ledger（运行台账）保存阶段检查点、固定候选和逐篇解读结果。模型调用在事务外；日报、条目身份和投递标记通过短事务原子发布。

- 手动运行 `pnpm daily:run` 或 `Start-PRI.cmd daily`。两者读取根目录 `.env`；默认 12:15、Asia/Shanghai、目标 5–8 篇，允许不足。
- 同一日期、画像和模型/Prompt 配置重复执行复用已发布结果，未发布的失败任务可恢复。独立 PostgreSQL 会话锁覆盖手动与自动并发。
- Today 只展示已发布报告；阅读状态独立更新。来源失败、覆盖有限、过期报告与未投递的解读失败均明确显示。
- 无公开摘要时展示题录卡，不编造方法或创新。解读部分失败时仅投递已校验条目；没有可展示结果则保留旧日报。发布后的名单不再补写。
- Windows 午间任务脚本为 `scripts/daily-task.ps1`，支持 install/status/disable/remove/preview；安装过程、日志与截止策略见[使用说明](docs/quick-start.zh-CN.md)。
- 旧队列自动调度默认关闭，`DAILY_PIPELINE_ENABLED=false` 仅控制旧队列排程。Windows 本地任务通过操作系统触发一次性入口。
- 已发布报告即使有覆盖缺口也可以正常结束；未发布失败或资源/清理失败返回非零状态。日志输出稳定错误码和汇总。
- 近期投递的论文默认 30 天内不重复；公开候选清理保留收藏、笔记、阅读资产与近期日报引用，不处理本地 PDF。

如需保留旧队列流程，在环境中显式设置 `RUNTIME_MODE=queue` 并配置 `REDIS_URL`，启动 `docker compose -f infra/docker-compose.yml --profile queue up -d`，再运行 `pnpm dev:queue`。自动调度开关仍默认关闭；本地模式即使设置了该开关也不会创建队列。

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
- 本地全文索引以物理页为单位。扫描件、图中文字和复杂公式可能缺少可检索文本。单篇问答和跨论文 RAG 仍在路线图中。
- 已有持久台账、跨进程锁、断点恢复与本地状态提示；尚未验证长期连续运行，也没有主动消息告警。
- 这是无登录的单用户 MVP；公开部署前必须增加认证或可靠的外部访问控制。
- 仓库尚未提供完整生产容器、自动发布、回滚和灾难恢复编排。
- 仓库尚未提供开源许可证；在许可证明确前，不应推断代码或数据拥有任何特定的再分发许可。

## 路线图与项目文档

阶段 0–5 的工作台已实现，问答首版采用本机原文摘录。排序回放需要积累七个不同日报日的真实候选和反馈，才能比较适用性。[开发路线](docs/superpowers/plans/2026-11-18-local-research-workbench-roadmap.md) · [阶段 0–1 实施记录](docs/changes/2026-11-18-local-evidence-search.md) · [阶段 2–3 实施记录](docs/changes/2026-11-18-zotero-ranking-review.md) · [阶段 4–5 实施记录](docs/changes/2026-11-18-evidence-comparison-qa.md)

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

Physics Research Intelligence is a local-first workspace for discovering, reading, and checking physics papers. It provides explainable daily recommendations, a favorites library, and reading feedback. Selected PDF folders and Zotero collections support physical-page search, cited evidence answers, and device comparison exports in Markdown and CSV.

The model console supports OpenAI, DeepSeek, Gemini, Qwen, GLM, Kimi, Hunyuan, and OpenAI Chat Completions-compatible endpoints. It stores encrypted connections, tests provider access, and configures separate primary and fallback routes for classification and interpretation.

Implemented components include Crossref/OpenAlex/arXiv ingestion, PostgreSQL/Prisma persistence, conservative classification, structured Chinese interpretations, encrypted provider connections, deterministic daily selection, paper-level delivery deduplication, retention cleanup, and Vitest/Playwright verification. Local mode is the default: `pnpm dev` starts only Web, while `pnpm daily:run` explicitly runs the real pipeline once. Redis/BullMQ remain optional in queue mode.

The local pipeline includes a persistent run ledger, PostgreSQL advisory locking, immutable reports and recoverable stages. Windows scheduling is explicitly installed; legacy queue scheduling stays disabled by default. Local evidence indexes PDFs from selected folders and Zotero collections and opens exact physical pages by file version. Ranking review compares a frozen public candidate pool using explicit relevance feedback.

Quick start:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose -f infra/docker-compose.yml up -d postgres
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

Use `http://127.0.0.1:3000` and keep the deployment on localhost or a protected private network. Model keys must be entered only through the local model console. See [operations](docs/operations.md), [architecture](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md), and the [evaluation rubric](docs/evaluation-rubric.md) for details.
