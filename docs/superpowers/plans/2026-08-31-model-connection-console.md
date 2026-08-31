# 模型连接管理台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/settings/models` 提供可保存多个命名连接、加密 API Key、两级模型测试和分类/解读主备热切换的本机管理台。

**Architecture:** PostgreSQL 保存连接元数据与 AES-256-GCM 密文，本机独立主密钥文件由 Web 与 worker 共享。Web 通过严格内部 API 管理和测试连接；worker 在每个新批次开始时解析一次任务级路由快照，继续复用既有 provider adapter、router、预算与审计边界。

**Tech Stack:** TypeScript、Next.js 16 App Router、React 19、Prisma 7/PostgreSQL、Node `crypto`/`fs`、BullMQ、Vitest、Playwright。

---

## 文件结构

- `packages/domain/src/model-settings.ts`：供应商枚举复用、strict 输入 schema、公开 DTO 和限制常量。
- `packages/db/src/model-settings-crypto.ts`：主密钥文件、AES-GCM envelope 和稳定密钥错误。
- `packages/db/src/model-settings-repository.ts`：连接与路由的窄仓储接口；不负责解密。
- `packages/ai/src/connection-provider.ts`：从单个命名连接构造既有 provider。
- `packages/ai/src/connection-test.ts`：固定合成输入、health/sample、安全结果与费用计算。
- `apps/web/src/server/model-settings.ts`：API service、密钥加解密、路由事务和安全错误映射。
- `apps/web/src/server/model-settings-request.ts`：16 KiB JSON、同源与 LAN 写入边界。
- `apps/web/src/server/model-test-gate.ts`：每连接并发锁和 5/60 秒冷却。
- `apps/web/src/app/api/model-connections/**`、`apps/web/src/app/api/model-routing/route.ts`：薄 route handlers。
- `apps/web/src/app/settings/models/**`、`apps/web/src/components/model-settings-*.tsx`：Server Component 页面和最小 Client Component 管理台。
- `apps/worker/src/runtime-ai-config.ts`：持久化路由与环境变量的任务级快照解析。
- `tests/e2e/fixtures/mock-ai-provider.ts`：只在 E2E 启动的 loopback 模型服务。

### Task 0: 建立阶段 8 独立工作树

**Files:**
- Read: `task_plan.md`
- Read: `findings.md`
- Read: `progress.md`

- [x] **Step 1: 确认设计分支干净且提交存在**

Run:

```powershell
git status --short --branch
git log -2 --oneline
git worktree list --porcelain
```

Expected: 只有已经提交的规格与计划；不存在产品源码未提交差异。

- [x] **Step 2: 推送设计与计划提交**

Run:

```powershell
git push origin codex/stage-6-local-trial
```

Expected: 非强制推送成功，不修改其他远端引用。

- [x] **Step 3: 从当前计划提交创建独立分支和 worktree**

Run:

```powershell
git worktree add -b codex/stage-8-model-console "D:\Physics Research Intelligence\.worktrees\stage-8-model-console" HEAD
```

Expected: 新 worktree 位于明确路径，原保存项目目录与 stage-6 worktree 不变。

- [x] **Step 4: 在新 worktree 复核基线**

Run:

```powershell
git status --short --branch
git merge-base --is-ancestor e4ac8db HEAD
```

Expected: `codex/stage-8-model-console` 干净，包含已批准规格。

### Task 1: 领域校验与本机密钥加密

**Files:**
- Create: `packages/domain/src/model-settings.ts`
- Modify: `packages/domain/package.json`
- Create: `packages/db/src/model-settings-crypto.ts`
- Modify: `packages/db/src/index.ts`
- Test: `tests/domain/model-settings.test.ts`
- Test: `tests/db/model-settings-crypto.test.ts`

- [x] **Step 1: 写领域 schema 红灯**

新增测试，固定公开输入边界：

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
expect(parseModelConnectionCreate({
  name: "Kimi 日常",
  provider: "kimi",
  model: "kimi-k3",
  apiKey: testOnlyValue,
  baseUrl: "https://api.moonshot.cn/v1",
  requestTimeoutMs: 45_000,
  inputCostPerMillionUsd: 1,
  outputCostPerMillionUsd: 3,
})).toEqual(expect.objectContaining({ provider: "kimi" }));

