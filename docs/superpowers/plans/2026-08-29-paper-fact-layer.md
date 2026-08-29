# Paper Fact Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可迁移、可测试的论文事实层、保守去重规则和只读论文浏览 API。

**Architecture:** `packages/domain` 提供纯规则与输入契约，`packages/db` 通过 Prisma 7.10 和 PostgreSQL driver adapter 实现持久化，`apps/web` 只通过仓储接口读取事实。DOI 唯一约束负责确定性合并，无 DOI 相似记录只产生候选重复。

**Tech Stack:** TypeScript、Zod、Prisma 7.10、PostgreSQL、`@prisma/adapter-pg`、Vitest、Next.js Route Handlers。

> 本任务遵循用户要求不执行 Git commit；每个任务完成后以测试结果和差异审计作为检查点。

---

### Task 1：领域规范化与标签表

**Files:**
- Create: `packages/domain/src/paper.ts`
- Create: `packages/domain/src/physics-tags.ts`
- Modify: `packages/domain/package.json`
- Test: `tests/domain/paper.test.ts`

- [x] **Step 1：写失败测试**

覆盖 DOI 前缀/大小写、非法 DOI、标题与作者规范化、Jaccard 阈值、作者不一致、日期超过 7 天，以及固定标签包含 `amo-optics`、`condensed-matter-materials`、`high-energy-particle`、`nuclear`、`astrophysics`、`statistical-computational`、`plasma`、`biophysics`、`cross-disciplinary`。

- [x] **Step 2：运行测试并确认红灯**

```powershell
pnpm test tests/domain/paper.test.ts
```

预期：因 `@pri/domain/paper` 与 `@pri/domain/physics-tags` 尚不存在而失败。

- [x] **Step 3：实现最小领域 API**

```ts
export type DuplicateCandidateInput = {
  id: string;
  title: string;
  firstAuthor: string;
  publishedAt: Date;
};

export function normalizeDoi(value: string): string;
export function normalizeTitle(value: string): string;
export function normalizeAuthor(value: string): string;
export function findDuplicateCandidates(
  incoming: Omit<DuplicateCandidateInput, "id">,
  existing: readonly DuplicateCandidateInput[],
): Array<{ id: string; titleSimilarity: number }>;
```

输入 schema 明确定义来源追踪字段、可空 DOI、标题、第一作者、发布日期和公开元数据；候选函数同时满足标题相似度、作者与日期条件。

- [x] **Step 4：运行领域测试**

```powershell
pnpm test tests/domain/paper.test.ts
```

预期：全部通过。

### Task 2：Prisma schema 与客户端工厂

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma.config.ts`
- Create: `packages/db/src/client.ts`
- Generate: `packages/db/src/generated/prisma/`
- Modify: `packages/db/package.json`
- Modify: `packages/db/tsconfig.json`
- Modify: `.gitignore`

- [x] **Step 1：安装稳定且同版本的数据库依赖**

```powershell
pnpm --filter @pri/db add @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg
pnpm --filter @pri/db add -D prisma@7.10.0 @types/pg
```

预期：lockfile 更新，未安装 8.0 候选版本。

- [x] **Step 2：定义 schema**

建立 `Paper`、`PaperSource`、`PhysicsTag`、`PaperClassification`、`PaperInterpretation`、`UserInterest`、`UserPaperState`、`AiRun` 及稳定枚举。关键约束：

```prisma
model Paper {
  id              String        @id @default(uuid()) @db.Uuid
  doi             String?       @unique
  title           String
  normalizedTitle String
  firstAuthor     String?
  publishedAt     DateTime?
  sources         PaperSource[]
  @@index([normalizedTitle])
  @@index([publishedAt])
}

