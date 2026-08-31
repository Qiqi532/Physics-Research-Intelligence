# AI Classification and Interpretation Implementation Plan

> **For agentic workers:** Implement inline in this task. Keep every behavior change in a red → minimal green → local refactor cycle and record the exact command/output in progress.md.

**Goal:** 为公开论文事实建立严格、可追溯、可配置且受预算约束的 AI 分类与中文结构化解读流水线。

**Architecture:** @pri/ai 提供无数据库依赖的 schema、prompt、provider、HTTP adapter 与一次回退 router。@pri/db 以唯一 AiRun 表示逻辑幂等任务和并发 claim，以 AiRunAttempt 逐次审计主备物理调用；worker 只读取安全论文事实，并通过窄仓储接口协调 claim、预算和结果持久化。

**Tech Stack:** TypeScript ESM、Zod、Vitest、Prisma 7.10.0、PostgreSQL、原生 fetch/AbortController、Node crypto。

---

## File map

- Create packages/ai/package.json and tsconfig.json: workspace 包与类型检查。
- Create packages/ai/src/schemas.ts: strict 分类/解读 schema、证据等级和 provider JSON 解析。
- Create packages/ai/src/provider.ts: AiProvider contract、输入、usage、结果和规范化错误码。
- Create packages/ai/src/prompts/classify.ts and interpret.ts: 版本化、确定性、安全 prompt。
- Create packages/ai/src/errors.ts and http.ts: 单次请求超时、HTTP/网络错误映射和脱敏错误。
- Create packages/ai/src/providers/openai-compatible.ts and four provider files: 独立真实 provider adapter。
- Create packages/ai/src/router.ts, mock-provider.ts and index.ts: 一次回退、测试替身与公开导出。
- Modify packages/domain/src/config.ts, .env.example and config tests: 服务端 AI 路由、模型、base URL、超时、token 上限和单价。
- Modify Prisma schema; create a new stage 3 migration: AiRun 完成字段和 AiRunAttempt。
- Create packages/db/src/ai-repository.ts and tests: claim、审计、结果与预算仓储。
- Create apps/worker/src/jobs/classify-paper.ts and interpret-paper.ts with worker tests。
- Modify task_plan.md, progress.md, findings.md and MVP Task 4 with final evidence。

### Task 1: Strict output schemas

- [x] Create tests/ai/schemas.test.ts for valid output, unknown fields, invalid tag/evidence enum, empty evidence references, missing abstract-basis disclosure and unsupported claimed access.
- [x] Run pnpm test tests/ai/schemas.test.ts; module-not-found red recorded.
- [x] Implement strict Zod schemas. Classification fields: tags, relevance, reason, crossDisciplinary. Interpretation fields: basis, overviewZh, researchQuestion, innovations, methodsAndEvidence, limitations, readingAdvice. Every claim item contains text, evidenceLevel and evidenceReferences.
- [x] Parse raw JSON separately so malformed JSON maps to invalid_json and Zod failures map to schema_invalid (Task 2 provider boundary).
- [x] Re-run the exact test; 9 tests green.

### Task 2: Prompts and provider contract

- [x] Create prompt tests for deterministic versions, allowed facts only, explicit JSON, abstract-only basis, no restricted-fulltext claim, evidence rules and all nine physics tag slugs.
- [x] Create a reusable contract suite against MockAiProvider for normal results, invalid JSON/schema, network, timeout, 429, 5xx, permanent 4xx, legal uncertain, usage and duration.
- [x] Run both files and capture red.
- [x] Implement minimal contract, prompt builders and configurable mock scenarios without database or worker imports.
- [x] Re-run both files; 14 tests green and @pri/ai typecheck passed.

### Task 3: Normalized errors, router and one fallback

- [x] Create table-driven router tests proving fallback only for network_error, timeout, rate_limited and upstream_5xx, with two calls maximum.
- [x] Add negative cases for uncertain, insufficient_input, invalid_json, schema_invalid, authentication, permanent_4xx, configuration, budget_exceeded and business_validation.
- [x] Run router tests and capture red.
- [x] Implement AiProviderError with stable code and retryableForFallback; never inspect message text.
- [x] Implement task router returning ordered attempts and final parsed output; 14 tests green.

### Task 4: Real provider HTTP adapters