expect(() => parseModelConnectionCreate({
  name: "bad",
  provider: "kimi",
  model: "kimi-k3",
  apiKey: testOnlyValue,
  baseUrl: "http://remote.example.test",
  requestTimeoutMs: 45_000,
  inputCostPerMillionUsd: 1,
  outputCostPerMillionUsd: 3,
  extra: true,
})).toThrow();
```

覆盖 16 KiB、50 个连接、名称/模型/Key/URL 长度、HTTPS 或 loopback HTTP、价格和超时范围、更新时空 Key 保留、路由主连接与备用连接字段。

- [x] **Step 2: 运行红灯**

Run: `pnpm test tests/domain/model-settings.test.ts`

Expected: FAIL，`@pri/domain/model-settings` 尚不存在。

- [x] **Step 3: 最小实现领域类型与 strict schema**

实现并导出以下稳定边界：

```ts
export const MAX_MODEL_SETTINGS_REQUEST_BYTES = 16 * 1024;
export const MAX_MODEL_CONNECTIONS = 50;
export type ModelConnectionProvider = AiProviderName;

export type ModelConnectionPublic = {
  id: string;
  name: string;
  provider: ModelConnectionProvider;
  model: string;
  baseUrl: string;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
  hasApiKey: true;
  createdAt: string;
  updatedAt: string;
};

export function parseModelConnectionCreate(value: unknown): ModelConnectionCreateInput;
export function parseModelConnectionUpdate(value: unknown): ModelConnectionUpdateInput;
export function parseModelRoutingUpdate(value: unknown): ModelRoutingUpdateInput;
```

URL refinement 只允许 `https:`，或 hostname 为 `127.0.0.1`、`localhost`、`::1` 的 `http:`。

- [x] **Step 4: 写加密红灯**

使用系统临时目录，不读取真实 Key：

```ts
const cipher = createModelSettingsCipher({ keyFilePath });
const encrypted = await cipher.encrypt({
  profileId: "11111111-1111-4111-8111-111111111111",
  provider: "kimi",
  plaintext: "fixture-secret",
});
expect(Buffer.concat([encrypted.ciphertext, encrypted.nonce, encrypted.authTag])
  .includes(Buffer.from("fixture-secret"))).toBe(false);
await expect(cipher.decrypt({ ...encrypted, profileId, provider: "kimi" }))
  .resolves.toBe("fixture-secret");
```

另测不同 nonce、错误 provider/profile associated data、损坏 tag、缺失主密钥和两个并发首次创建者读取同一 32 字节 key。

- [x] **Step 5: 运行加密红灯**

Run: `pnpm test tests/db/model-settings-crypto.test.ts`

Expected: FAIL，crypto 模块不存在。

- [x] **Step 6: 实现 AES-256-GCM 与独占主密钥文件**

核心类型必须保持明确：

```ts
export type EncryptedModelSecret = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  encryptionVersion: 1;
};

export class ModelSettingsSecretError extends Error {
  constructor(readonly code: "secret_key_unavailable" | "secret_decryption_failed") {
    super(code);
  }
}
```

使用 `open(path, "wx", 0o600)` 创建，`EEXIST` 时重新读取；写入前创建父目录。默认路径通过 `defaultModelSettingsKeyPath()` 按 Windows Local App Data 或 Unix user data 目录计算，测试始终显式传临时路径。

- [x] **Step 7: 运行绿灯与类型检查**

Run:

```powershell
pnpm test tests/domain/model-settings.test.ts tests/db/model-settings-crypto.test.ts
pnpm --filter @pri/domain typecheck
pnpm --filter @pri/db typecheck
```

Expected: 全部 PASS；无明文进入序列化结果。

- [x] **Step 8: 提交**

```powershell
git add packages/domain/src/model-settings.ts packages/domain/package.json packages/db/src/model-settings-crypto.ts packages/db/src/index.ts tests/domain/model-settings.test.ts tests/db/model-settings-crypto.test.ts
git commit -m "feat(ai): add encrypted model setting contracts"
```

### Task 2: Prisma 模型与模型设置仓储

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260831122603_model_connection_console/migration.sql`
- Create: `packages/db/src/model-settings-repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `tests/db/model-settings-repository-unit.test.ts`
- Test: `tests/db/model-settings-repository.test.ts`

- [x] **Step 1: 写仓储红灯**

单元测试固定窄接口，PostgreSQL 测试固定真实约束：

```ts
const first = await repository.create("default", encryptedProfile({
  name: "Kimi 日常", provider: "kimi",
}));
const second = await repository.create("default", encryptedProfile({
  name: "Kimi 实验", provider: "kimi",
}));
expect(await repository.list("default")).toHaveLength(2);

