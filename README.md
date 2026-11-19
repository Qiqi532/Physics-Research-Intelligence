# Physics Research Intelligence

> 面向个人物理研究的本地文献工作台。A local-first paper workspace for physics research.

[中文](#中文) · [English](#english)

## 中文

### 项目功能

Physics Research Intelligence 用于发现物理论文、安排阅读、核查原文并整理可复核的器件证据。

| 功能 | 能做什么 |
|---|---|
| 论文发现与日报 | 从 arXiv、Crossref、OpenAlex 等公开来源收集候选，按课题生成有推荐理由和中文摘要解读的 Today Physics 日报。已发布日报保留固定快照。 |
| 收藏与推荐反馈 | 管理收藏和阅读进度，记录论文与课题的相关性，在同一批公开候选上比较不同排序方式。 |
| PDF 与 Zotero 查证 | 索引指定目录和 Zotero 选定收藏夹，按中英术语或测量条件找原文，可打开具体 PDF 物理页。 |
| 器件制表和证据问答 | 按工况保留器件参数、原始单位及图表出处，导出 Markdown 或 CSV。单篇与跨篇证据问答返回带原页链接的摘录。 |
| 多模型 API | 支持 OpenAI、DeepSeek、Google Gemini、通义千问、智谱 GLM、Kimi、腾讯混元及 OpenAI Chat Completions 兼容接口。模型管理台可保存多个连接、独立测试并设置分类与解读的主备路由。 |

完整工作台位于开发分支。下方架构和启动命令适用于 `main` 的基础版。[查看完整工作台](https://github.com/Qiqi532/Physics-Research-Intelligence/tree/codex/local-evidence-search) · [中文使用说明](https://github.com/Qiqi532/Physics-Research-Intelligence/blob/codex/local-evidence-search/docs/quick-start.zh-CN.md)

### 系统架构

```text
公开论文来源 / 本地公开元数据清单
                │
                ▼
       Worker 采集与 AI 任务 ────── Redis / BullMQ
                │                    可替换队列状态
                ▼
          PostgreSQL / Prisma
   事实、分类、解读、阅读状态、AI 审计
                │
                ▼
       Next.js Web / Today Physics
```

PostgreSQL 是事实来源，Redis/BullMQ 只保存可重建的运行状态。Web 与 worker 共享同一数据库和模型设置主密钥，但浏览器永远不会收到已保存的 API Key。

### 本地启动（main）

以下步骤适用于默认分支的 Windows 本地环境。

前置要求：

- Node.js 22 或更高版本；
- pnpm 11.19.0；
- PostgreSQL 17 与 Redis 7，或 Docker Compose；
- 仅在执行真实 AI 分类/解读时需要模型 API Key。

从仓库根目录开始：

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

请先在 `.env` 中设置专用本地数据库连接；不要提交 `.env`。打开：

- 应用首页：`http://127.0.0.1:3000`
- 模型设置：`http://127.0.0.1:3000/settings/models`
- 存活检查：`http://127.0.0.1:3000/api/health/live`
- 就绪检查：`http://127.0.0.1:3000/api/health/ready`

停止 Web 与 worker 使用 `Ctrl+C`；保留 PostgreSQL 数据时只停止本地依赖，不删除 Compose volume。完整说明见[个人部署与运维](docs/operations.md)。

### 多模型 API 配置

1. 打开本机模型管理台 `http://127.0.0.1:3000/settings/models`。
2. 新建命名连接，选择供应商，按其官方文档填写接口地址、可用模型和 API Key。
3. 保存后运行「轻量连通测试」。需要验证分类与结构化解读时，可运行「合成论文示例」。
4. 按需为「分类」和「解读」分别选择已验证的主连接与备用连接。

API Key 由应用使用 AES-256-GCM 加密保存，主密钥存放在仓库外。真实测试按所选供应商的规则计量。[公开论文语料](data/journal-corpus/README.md)

### 数据与安全边界

- 公开事实与模型解读分层保存；AI 输出不能修改来源事实。
- 当前自动 AI 输入只包含公开元数据和摘要，不包含受限全文。
- `data/journal-corpus/pdfs/` 与 `data/review-corpus/pdfs/` 都不得提交 Git 或从项目重新分发。
- arXiv 文件存在不等于拥有任意再分发或外部模型处理许可；全文能力需要独立的许可证和用户授权状态。
- 当前应用没有登录，只适合 localhost 或受保护的可信私网；不要直接暴露到公共互联网。
- 模型调用保留 Token 用量和失败审计，计费由供应商负责。
- 自动化测试全部使用 Mock Provider，不调用真实论文来源或真实模型 API。

### 验证与测试

常用检查：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

测试需要专用 PostgreSQL schema，不能指向个人或生产数据库。Playwright 使用本地 Mock Provider，禁止外部网络请求。真实供应商连接可在本机模型管理台验证。

### 已知限制

- 本机应用面向单用户。公开部署需要认证和相应的数据访问边界。
- 完整工作台的本地问答采用逐页原文摘录。扫描式 PDF 和图表读数可在原 PDF 中人工核查。
- 推荐质量仍需通过跨方向评审和真实阅读反馈验证。

### 路线图与文档

- [工作台路线图](https://github.com/Qiqi532/Physics-Research-Intelligence/blob/codex/local-evidence-search/docs/superpowers/plans/2026-11-18-local-research-workbench-roadmap.md)
- [系统设计](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [模型连接管理台设计](docs/superpowers/specs/2026-08-31-model-connection-console-design.md)
- [个人部署与运维](docs/operations.md)
- [人工质量评审](docs/evaluation-rubric.md)

## English

### What it does

- **Discover papers.** Collect public records from arXiv, Crossref, and OpenAlex and generate Today Physics reports with recommendation reasons and structured abstract interpretations.
- **Manage reading.** Track favorites and reading progress, record relevance feedback, and replay ranking methods on the same candidate pool.
- **Check sources.** Search selected PDF folders and Zotero collections, open exact physical pages, and keep excerpts with their citations.
- **Compare devices.** Record operating conditions and original units, export selected evidence to Markdown or CSV, and ask extractive questions across one or more papers.
- **Connect multiple model APIs.** Use OpenAI, DeepSeek, Gemini, Qwen, GLM, Kimi, Hunyuan, or an OpenAI Chat Completions-compatible endpoint. Test connections individually and set separate primary and fallback routes.

The development branch contains the full workspace. The architecture and local setup below describe the baseline on `main`. [Full workspace](https://github.com/Qiqi532/Physics-Research-Intelligence/tree/codex/local-evidence-search)

### Architecture

```text
Public paper sources / local public metadata manifest
                         │
                         ▼
              Worker ingestion and AI jobs ───── Redis / BullMQ
                         │                        replaceable queue state
                         ▼
                  PostgreSQL / Prisma
       facts, classifications, interpretations,
              reading state, and AI audits
                         │
                         ▼
               Next.js Web / Today Physics
```

PostgreSQL is the source of truth. Redis and BullMQ hold replaceable operational state. Web and worker share the database and model-settings master key, but the browser never receives a saved API key.

### Local setup on main

The baseline runs locally on Windows.

Prerequisites:

- Node.js 22 or newer;
- pnpm 11.19.0;
- PostgreSQL 17 and Redis 7, or Docker Compose;
- an AI provider key only when running real classification or interpretation.

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

Configure a dedicated local database in `.env` before migration and never commit that file. Open:

- app: `http://127.0.0.1:3000`
- model settings: `http://127.0.0.1:3000/settings/models`
- liveness: `http://127.0.0.1:3000/api/health/live`
- readiness: `http://127.0.0.1:3000/api/health/ready`

Stop Web and worker with `Ctrl+C`. Stop rather than remove the Compose volume when preserving local PostgreSQL data. See [Personal deployment and operations](docs/operations.md) for the full procedure.

### Model API setup

1. Open the local model console at `http://127.0.0.1:3000/settings/models`.
2. Add a named connection, select a provider, and enter a supported model, endpoint, and API key.
3. Save the connection and run the lightweight test. Use the synthetic-paper sample to check classification and structured interpretation.
4. Set the verified connections as primary or fallback routes for classification and interpretation as needed.

The application encrypts API keys with AES-256-GCM and stores the master key outside the repository. Each provider meters real API requests. [Public paper corpus](data/journal-corpus/README.md)

### Data and safety boundaries

- Public facts and model interpretations are stored separately; AI output cannot modify source facts.
- Current automated model input is limited to public metadata and abstracts, not restricted full text.
- Files under `data/journal-corpus/pdfs/` and `data/review-corpus/pdfs/` must not be committed to Git or redistributed by this project.
- An arXiv copy does not automatically grant arbitrary redistribution or external-model processing rights. Full-text features require an explicit license and user-permission state.
- The current app has no login and is intended for localhost or a protected trusted network. Do not expose it directly to the public internet.
- Model calls cost money. The first real trial is bounded to three papers and retains budget, token, and failure audits.
- Automated tests use mock providers and do not call real paper sources or real AI APIs.

### Verification and tests

Common checks:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

### Known limitations

- The app is designed for local, single-user use. Public deployment requires authentication and data access controls.
- Local evidence answers quote indexed PDF text. Scanned pages and measurements in figures can be checked in the original PDF.
- Ranking quality needs continued evaluation using real reading feedback.

### Roadmap and documentation

- [Workspace roadmap](https://github.com/Qiqi532/Physics-Research-Intelligence/blob/codex/local-evidence-search/docs/superpowers/plans/2026-11-18-local-research-workbench-roadmap.md)
- [System design](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [Model connection console](docs/superpowers/specs/2026-08-31-model-connection-console-design.md)
- [Personal deployment and operations](docs/operations.md)
- [Manual quality review](docs/evaluation-rubric.md)
