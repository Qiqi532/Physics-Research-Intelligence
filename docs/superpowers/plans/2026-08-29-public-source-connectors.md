# Public Source Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task in the current isolated worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Crossref、OpenAlex 和 arXiv 三个合规的元数据连接器，支持分页、重试、限流、断点状态和幂等入库。

**Architecture:** 新建 `@pri/sources` 包，通过统一 `SourceConnector` 边界将上游 JSON/Atom 转换为 `PaperSourceInput`。共享 HTTP 层负责超时、有限重试、`Retry-After` 和可见错误码；worker 编排连接器并通过事实层幂等入库，各来源独立记录进度。

**Tech Stack:** TypeScript 5.9、Zod、fast-xml-parser、Prisma 7.10、Vitest 4、Node 22 Fetch API。

---

### Task 1: 统一连接器与 HTTP 边界

**Files:**
- Create: `packages/sources/package.json`, `packages/sources/tsconfig.json`
- Create: `packages/sources/src/types.ts`, `packages/sources/src/http.ts`, `packages/sources/src/index.ts`
- Test: `tests/sources/http.test.ts`

- [x] 写失败测试：429 遵循 `Retry-After`，500 指数退避，400 不重试，超时映射为 `timeout`。
- [x] 定义 `SourceConnector.fetchPage({ from, until, cursor, pageSize, signal })`，返回 `{ records, nextCursor }`。
- [x] 定义 `SourceConnectorError` 及 `rate_limited | upstream_5xx | timeout | malformed_response | invalid_cursor | request_failed` 错误码。
- [x] 实现可注入 `fetch`、`sleep` 和超时的 HTTP 层，最多三次尝试，不记录 URL 中的密钥。
- [x] 运行 `pnpm test tests/sources/http.test.ts`，全部通过。

### Task 2: Crossref 与 OpenAlex 适配器

**Files:**
- Create: `packages/sources/src/crossref.ts`, `packages/sources/src/openalex.ts`
- Test: `tests/sources/crossref.test.ts`, `tests/sources/openalex.test.ts`

- [x] 先写 fixture 测试，覆盖 DOI、空摘要、作者、期刊、日期、许可证、开放状态和下一游标。
- [x] Crossref 使用 `from-created-date`/`until-created-date`、`cursor`、`rows`，可选添加 `mailto`，并将 HTML/JATS 摘要清理为纯文本。
- [x] OpenAlex 使用 `topics.field.id:31`、发表日期窗口、`cursor` 和 `per_page<=100`，从 inverted index 重建摘要。
- [x] OpenAlex key 只通过 Authorization header 传入；无 key 时允许低频 fixture/开发路径。
- [x] 运行两个适配器测试文件，全部通过。

### Task 3: arXiv Atom 适配器与限流

**Files:**
- Create: `packages/sources/src/arxiv.ts`
- Test: `tests/sources/arxiv.test.ts`

- [x] 写 Atom fixture 测试，覆盖无 DOI、多作者、分类、空 journal reference、偏移分页和 XML 异常。
- [x] 用 `fast-xml-parser` 解析 Atom，查询物理相关 arXiv 分类，按 `submittedDate` 升序获取。
- [x] 将偏移序列化为连接器 cursor，根据 `totalResults` 停止；连续请求使用可注入的 3 秒 throttle。
- [x] 运行 `pnpm test tests/sources/arxiv.test.ts`，全部通过。

### Task 4: 来源状态与 worker 入库编排

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/*_source_sync_state/migration.sql`
- Create: `packages/db/src/source-sync-repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/worker/src/jobs/ingest-source.ts`
- Modify: `apps/worker/package.json`, `.env.example`, `packages/domain/src/config.ts`
- Test: `tests/worker/ingest-source.test.ts`, `tests/domain/config.test.ts`

- [x] 新增 `SourceSyncState`：来源名、窗口、cursor、最后成功/失败时间、错误码和错误摘要。
- [x] 用仓储方法原子记录页进度、成功和失败，错误摘要不含凭据。
- [x] `ingestSource` 逐页调用连接器并通过 `PaperRepository.upsertFromSource` 入库，返回页数、记录数与候选重复数。
- [x] `ingestSources` 使用 `Promise.allSettled`隔离各来源失败，一个来源失败不丢弃其他结果。
- [x] 配置可选 `SOURCE_CONTACT_EMAIL` 和 `OPENALEX_API_KEY`，并扩展日志脱敏规则测试。
- [x] 生成 Prisma client，在独立测试 schema 应用迁移，运行 worker/数据库集成测试。

### Task 5: 验证、文档与提交

**Files:**
- Modify: `task_plan.md`, `progress.md`, `findings.md`
- Modify: `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`

- [x] 运行 `pnpm --filter @pri/db prisma:validate`、`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 和 `git diff --check`。
- [x] 检查本地环境文件忽略状态与高风险密钥模式，确认只有 `.env.example` 空占位符进入差异。
- [x] 将阶段 2 标记完成，记录 10 个测试文件、49 个测试和生产构建结果，将下一步指向阶段 3 AI 适配层。
- [x] 使用 Conventional Commits 创建小型本地提交，不配置或推送远程。