await repository.replaceRouting("default", {
  classifyPrimaryId: first.id,
  classifyFallbackId: null,
  interpretPrimaryId: second.id,
  interpretFallbackId: null,
});
await expect(repository.remove("default", first.id)).rejects
  .toMatchObject({ code: "profile_in_use" });
```

覆盖同名冲突、其他 userId 不可见、Key 轮换只更新密文字段、路由事务和删除顺序。

- [x] **Step 2: 运行红灯**

Run: `pnpm test tests/db/model-settings-repository-unit.test.ts tests/db/model-settings-repository.test.ts`

Expected: FAIL，Prisma model 和 repository 不存在；未配置专用数据库时只有集成文件 SKIP。

- [x] **Step 3: 只追加 Prisma 模型**

在 schema 中增加：

```prisma
model AiConnectionProfile {
  id                       String   @id @default(uuid()) @db.Uuid
  userId                   String   @default("default")
  name                     String
  provider                 String
  model                    String
  baseUrl                  String
  apiKeyCiphertext         Bytes
  apiKeyNonce              Bytes
  apiKeyAuthTag            Bytes
  encryptionVersion        Int      @default(1)
  requestTimeoutMs         Int
  inputCostPerMillionUsd   Decimal  @db.Decimal(12, 6)
  outputCostPerMillionUsd  Decimal  @db.Decimal(12, 6)
  createdAt                DateTime @default(now()) @db.Timestamptz(6)
  updatedAt                DateTime @updatedAt @db.Timestamptz(6)

  classifyPrimaryFor  AiRuntimeRouting[] @relation("ClassifyPrimary")
  classifyFallbackFor AiRuntimeRouting[] @relation("ClassifyFallback")
  interpretPrimaryFor AiRuntimeRouting[] @relation("InterpretPrimary")
  interpretFallbackFor AiRuntimeRouting[] @relation("InterpretFallback")

  @@unique([userId, name])
  @@index([userId, provider])
}

model AiRuntimeRouting {
  userId               String @id @default("default")
  classifyPrimaryId    String? @db.Uuid
  classifyFallbackId   String? @db.Uuid
  interpretPrimaryId   String? @db.Uuid
  interpretFallbackId  String? @db.Uuid
  updatedAt            DateTime @updatedAt @db.Timestamptz(6)
  classifyPrimary  AiConnectionProfile? @relation("ClassifyPrimary", fields: [classifyPrimaryId], references: [id], onDelete: Restrict)
  classifyFallback AiConnectionProfile? @relation("ClassifyFallback", fields: [classifyFallbackId], references: [id], onDelete: Restrict)
  interpretPrimary AiConnectionProfile? @relation("InterpretPrimary", fields: [interpretPrimaryId], references: [id], onDelete: Restrict)
  interpretFallback AiConnectionProfile? @relation("InterpretFallback", fields: [interpretFallbackId], references: [id], onDelete: Restrict)
}
```

迁移 SQL 必须由专用测试 schema 生成并人工核对，只包含新表、唯一约束、索引与外键。

- [x] **Step 4: 实现仓储接口**

```ts
export interface ModelSettingsRepository {
  count(userId: string): Promise<number>;
  list(userId: string): Promise<StoredModelConnection[]>;
  find(userId: string, id: string): Promise<StoredModelConnection | null>;
  create(userId: string, input: StoredModelConnectionWrite): Promise<StoredModelConnection>;
  update(userId: string, id: string, input: StoredModelConnectionWrite): Promise<StoredModelConnection>;
  remove(userId: string, id: string): Promise<void>;
  getRouting(userId: string): Promise<StoredModelRouting | null>;
  replaceRouting(userId: string, input: StoredModelRoutingWrite): Promise<StoredModelRouting>;
}
```

捕获 Prisma 唯一/外键错误并映射为 `profile_name_conflict`、`profile_in_use`、`profile_not_found`，不向上层暴露 SQL 或连接信息。

- [x] **Step 5: generate、迁移与绿灯**

Run:

```powershell
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:validate
if (-not $env:TEST_DATABASE_URL) { throw "Dedicated TEST_DATABASE_URL is required" }
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm --filter @pri/db prisma:deploy
pnpm test tests/db/model-settings-repository-unit.test.ts tests/db/model-settings-repository.test.ts
```

Expected: 新迁移应用于专用 schema；两组测试 PASS，teardown 后两个新表均为 0，迁移历史保留 5 条。

- [x] **Step 6: 提交**

```powershell
git add packages/db/prisma packages/db/src/model-settings-repository.ts packages/db/src/index.ts tests/db/model-settings-repository-unit.test.ts tests/db/model-settings-repository.test.ts
git commit -m "feat(db): store encrypted model connections"
```

### Task 3: 单连接 provider 工厂与两级测试运行器

**Files:**
- Create: `packages/ai/src/connection-provider.ts`
- Create: `packages/ai/src/connection-test.ts`
- Modify: `packages/ai/src/factory.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/ai/package.json`
- Test: `tests/ai/connection-provider.test.ts`
- Test: `tests/ai/connection-test.test.ts`

- [x] **Step 1: 写单连接工厂红灯**

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
const provider = createConnectionProvider({
  provider: "kimi",
  model: "kimi-k3",
  apiKey: testOnlyValue,
  baseUrl: "https://kimi.example.test/v1",
  requestTimeoutMs: 5_000,
  maxOutputTokens: 800,
  fetchImpl,
});
expect(provider).toEqual(expect.objectContaining({ name: "kimi", model: "kimi-k3" }));
expect(JSON.stringify(provider)).not.toContain(testOnlyValue);
```