- [x] Create mock-fetch tests for headers, endpoint path, model, JSON mode/schema, response extraction, usage, timeout, 429, 5xx, auth, permanent 4xx, malformed envelopes and refusal/no-candidate.
- [x] Run provider tests and capture red; no test accessed network.
- [x] Implement a one-attempt HTTP boundary using AbortController. Errors contain provider/status/code but never headers, request body, raw response or key.
- [x] Implement OpenAI Responses, Gemini generateContent and shared DeepSeek/Qwen compatible protocol behind independent constructors.
- [x] Re-run provider tests; 14 provider tests green, 23 with schema regression.

### Task 5: Server configuration and cost estimates

- [x] Add failing config tests for provider enums, distinct primary/fallback, enabled provider model/base URL/key, timeout/token limits, nonnegative prices and secret redaction.
- [x] Add failing cost tests for input/output/total tokens and six-decimal USD values.
- [x] Add task primary/fallback provider and model variables, provider base URLs, timeout, output token limits and per-million prices to .env.example with empty placeholders.
- [x] Implement server-only parsing and pure cost estimation; no provider config may enter frontend code.
- [x] Run targeted tests green.

### Task 6: Prisma audit model and AI repository

- [x] Create database tests for logical claim idempotency, concurrent duplicate claim, successful lookup, primary/fallback attempts, aggregate tokens/cost, failure, classification, interpretation and UTC daily cost.
- [x] Run the targeted DB test before implementation; it may only use TEST_DATABASE_URL and the dedicated schema.
- [x] Add totalTokens, completedAt and reservedCostUsd to AiRun. Add AiRunAttempt with ordinal, provider, model, tokens, duration, status, error, cost and completedAt; unique on aiRunId plus ordinal.
- [x] Create a new migration only and retain unique AiRun.idempotencyKey as the concurrency claim.
- [x] Implement repository create-or-atomic-status-transition claim, safe paper selection, attempts, completion, result transactions and UTC range sum.
- [x] Generate Prisma client, deploy only to pri_stage3_test and run DB tests green.

### Task 7: Budget reservation

- [x] Add unit tests for below/equal/above budget, UTC midnight, classification bypass and zero provider calls.
- [x] Add a DB concurrency test where two reservations exceed budget together; exactly one may claim.
- [x] Implement transaction-scoped PostgreSQL advisory locking keyed by UTC date, summing actual interpretation cost plus active reservation.
- [x] On rejection set logical run SKIPPED_BUDGET with budget_exceeded and no AiRunAttempt.
- [x] Replace reservation with aggregate actual cost at completion; run tests green.

### Task 8: classify-paper worker

- [x] Add tests for safe fact selection, stable SHA-256 input hash/key, multi-tag persistence, fallback audit, invalid output without fallback, legal uncertain, duplicate success without provider call and isolated failure.
- [x] Run targeted worker test and capture red.
- [x] Implement injected repository/router job: claim before provider and pass only title, abstract, journal and publishedAt.
- [x] Persist classifications and logical/attempt audit; return complete, duplicate, in_progress or failed.
- [x] Re-run targeted tests green.

### Task 9: interpret-paper worker

- [x] Add tests for abstract-only success, idempotency before budget, exhausted budget before provider, classification unaffected, fallback audit, restricted boundary and paper fact preservation.
- [x] Run targeted worker test and capture red.
- [x] Implement order: safe paper, successful idempotency, estimate/reserve UTC budget, claim, route, persist interpretation/audit.
- [x] Return budget_exceeded/skipped without main or fallback calls; run tests green.

### Task 10: Simplification, docs, verification and commit

- [x] Apply simplify review only to recent code: remove unused public aliases and avoid unrelated refactors.
- [x] Re-run all targeted stage 3 tests: 13 files and 90 tests passed, including 7 PostgreSQL repository tests.
- [x] Update task_plan.md, progress.md, findings.md and MVP Task 4 with modules, fallback, evidence, audit, budget, test commands/counts, no-real-API fact and risks.
- [x] Run fresh full verification: 23 files/141 tests; Prisma generate/validate/migration status; lint; typecheck; Web/worker build; diff check and secret scan all passed.
- [x] Inspect diff/staged diff: no .env, credentials, test DB data, build output or unrelated files were staged.
- [x] Stage only stage 3 files and create one Conventional Commit based on the actual diff; do not push.

## Completion conditions

- No real model request is made.
- No secret, Authorization value, raw provider response or restricted full text is persisted, logged or committed.
- Each physical provider attempt is separately auditable.
- A duplicate successful logical key cannot call a provider again.
- Budget equality blocks interpretation at the UTC boundary while classification remains available.
- Every completion claim is backed by a fresh command with exit code 0.
