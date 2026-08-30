# Stage 5 Product Completion, Reliability, and Deployment Plan

> **For agentic workers:** Implement inline in this task. Every behavior change must follow red test -> minimal green -> local simplification, with commands and outcomes recorded in `progress.md`. Create one final commit only.

**Goal:** 补齐兴趣设置和正式浏览器 E2E，使公开事实采集、AI 分类与 Today 准备可每日自动幂等运行，并交付安全健康检查、恢复机制和个人部署文档。

**Architecture:** 延续 Route Handler -> 可注入服务 -> `@pri/db` 窄仓储边界；推荐仍由 `@pri/recommendation` 的确定性纯函数完成。worker 新增 BullMQ 队列、可注入日计划器和独立执行器，以稳定 job id 串联采集与分类；健康检查只返回枚举状态和稳定错误码。Playwright 只使用专用 PostgreSQL schema、fixture provider/queue 和本地 Web，不访问生产数据库或真实外部 API。

**Tech Stack:** TypeScript ESM、Next.js 16、React 19、Prisma 7.10、PostgreSQL、Redis、BullMQ、Zod、Vitest、Playwright、Docker Compose。

---

## File map

- Create `packages/db/src/interest-repository.ts`; modify `packages/db/src/index.ts`: 标签/兴趣读取、事务式全量替换与默认恢复。
- Create `apps/web/src/server/interests.ts`, `apps/web/src/app/api/interests/route.ts`, `apps/web/src/app/settings/interests/page.tsx`, `apps/web/src/components/interest-settings-form.tsx`; modify navigation and focused CSS only.
- Create `apps/worker/src/queue.ts`, `scheduler.ts`, `daily-pipeline.ts`, `worker-runtime.ts`, `logging.ts`; modify `apps/worker/src/index.ts` and package/config boundaries.
- Create health service/routes under `apps/web/src/server/health.ts` and `apps/web/src/app/api/health/{live,ready}/route.ts`.
- Create `playwright.config.ts`, `tests/e2e/fixtures/*`, `tests/e2e/*.spec.ts`, and dedicated setup/cleanup scripts; keep reports and screenshots ignored.
- Create `docs/operations.md`, `docs/evaluation-rubric.md`; modify `.env.example`, Compose, root scripts, planning records, and MVP completion status.

### Task 1: Interest repository and strict API

- [ ] Write failing unit/PostgreSQL tests for all tags, stored weights, empty interests, replace/cancel/default behavior, unknown/duplicate tags, non-finite/out-of-range weights, extra fields, and oversized payloads.
- [ ] Run targeted tests and record the expected missing-module/behavior red.
- [ ] Implement a repository that reads `PhysicsTag` and `UserInterest`, replaces one user's interests transactionally, and never creates tags or users.
- [ ] Implement strict Zod request parsing and safe 400/413/503 responses; update `@pri/db` exports.
- [ ] Re-run targeted tests green and typecheck affected packages.

### Task 2: Interest settings UI and recommendation refresh

- [ ] Write failing component/source tests for loading, saving, success, error, no-tag, keyboard labels, cancel and restore-default states.
- [ ] Implement `/settings/interests` as a Server Component and a minimal client form with explicit 0-2 weights, remove/cancel/default actions, `aria-live`, and `router.refresh()` after save.
- [ ] Add a settings navigation link and responsive styles consistent with the existing palette; do not refactor the design system.
- [ ] Prove through repository/API tests that saved weights alter Today order and recommendation reasons immediately.

### Task 3: Daily BullMQ pipeline and idempotency

- [ ] Write failing fake-timer/mock-queue tests for configured timezone/time/switch, one schedule per window, stable job ids, duplicate dispatch, restart recovery, and ordered collect -> classify -> Today preparation.
- [ ] Add BullMQ and Redis client dependencies; extend `ServerConfig` with explicit safe scheduler/queue/worker settings.
- [ ] Implement pure daily-window calculation and stable queue names/job ids; enqueue source jobs and a coordinator without waiting for wall-clock time in tests.
- [ ] Implement worker processors that reuse `ingestSource`, `classifyPaper`, and existing public-fact repository boundaries; Today preparation performs no model call and stores no duplicate business data.
- [ ] Preserve source cursor recovery, classification idempotency, interpretation budget/idempotency, and main/fallback rules.

### Task 4: Health, structured logs, and recovery

- [ ] Write failing tests for liveness, PostgreSQL/Redis/queue readiness, stale worker heartbeat, dependency exceptions, and response redaction.
- [ ] Implement `/api/health/live` and `/api/health/ready`; return only status, stable component codes, and timestamps, never URLs, secrets, stacks, queue payloads, or config.
- [ ] Add structured logger helpers with stable event names/status/error codes and existing `toLogSafeData` sanitization.
- [ ] Add regression tests for source timeout/429/5xx bounded retry, provider rate limit/fallback, budget exhaustion, Redis reconnect/backoff, queue failure, and Today recoverable error rendering.

### Task 5: Formal Playwright boundary

- [ ] Add Playwright dependency/config and failing smoke tests before fixtures exist.
- [ ] Build setup that requires `TEST_DATABASE_URL`, rejects `public`, uses a dedicated stage-5 schema, applies existing migrations, seeds deterministic tags/papers/classifications/interpretations/states, and cleans business rows after the run.
- [ ] Stub all source/provider/queue boundaries; forbid unexpected external network requests.
- [ ] Cover Today stats/cross-signals/reasons/queue, cold and interested ranking, interest refresh, bilingual detail/evidence/confidence/source disclosure/abstract-only, all reading states, empty/missing/corrupt/database-error states, desktop/mobile, keyboard/focus/accessibility names.
- [ ] Configure artifacts for failure-only diagnostics and clean all generated output after verification.

### Task 6: Operations, backup, and evaluation preparation

- [ ] Write `docs/operations.md` for PostgreSQL, Redis, Web, worker, safe environment variables, migrations, start/stop, daily jobs, budgets, source failures, backlog, bounded recovery, standalone assets, backup/restore/verification, and manual cloud/account steps.
- [ ] Update `.env.example` with names and safe non-secret examples only; never add real credentials.
- [ ] Create `docs/evaluation-rubric.md` with the six required dimensions and at least 30 blank cross-domain paper rows; explicitly leave scores and review notes for humans.
- [ ] Add static tests for required operational/rubric content and standalone asset copying.

### Task 7: Local review and full verification

- [ ] Apply `simplify` only to stage-5 changes and run targeted tests again.
- [ ] Apply `code-review`; fix every severe and warning finding with a red-green regression when behavior changes.
- [ ] Run full unit/PostgreSQL tests, Playwright, Prisma generate/validate/migration status, lint, typecheck, Web/worker production builds, and desktop/mobile browser verification.
- [ ] Verify interest/read states, empty/error/recovery paths, `git diff --check`, sensitive staged content, ignored artifacts, test-schema business-row cleanup, standalone static assets, and final Git status.
- [ ] Update all planning records and MVP status, stage only stage-5 source/tests/docs, create one accurate Conventional Commit, do not push.

## Completion conditions

- Repeating the same daily window cannot duplicate source facts, classification model calls, or queue work; deep interpretation remains budgeted and idempotent.
- Health responses and structured logs contain no secrets, connection strings, stacks, raw provider data, or restricted content.
- Formal E2E never connects to `public`/production data or real paper/AI providers and cleans all fixture business rows.
- Interest changes deterministically alter Today order/reasons while cold start and all degraded states remain usable.
- Deployment and 30-paper evaluation are prepared but no cloud resource or fictional human score is created.