表驱动覆盖八类 provider，断言仍使用原生 OpenAI/Gemini 和已有 compatible adapters。

- [x] **Step 2: 运行红灯并最小实现**

Run: `pnpm test tests/ai/connection-provider.test.ts`

Expected: FAIL 后新增 `createConnectionProvider`；将 `factory.ts` 的 provider switch 提取复用，不改变 `createConfiguredTaskProviders` 行为。

- [x] **Step 3: 写 health/sample 红灯**

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
await expect(runConnectionHealth(provider)).resolves.toEqual({
  status: "complete",
  provider: "kimi",
  model: "kimi-k3",
  durationMs: 4,
});

const sample = await runConnectionSample({
  classificationProvider,
  interpretationProvider,
  prices: { inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 3 },
});
expect(sample.classification.status).toBe("complete");
expect(sample.interpretation.status).toBe("complete");
expect(JSON.stringify(sample)).not.toContain(testOnlyValue);
```

mock provider 一项失败时另一项仍返回，错误只映射稳定 `AiErrorCode`。固定输入为项目自有合成标题/摘要，结果不持久化。

- [x] **Step 4: 运行红灯并实现测试运行器**

Run: `pnpm test tests/ai/connection-test.test.ts`

Expected: FAIL 后实现；分类与解读用 `Promise.allSettled` 并分别计算 Token 与估算费用，使用保守固定输出上限。

- [x] **Step 5: 全部 AI 定向绿灯与提交**

```powershell
pnpm test tests/ai/connection-provider.test.ts tests/ai/connection-test.test.ts tests/ai/provider-factory.test.ts tests/ai/providers.test.ts
pnpm --filter @pri/ai typecheck
git add packages/ai tests/ai/connection-provider.test.ts tests/ai/connection-test.test.ts
git commit -m "feat(ai): test named model connections"
```

Expected: 无真实网络请求，既有 provider 行为不变。

### Task 4: Web 模型设置 service、请求安全与内部 API

**Files:**
- Create: `apps/web/src/server/model-settings-request.ts`
- Create: `apps/web/src/server/model-test-gate.ts`
- Create: `apps/web/src/server/model-settings.ts`
- Create: `apps/web/src/app/api/model-connections/route.ts`
- Create: `apps/web/src/app/api/model-connections/[id]/route.ts`
- Create: `apps/web/src/app/api/model-connections/[id]/health/route.ts`
- Create: `apps/web/src/app/api/model-connections/[id]/sample/route.ts`
- Create: `apps/web/src/app/api/model-routing/route.ts`
- Modify: `packages/domain/src/config.ts`
- Modify: `.env.example`
- Test: `tests/api/model-settings-request.test.ts`
- Test: `tests/api/model-settings.test.ts`
- Test: `tests/api/model-settings-routes.test.ts`

- [x] **Step 1: 写请求安全红灯**

```ts
expect(validateModelSettingsMutation(new Request("http://127.0.0.1/api", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1" },
}), { lanMode: false })).toEqual({ ok: true });

expect(validateModelSettingsMutation(crossOriginRequest, { lanMode: false }))
  .toEqual({ ok: false, status: 403, errorCode: "settings_origin_rejected" });