model PaperSource {
  id             String @id @default(uuid()) @db.Uuid
  paperId        String @db.Uuid
  sourceName     String
  sourceRecordId String
  paper          Paper  @relation(fields: [paperId], references: [id], onDelete: Cascade)
  @@unique([sourceName, sourceRecordId])
  @@index([paperId])
}
```

- [x] **Step 3：校验并生成客户端**

```powershell
$env:DATABASE_URL='postgresql://pri:pri-local-only@127.0.0.1:5432/pri?schema=pri_stage1_test'
pnpm --filter @pri/db prisma:validate
pnpm --filter @pri/db prisma:generate
```

预期：schema 有效，客户端生成到 `src/generated/prisma`。

- [x] **Step 4：实现显式客户端工厂**

```ts
export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
```

模块导入不得读取 `process.env` 或创建连接。

### Task 3：迁移与 PostgreSQL 仓储

**Files:**
- Create: `packages/db/prisma/migrations/*/migration.sql`
- Create: `packages/db/src/paper-repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `tests/db/paper-repository.test.ts`

- [x] **Step 1：生成并部署迁移到独立测试 schema**

```powershell
$env:DATABASE_URL='postgresql://pri:pri-local-only@127.0.0.1:5432/pri?schema=pri_stage1_test'
pnpm --filter @pri/db prisma:migrate -- --name paper_fact_layer
```

预期：创建迁移文件并在 `pri_stage1_test` 建表。

- [x] **Step 2：写仓储失败测试**

测试必须断言：等价 DOI 两次写入得到 1 个 `Paper` 和 2 个 `PaperSource`；相同来源记录重放保持幂等；无 DOI 相似记录得到 2 个 `Paper` 且第二次返回第一个候选；列表游标稳定。

- [x] **Step 3：运行测试并确认红灯**

```powershell
$env:TEST_DATABASE_URL='postgresql://pri:pri-local-only@127.0.0.1:5432/pri?schema=pri_stage1_test'
pnpm test tests/db/paper-repository.test.ts
```

预期：因仓储尚未实现而失败。

- [x] **Step 4：实现事务化仓储**

```ts
export interface PaperRepository {
  upsertFromSource(input: PaperSourceInput): Promise<{
    paper: PaperRecord;
    candidateDuplicates: DuplicateCandidate[];
  }>;
  list(input: { limit: number; cursor?: string }): Promise<PaperPage>;
  findByDoi(doi: string): Promise<PaperDetails | null>;
}
```

有 DOI 时在事务中按规范化 DOI upsert `Paper`，再按来源复合键 upsert `PaperSource`。无 DOI 时先查询日期窗口并计算候选，然后创建新 `Paper`，不得采用候选 ID。

- [x] **Step 5：运行迁移与仓储测试**

```powershell
$env:TEST_DATABASE_URL='postgresql://pri:pri-local-only@127.0.0.1:5432/pri?schema=pri_stage1_test'
pnpm test tests/db/paper-repository.test.ts
```

预期：全部通过。

### Task 4：论文浏览 Route Handlers

**Files:**
- Create: `apps/web/src/server/papers.ts`
- Create: `apps/web/src/app/api/papers/route.ts`
- Create: `apps/web/src/app/api/papers/[doi]/route.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Test: `tests/api/papers.test.ts`

- [x] **Step 1：写 API 服务失败测试**

用仓储替身覆盖 `limit` 缺省/越界、非法 DOI、404、成功列表和成功详情；断言响应不包含连接串、内部错误栈或 AI 成本字段。

- [x] **Step 2：运行测试并确认红灯**

```powershell
pnpm test tests/api/papers.test.ts
```

预期：因 paper API 服务尚不存在而失败。

- [x] **Step 3：实现可注入服务与薄 Route Handler**

```ts
export function createPaperApi(repository: PaperRepository) {
  return {
    list(searchParams: URLSearchParams): Promise<ApiResult>,
    detail(rawDoi: string): Promise<ApiResult>,
  };
}
```

Route Handler 只解析 HTTP 请求、创建仓储并映射 `ApiResult`；数据库失败统一返回 503，日志使用现有脱敏函数。

- [x] **Step 4：运行 API 测试**

```powershell
pnpm test tests/api/papers.test.ts
```

预期：全部通过。

### Task 5：阶段验收与文档收尾

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`

- [x] **Step 1：运行完整验证**

```powershell
$env:TEST_DATABASE_URL='postgresql://pri:pri-local-only@127.0.0.1:5432/pri?schema=pri_stage1_test'
pnpm test
pnpm lint
pnpm typecheck
$env:APPDATA = Join-Path ([System.IO.Path]::GetTempPath()) 'pri-next-build-appdata-stage1'
pnpm build
pnpm --filter @pri/db prisma:validate
git diff --check
```

预期：所有命令退出码 0。

- [x] **Step 2：审计安全与范围**

确认没有 `.env`、真实密钥、受限全文、远程配置或自动提交；确认变更只覆盖阶段 0 收尾与阶段 1 文件。

- [x] **Step 3：更新阶段文档**

将阶段 1 标记为 complete，记录测试数量、迁移名称、独立测试 schema、API 路由和任何仍需人工执行的操作；将下一步指向阶段 2 公开来源连接器。
