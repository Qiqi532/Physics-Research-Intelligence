# Physics Research Intelligence

> 面向个人物理研究的可解释 AI 论文情报平台。An explainable AI paper-intelligence platform for personal physics research.

[中文](#中文) · [English](#english)

## 中文

### 项目简介

Physics Research Intelligence 是一个面向个人物理学习与研究的论文情报平台。它聚合公开论文事实，使用可切换的大模型完成保守分类与结构化解读，再通过确定性、可解释的兴趣评分生成 Today Physics。

项目当前处于可本地试运行的单用户 MVP 阶段。核心原则是把“来源事实”“AI 解读”和“个人阅读状态”分开保存：模型输出不能覆盖原始事实，推荐结果必须给出理由，缺失或失败的解读会如实显示。

### MVP 当前能力

- 公开来源采集：Crossref、OpenAlex 与 arXiv，支持游标、超时、有界重试、限流处理和保守去重。
- 论文事实层：PostgreSQL/Prisma 保存标题、作者、摘要、期刊、DOI、来源、许可证信息和原文链接。
- AI 流水线：物理方向分类、中文结构化解读、证据等级、来源披露、预算预留、幂等审计和一次主备回退。
- 多模型适配：OpenAI、DeepSeek、Gemini、Qwen、智谱 GLM、Kimi、混元及通用 OpenAI Chat Completions 兼容端点。
- 模型管理台：在 localhost 保存多个命名连接，加密 API Key，执行轻量连通测试与合成论文示例，并配置分类/解读主备路由。
- Today Physics：首页统计、跨方向信号、可解释推荐、阅读队列、论文详情和可恢复错误状态。
- 个性化：物理方向兴趣权重，以及稍后读、正在阅读、完成和不感兴趣等阅读状态。
- 自动处理：BullMQ 每日采集、分类、预算内解读和 Today 准备，支持时区、启停和同窗口幂等。
- 可靠性：存活/就绪检查、稳定错误码、脱敏结构化日志、队列状态与失败恢复。
- 测试与运维：Vitest、PostgreSQL 集成测试、Playwright 桌面/移动端 E2E，以及启动、迁移、备份恢复和故障排查文档。

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

### 零成本本地启动

现阶段推荐在 Windows 电脑上本地运行，不需要购买域名或 VPS。

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

### Kimi 模型接入

1. 启动 Web 与 worker 后打开 `http://127.0.0.1:3000/settings/models`。
2. 新建一个命名连接并选择 Kimi。
3. 根据 Moonshot AI 当前官方文档核对 Base URL、可用模型和价格。仓库默认值只是起点，不是长期价格保证。
4. 只在本地页面粘贴 API Key；不要把 Key 写入 README、命令、聊天记录或 Git。
5. 先执行“轻量连通测试”，再执行可能产生少量费用的“合成论文示例”。
6. 测试通过后，将该连接设置为分类与解读的主路由。

API Key 使用 AES-256-GCM 加密后保存到本地数据库，主密钥独立存放在仓库外。数据库备份与主密钥需要分别保护；丢失主密钥后，已有密文无法恢复。

### 首次三论文试运行

`data/journal-corpus/manifest.json` 当前整理了 45 篇顶刊物理论文的公开元数据，PDF 仅保存在本机并由 Git 忽略。首次 Kimi 对比试运行选择三个方向清晰、体量可控的记录：

| 方向 | arXiv ID | 论文 |
|---|---|---|
| 精密测量 | `2504.21524v1` | *Levitated Sensor for Magnetometry in Ambient Environment* |
| 量子气体 | `2410.10611v2` | *A phase microscope for quantum gases* |
| 核物理 | `2408.15441v2` | *Tracking the baryon number with nuclear collisions* |

本轮只导入并发送公开元数据与摘要，包括标题、摘要、期刊和发表日期。导入器不读取本地 PDF 字节，模型调用不上传 PDF 全文，也不会声称已经阅读全文。

在本地页面完成 Kimi 连接测试并设置分类/解读路由后，运行：

```powershell
pnpm --filter @pri/worker corpus:journal:trial -- 2504.21524v1 2410.10611v2 2408.15441v2
```

该命令会产生真实的付费模型请求。不要把 API Key 放入命令行；CLI 只读取模型管理台已经加密保存的连接。

试运行成功标准：

- Kimi 轻量连通测试和合成论文示例通过；
- 三篇记录幂等入库并完成物理方向分类；
- 每篇生成带证据等级和来源引用的中文结构化解读；
- 页面明确显示“基于摘要解读”；
- AI 审计记录模型、Prompt 版本、Token、耗时、估算费用和真实失败状态；
- 人工比较三篇结果，将第一次运行作为质量基线，而不是最终学术结论。

语料来源、校验与许可说明见[顶刊物理论文语料](data/journal-corpus/README.md)。本轮设计见[双语 README 与 Kimi 试运行设计](docs/superpowers/specs/2026-09-01-bilingual-readme-kimi-trial-design.md)。

### 数据与安全边界

- 公开事实与模型解读分层保存；AI 输出不能修改来源事实。
- 当前自动 AI 输入只包含公开元数据和摘要，不包含受限全文。
- `data/journal-corpus/pdfs/` 与 `data/review-corpus/pdfs/` 都不得提交 Git 或从项目重新分发。
- arXiv 文件存在不等于拥有任意再分发或外部模型处理许可；全文能力需要独立的许可证和用户授权状态。
- 当前应用没有登录，只适合 localhost 或受保护的可信私网；不要直接暴露到公共互联网。
- 模型调用有费用。首次真实试运行固定为三篇，并保留预算、Token 和失败审计。
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

测试需要专用 PostgreSQL schema，不能指向个人或生产数据库。Playwright 使用本地 Mock Provider，禁止外部网络请求。执行真实 Kimi 连接和三篇论文试运行是明确的人工操作，不属于自动测试。

### 已知限制

- 尚未完成浏览器 PDF 上传、全文解析、段落定位、单篇对话或跨论文 RAG。
- 尚未用真实 Kimi Key 完成首批三论文基线，本次会话将执行该试运行。
- 30 篇跨方向人工内容质量评审仍未完成。
- 应用是无登录单用户 MVP；公开部署前必须增加应用认证或可靠的外部访问控制。
- 尚未提供完整的生产 Dockerfile、systemd 单元、自动发布与回滚流程。
- 模型名称、限额和价格会变化，真实调用前必须核对供应商官方文档。

### 路线图与文档

近期顺序：

1. 完成 Kimi 三论文摘要试运行并校准分类/解读 Prompt；
2. 实现每日 10–15 篇选择、独立收藏状态和 30 天普通论文保留；
3. 设计合法本地 PDF 资产边界；
4. 实现带证据定位的单篇阅读助手；
5. 在收藏论文上构建可重建、可评估的 RAG。

文档入口：

- [系统设计](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [模型连接管理台设计](docs/superpowers/specs/2026-08-31-model-connection-console-design.md)
- [双语 README 与 Kimi 试运行设计](docs/superpowers/specs/2026-09-01-bilingual-readme-kimi-trial-design.md)
- [本地论文库与 AI 阅读路线图](docs/superpowers/plans/2026-09-01-local-library-ai-reading-roadmap.md)
- [个人部署与运维](docs/operations.md)
- [人工质量评审](docs/evaluation-rubric.md)

## English

### Overview

Physics Research Intelligence is a personal paper-intelligence platform for physics learning and research. It aggregates public paper facts, uses interchangeable language models for conservative classification and structured interpretation, and produces Today Physics with deterministic, explainable interest scoring.

The project is currently a single-user MVP ready for local trials. Its central rule is to keep source facts, AI interpretations, and personal reading state separate: model output cannot overwrite source facts, recommendations must explain themselves, and missing or failed interpretations remain visible.

### Current MVP capabilities

- Public-source ingestion from Crossref, OpenAlex, and arXiv with cursors, timeouts, bounded retries, rate-limit handling, and conservative deduplication.
- A PostgreSQL/Prisma fact layer for titles, authors, abstracts, journals, DOIs, provenance, license information, and original links.
- AI classification and Chinese structured interpretation with evidence levels, source disclosure, budget reservation, idempotent audit records, and one primary/fallback attempt.
- Provider adapters for OpenAI, DeepSeek, Gemini, Qwen, GLM, Kimi, Hunyuan, and generic OpenAI Chat Completions-compatible endpoints.
- A localhost model console for encrypted named connections, lightweight health checks, synthetic-paper samples, and independent classification/interpretation routes.
- Today Physics statistics, cross-disciplinary signals, explainable recommendations, a reading queue, paper details, and recoverable error states.
- Interest weights and reading states such as saved, reading, complete, and not interested.
- BullMQ-based daily ingestion, classification, budgeted interpretation, and Today preparation with timezone-aware idempotent windows.
- Liveness/readiness checks, stable error codes, redacted structured logs, queue visibility, and recovery behavior.
- Vitest, PostgreSQL integration tests, Playwright desktop/mobile E2E, and operational guides for startup, migrations, backup, restore, and troubleshooting.

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

### Zero-cost local start

The recommended MVP setup runs on a Windows computer and does not require a domain or VPS.

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

### Kimi model setup

1. Start Web and worker, then open `http://127.0.0.1:3000/settings/models`.
2. Create a named connection and choose Kimi.
3. Check Moonshot AI's current official documentation for the base URL, available model, and current prices. Repository defaults are starting values, not permanent billing claims.
4. Paste the API key only into the local form. Never place it in README, commands, chat, or Git.
5. Run the lightweight connection test, followed by the synthetic-paper sample that may incur a small charge.
6. After both pass, assign the connection as the classification and interpretation primary route.

The key is encrypted with AES-256-GCM before database storage, while the master key lives outside the repository. Protect database and master-key backups separately. Existing ciphertext cannot be recovered if the master key is lost.

### First three-paper trial

`data/journal-corpus/manifest.json` currently describes 45 papers from leading journals using public metadata. PDFs remain local and ignored by Git. The first Kimi comparison uses:

| Area | arXiv ID | Paper |
|---|---|---|
| Precision measurement | `2504.21524v1` | *Levitated Sensor for Magnetometry in Ambient Environment* |
| Quantum gases | `2410.10611v2` | *A phase microscope for quantum gases* |
| Nuclear physics | `2408.15441v2` | *Tracking the baryon number with nuclear collisions* |

This trial imports and sends public metadata and abstracts only: title, abstract, journal, and publication date. The importer does not read local PDF bytes, the model request does not upload PDF full text, and the application must not claim that the full paper was read.

After the local Kimi connection checks pass and both task routes are assigned, run:

```powershell
pnpm --filter @pri/worker corpus:journal:trial -- 2504.21524v1 2410.10611v2 2408.15441v2
```

This command makes real paid model requests. Never place an API key on the command line; the CLI resolves only the connection encrypted by the local model console.

Acceptance criteria:

- Kimi's lightweight check and synthetic-paper sample pass;
- all three records are imported idempotently and classified;
- each paper receives a Chinese structured interpretation with evidence levels and source references;
- the page displays the disclosure `基于摘要解读` (interpretation based on abstract);
- AI audit records contain model, prompt version, tokens, duration, estimated cost, and truthful failures;
- a human compares the three outputs as a first quality baseline, not a final scientific judgment.

See [Journal physics corpus](data/journal-corpus/README.md) for provenance, verification, and license notes, and [Bilingual README and Kimi Trial Design](docs/superpowers/specs/2026-09-01-bilingual-readme-kimi-trial-design.md) for the approved boundary.

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

Tests require a dedicated PostgreSQL schema and must never target personal or production data. Playwright uses a local mock provider and blocks external network requests. Real Kimi connection checks and the three-paper run are explicit human operations, not automated tests.

### Known limitations

- Browser PDF upload, full-text extraction, section locators, one-paper chat, and cross-paper RAG are not implemented.
- The first three-paper baseline has not yet been run with a real Kimi key; this guided session will perform it.
- The 30-paper cross-disciplinary human quality evaluation is incomplete.
- This is an unauthenticated single-user MVP. Public deployment requires application authentication or reliable external access control.
- The repository does not yet contain complete production Dockerfiles, systemd units, or automated release and rollback workflows.
- Provider models, limits, and prices change; verify them against official documentation before real calls.

### Roadmap and documentation

Near-term order:

1. complete the Kimi three-paper abstract trial and calibrate the classification/interpretation prompts;
2. add a daily 10–15 paper selection, independent favorites, and 30-day retention for ordinary papers;
3. design a lawful local PDF asset boundary;
4. implement a one-paper reading assistant with evidence locators;
5. build a reproducible and evaluated RAG layer over favorite papers.

Documentation:

- [System design](docs/superpowers/specs/2026-08-27-physics-research-intelligence-design.md)
- [Model connection console design](docs/superpowers/specs/2026-08-31-model-connection-console-design.md)
- [Bilingual README and Kimi trial design](docs/superpowers/specs/2026-09-01-bilingual-readme-kimi-trial-design.md)
- [Local library and AI reading roadmap](docs/superpowers/plans/2026-09-01-local-library-ai-reading-roadmap.md)
- [Personal deployment and operations](docs/operations.md)
- [Human evaluation rubric](docs/evaluation-rubric.md)