expect(validateModelSettingsMutation(localRequest, { lanMode: true }))
  .toEqual({ ok: false, status: 403, errorCode: "settings_local_only" });
```

覆盖缺失/错误 content type、Origin、16 KiB 流式上限和无 body。

- [x] **Step 2: 运行红灯并实现请求工具**

Run: `pnpm test tests/api/model-settings-request.test.ts`

Expected: FAIL 后实现共享 `readBoundedJson` 与 mutation guard；route 不重复读取无限 body。

- [x] **Step 3: 写 API service 红灯**

使用 fake repository、fake cipher、fake provider factory：

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
const created = await api.create(validCreateBody);
expect(created.status).toBe(201);
expect(JSON.stringify(created.body)).not.toContain(testOnlyValue);
expect(repository.create).toHaveBeenCalledWith("default", expect.objectContaining({
  apiKeyCiphertext: expect.any(Uint8Array),
}));

await expect(api.update(profileId, { name: "Kimi 新名", apiKey: "" }))
  .resolves.toMatchObject({ status: 200 });
expect(cipher.encrypt).not.toHaveBeenCalled();
```

覆盖 50 个上限、同名、找不到、删除引用、Key 轮换、主备同供应商拒绝、密文损坏、数据库错误脱敏、health 5 秒与 sample 60 秒冷却、同配置并发 409。

- [x] **Step 4: 实现 service 与测试门**

`createModelSettingsApi` 只依赖窄接口：

```ts
export function createModelSettingsApi(input: {
  repository: ModelSettingsRepository;
  cipher: ModelSettingsCipher;
  createProvider: typeof createConnectionProvider;
  testGate: ModelTestGate;
  logError?: (event: ModelSettingsLogEvent) => void;
}) {
  return { list, create, update, remove, getRouting, updateRouting, health, sample };
}
```

所有成功响应通过 `toPublicConnection` 投影，禁止扩展运算符把存储行直接返回。

- [x] **Step 5: 写薄 route 红灯并实现**

route 测试直接调用导出的 GET/POST/PATCH/DELETE，注入的 service 层测试处理业务。生产 handler 只负责安全 guard、bounded JSON、路径 ID 和 `Response.json`。

Run: `pnpm test tests/api/model-settings.test.ts tests/api/model-settings-routes.test.ts`

Expected: 初始 FAIL；实现所有路由后 PASS。

- [x] **Step 6: 配置边界**

`ServerConfig` 新增可选 `AI_SETTINGS_MASTER_KEY_FILE`，只解析非空路径，不读取内容；`.env.example` 只增加空变量名和说明。不得增加真实路径或 Key 示例。

- [x] **Step 7: 定向绿灯、类型检查与提交**

```powershell
pnpm test tests/api/model-settings-request.test.ts tests/api/model-settings.test.ts tests/api/model-settings-routes.test.ts tests/domain/config.test.ts
pnpm --filter @pri/web typecheck
pnpm --filter @pri/web lint
git add apps/web/src/server apps/web/src/app/api/model-connections apps/web/src/app/api/model-routing packages/domain/src/config.ts .env.example tests/api
git commit -m "feat(web): add secure model connection API"
```

### Task 5: Worker 任务级快照与无需重启热切换

**Files:**
- Create: `apps/worker/src/runtime-ai-config.ts`
- Modify: `apps/worker/src/configured-daily-processor.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/web/scripts/start-web.mjs`
- Test: `tests/worker/runtime-ai-config.test.ts`
- Test: `tests/worker/configured-daily-processor.test.ts`
- Test: `tests/docs/local-trial.test.ts`

- [ ] **Step 1: 写任务级快照红灯**

类型必须允许分类和解读使用同一供应商的不同连接：

```ts
const snapshot = await resolver.resolve();
expect(snapshot.classify.primary).toMatchObject({
  profileId: "kimi-a", provider: "kimi", model: "kimi-classifier",
});
expect(snapshot.interpret.primary).toMatchObject({
  profileId: "kimi-b", provider: "kimi", model: "kimi-interpreter",
});
```

测试持久化路由优先、无路由时环境变量适配、路由存在但不完整/密文损坏时稳定失败且不回退环境变量。

- [ ] **Step 2: 运行红灯**

Run: `pnpm test tests/worker/runtime-ai-config.test.ts`

Expected: FAIL，resolver 模块不存在。

- [ ] **Step 3: 实现任务级 snapshot**

```ts
export type ResolvedAiConnection = {
  profileId?: string;
  name: string;
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

export type RuntimeAiSnapshot = {
  source: "persisted" | "environment";
  classify: { primary: ResolvedAiConnection; fallback?: ResolvedAiConnection; maxOutputTokens: number };
  interpret: { primary: ResolvedAiConnection; fallback?: ResolvedAiConnection; maxOutputTokens: number };
};

export interface RuntimeAiConfigResolver {
  resolve(): Promise<RuntimeAiSnapshot>;
}
```

环境适配必须按 task selection 分别复制 provider config，不能先合并为供应商键控 Map。

- [ ] **Step 4: 写批次热切换红灯**

```ts
const resolver = {
  resolve: vi.fn()
    .mockResolvedValueOnce(snapshot("model-a"))
    .mockResolvedValueOnce(snapshot("model-b")),
};
const processor = createConfiguredDailyProcessor(config, { resolver, createProvider });
await processor.process();
await processor.process();
expect(resolver.resolve).toHaveBeenCalledTimes(2);
expect(createProvider.mock.calls.map(([value]) => value.model))
  .toEqual(expect.arrayContaining(["model-a", "model-b"]));
```

单次 `process()` 中多个论文必须共享第一次 resolve 的 provider 对象。

- [ ] **Step 5: 改造 daily processor**

将 provider、prices 构造移动到 `process()` 开头；数据库、source connector 和 queue 生命周期仍在 worker 启动时创建。没有持久化路由且没有环境 AI 时，在批次开始返回稳定 `worker_ai_configuration_missing`，而不是启动 Web 时失败。

- [ ] **Step 6: 固定 LAN 进程标记**

在启动器 hostname 计算后增加：

```js
process.env.PRI_LAN_MODE = lan ? "true" : "false";
```

文档测试断言默认 start 为 false，`start:lan` 为 true；数据库与 Redis 绑定不变。

- [ ] **Step 7: 绿灯、回归与提交**

```powershell
pnpm test tests/worker/runtime-ai-config.test.ts tests/worker/configured-daily-processor.test.ts tests/worker/daily-pipeline.test.ts tests/docs/local-trial.test.ts
pnpm --filter @pri/worker typecheck
pnpm --filter @pri/web typecheck
git add apps/worker/src apps/web/scripts/start-web.mjs tests/worker tests/docs/local-trial.test.ts
git commit -m "feat(worker): reload model routing per batch"
```

### Task 6: `/settings/models` 管理台页面

**Files:**
- Create: `apps/web/src/app/settings/models/page.tsx`
- Create: `apps/web/src/app/settings/models/loading.tsx`
- Create: `apps/web/src/components/model-settings-page-view.tsx`
- Create: `apps/web/src/components/model-settings-console.tsx`
- Create: `apps/web/src/components/model-connection-form.tsx`
- Create: `apps/web/src/components/model-routing-form.tsx`
- Create: `apps/web/src/components/model-test-result.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page.tsx`
- Test: `tests/web/model-settings-components.test.tsx`
- Test: `tests/web/model-settings-helpers.test.ts`

- [ ] **Step 1: 写 Server Component/公开 props 红灯**

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
const html = renderToStaticMarkup(<ModelSettingsPageView state={{
  kind: "ready",
  connections: [publicConnection({ name: "Kimi 日常" })],
  routing: emptyRouting(),
  managementEnabled: true,
}} />);
expect(html).toContain("Kimi 日常");
expect(html).toContain("已安全保存");
expect(html).not.toContain(testOnlyValue);
```

覆盖 loading、数据库错误、空连接、LAN 只读和密钥存储不可用状态。

- [ ] **Step 2: 运行红灯并实现页面骨架**

Run: `pnpm test tests/web/model-settings-components.test.tsx`

Expected: FAIL 后实现 Server Component 页面、skip link、返回 Today 链接和管理台两栏；只向 Client Component 传公开 DTO。

- [ ] **Step 3: 写纯客户端 helper 红灯**

```ts
const testOnlyValue = ["test", "only", "value"].join("-");
expect(connectionPayload(formWithBlankKey())).not.toHaveProperty("apiKey");
expect(connectionPayload(formWithNewKey())).toMatchObject({ apiKey: testOnlyValue });
expect(routingPayload(draft)).toEqual({
  classifyPrimaryId: "kimi-a",
  classifyFallbackId: "glm-a",
  interpretPrimaryId: "kimi-b",
  interpretFallbackId: null,
});
```

覆盖 provider preset 切换、复制时清空 Key、取消编辑恢复、主备同供应商前端提示和响应错误映射。

- [ ] **Step 4: 实现最小 Client Components**

- `model-settings-console.tsx` 只管理选中 ID、筛选和组合子表单。
- `model-connection-form.tsx` 负责新建/修改/复制/删除、空 Key 保留与高级设置。
- `model-routing-form.tsx` 负责四个路由 select，保存成功后 `router.refresh()`。
- `model-test-result.tsx` 负责 health/sample 的 pending、成功、部分成功、费用确认和安全错误。
- 所有异步状态使用 `aria-live`，按钮 pending 时 disabled；删除、轮换 Key 和付费示例用明确确认对话框。

- [ ] **Step 5: 增加现有视觉风格与响应式 CSS**

新增 `.model-settings-grid` 的桌面 `minmax(16rem, 22rem) minmax(0, 1fr)` 双栏；42rem 以下单栏。复用 `--paper`、`--line`、`--accent`、按钮和 focus-visible，不重构无关样式。

- [ ] **Step 6: 页面定向验证与提交**

```powershell
pnpm test tests/web/model-settings-components.test.tsx tests/web/model-settings-helpers.test.ts tests/web/components.test.ts
pnpm --filter @pri/web typecheck
pnpm --filter @pri/web lint
git add apps/web/src/app/settings/models apps/web/src/components/model-* apps/web/src/app/globals.css apps/web/src/app/page.tsx tests/web
git commit -m "feat(web): add model connection console"
```

### Task 7: 正式 Playwright 模型管理台边界

**Files:**
- Create: `tests/e2e/model-settings.spec.ts`
- Create: `tests/e2e/fixtures/mock-ai-provider.ts`
- Modify: `tests/e2e/fixtures/database.ts`
- Modify: `tests/e2e/fixtures/global-setup.ts`
- Modify: `tests/e2e/fixtures/global-teardown.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: 写 E2E 红灯**

新增桌面与移动共享用例：

```ts
test("manages named connections and switches routing", async ({ page }) => {
  await page.goto("/settings/models");
  await createConnection(page, { name: "Kimi 分类", provider: "kimi" });
  await createConnection(page, { name: "Kimi 解读", provider: "kimi" });
  await createConnection(page, { name: "GLM 备用", provider: "glm" });
  await page.getByRole("button", { name: "检查连接" }).click();
  await expect(page.getByText("连接检查通过")).toBeVisible();
  await page.getByRole("button", { name: "运行示例" }).click();
  await confirmPaidSample(page);
  await expect(page.getByText("示例分类完成")).toBeVisible();
  await saveRoutes(page, {
    classifyPrimary: "Kimi 分类",
    classifyFallback: "GLM 备用",
    interpretPrimary: "Kimi 解读",
  });
});
```

另覆盖空状态、空 Key 编辑保留、复制后必须重新填 Key、轮换、引用删除保护、鉴权失败、冷却、键盘焦点、可访问名称和窄屏无横向溢出。

- [ ] **Step 2: 运行红灯**

Run: `pnpm test:e2e tests/e2e/model-settings.spec.ts --project=desktop-chromium`

Expected: FAIL，页面/API/mock provider 尚未接入 E2E。

- [ ] **Step 3: 实现 loopback mock provider**

`mock-ai-provider.ts` 仅监听 `127.0.0.1:3211`：

- `GET /models/:model` 对普通 fixture Key 返回 200，对 `auth-fail` 返回 401。
- `POST /chat/completions` 根据 system prompt 返回符合既有 classification/interpretation schema 的 JSON 字符串和固定 usage。
- 其他路径返回 404；不得代理任何外部网络。

在 `playwright.config.ts` 增加第二个 webServer，并给 Web 进程设置指向系统临时目录的 `AI_SETTINGS_MASTER_KEY_FILE`、`PRI_LAN_MODE=false`。测试配置的 base URL 只允许 `http://127.0.0.1:3211`。

- [ ] **Step 4: 扩展 fixture 清理**

在重置和 teardown 中先删除 `AiRuntimeRouting`，再删除 `AiConnectionProfile`；删除系统临时目录中的 E2E 主密钥文件。保留 `_prisma_migrations` 和 PhysicsTag 种子。

- [ ] **Step 5: 桌面与移动绿灯**

```powershell
pnpm test:e2e tests/e2e/model-settings.spec.ts --project=desktop-chromium
pnpm test:e2e tests/e2e/model-settings.spec.ts --project=mobile-chromium
pnpm test:e2e
```

Expected: 全部 PASS；mock provider 日志无外部请求，teardown 后模型配置表和既有业务表均为 0。

- [ ] **Step 6: 提交**

```powershell
git add tests/e2e playwright.config.ts
git commit -m "test(e2e): cover model connection console"
```

### Task 8: 运维、全量验证、本地审查与发布

**Files:**
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`
- Modify: `docs/superpowers/plans/2026-08-31-model-connection-console.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Test: `tests/docs/operations.test.ts`

- [ ] **Step 1: 写运维文档红灯**

断言文档包含：localhost 页面配置、LAN 只读、`AI_SETTINGS_MASTER_KEY_FILE` 空示例、数据库与主密钥分离备份、恢复顺序、主密钥丢失后的重新填 Key、worker 热切换和无真实 Key 日志。

Run: `pnpm test tests/docs/operations.test.ts`

Expected: FAIL，文档尚未覆盖新边界。

- [ ] **Step 2: 最小更新运维文档**

说明个人本机无需手写 provider `.env`；首次页面保存自动创建主密钥。部署 Web/worker 时必须共享只读/读写适当的主密钥 volume。备份命令不得输出 key 内容，恢复验证只检查文件存在、权限和一次页面连通测试。

- [ ] **Step 3: 完整自动验证**

使用专用 PostgreSQL 测试 schema 和 mock provider：

```powershell
pnpm test
pnpm test:e2e
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:validate
pnpm --filter @pri/db exec prisma migrate status --config prisma.config.ts
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 全部退出 0；Web standalone 静态资源存在，worker `dist/index.js` 存在。

- [ ] **Step 4: 数据与敏感信息门禁**

- 专用单元/集成/E2E schema 的两个新表和既有业务表计数为 0；迁移历史为 5。
- 删除 `.next`、`dist`、Playwright 输出、截图、`*.tsbuildinfo` 和临时 E2E key；保留忽略的论文 PDF 与既有备份。
- 只暂存本阶段文件；扫描 staged diff 中 `.env`、Key 值、密文、主密钥、连接串、PDF、dump 和构建产物。

- [ ] **Step 5: 本地代码审查**

审查完整 stage diff：AES nonce/tag、associated data、并发首次创建、Key 生命周期、DTO 投影、同源/LAN 绕过、请求上限、测试费用重复点击、跨任务同供应商配置、批次快照、损坏持久化配置不静默回退、数据库 teardown。严重或警告发现必须先加红灯再修复。

- [ ] **Step 6: 本地浏览器验收**

用 loopback mock provider 验证桌面和窄屏：新建两个 Kimi 命名连接、GLM 备用、Key 轮换、health、sample、主备路由、删除保护、空/错误状态和键盘焦点。随后使用 `pri_stage7_trial` 启动真实事实页面；不在自动流程输入真实 Key。

- [ ] **Step 7: 更新记录并提交**

```powershell
git add README.md docs task_plan.md findings.md progress.md tests/docs/operations.test.ts
git commit -m "docs(ops): document model secret recovery"
```

计划、进度和 MVP 只标记实际完成项；真实 provider 验证与 30 篇人工评审保持人工任务。

- [ ] **Step 8: 推送阶段分支，不合并其他分支**

Run:

```powershell
git push -u origin codex/stage-8-model-console
```

Expected: 分支发布供审查；不 force-push、不修改 main、不删除其他 worktree。

## 计划自审

- **规格覆盖：** 加密、多命名、同供应商跨任务、主备限制、两级测试、LAN、本地恢复、环境回退、热切换、管理台、E2E 和人工真实 Key 验证均映射到 Task 1–8。
- **边界一致：** 数据库存密文，仓储不解密；Web service 和 worker resolver 使用同一 cipher；AI 包只收到单连接明文快照且不序列化 Key。
- **类型一致：** `ModelConnectionProvider` 复用现有 `AiProviderName`；持久化与环境配置都转换为 `RuntimeAiSnapshot`，不使用会覆盖同供应商多配置的全局 provider Map。
- **测试隔离：** 单元使用 fake cipher/fetch，集成使用专用 schema，E2E 只连接 loopback mock provider 和系统临时 key 文件。
- **无占位实现：** 每个新增模块均有明确路径、导出类型、失败断言、绿灯命令和提交点。
