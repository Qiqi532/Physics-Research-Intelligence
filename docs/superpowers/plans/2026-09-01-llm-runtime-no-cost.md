# LLM Runtime Without Local Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all monetary cost and budget behavior while retaining only provider-reported token usage and reliable OpenAI-compatible responses.

**Architecture:** Replace interpretation budget reservation with the existing idempotent run claim. Remove price fields through domain, persistence, worker, Web, tests, and documentation. Make provider usage optional and persist null when the upstream response omits usage.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, Next.js, Vitest.

---

### Task 1: Make usage truthful and optional

**Files:**
- Modify: `packages/ai/src/provider.ts`
- Modify: `packages/ai/src/providers/openai-compatible.ts`
- Modify: `packages/ai/src/providers/gemini.ts`
- Test: `tests/ai/providers.test.ts`
- Test: `tests/ai/provider-contract.test.ts`

- [ ] Add tests where a successful provider response omits `usage` and expect the typed result to omit usage rather than synthesize zero tokens.
- [ ] Change `AiProviderResult.usage` to optional and parse numeric upstream usage only when all required counters are present.
- [ ] Keep Kimi K2.6 request-only adaptations scoped to Kimi K2.6; keep the shared response parser tolerant of optional usage and supported content wrappers.
- [ ] Run `pnpm exec vitest run tests/ai/providers.test.ts tests/ai/provider-contract.test.ts` and expect all tests to pass.

### Task 2: Remove cost utilities and budget errors

**Files:**
- Delete: `packages/ai/src/cost.ts`
- Delete: `packages/ai/src/budget.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/ai/src/errors.ts`
- Delete: `tests/ai/cost.test.ts`
- Delete: `tests/ai/budget.test.ts`
- Modify: `tests/ai/provider-contract.test.ts`

- [ ] Remove cost/budget exports and the `budget_exceeded` error code.
- [ ] Run `rg -n "estimateCost|estimateMaximumCost|canReserveBudget|toBudgetMicroUsd|budget_exceeded" packages apps tests` and expect only historical migration text, if any.
- [ ] Run the AI unit test suite and expect all tests to pass.

### Task 3: Simplify audit persistence and migrate the database

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260901_remove_ai_cost_tracking/migration.sql`
- Modify: `packages/db/src/ai-repository.ts`
- Modify: `apps/worker/src/jobs/ai-job.ts`
- Modify: `apps/worker/src/jobs/classify-paper.ts`
- Modify: `apps/worker/src/jobs/interpret-paper.ts`
- Test: `tests/db/ai-repository-unit.test.ts`
- Test: `tests/db/ai-repository.test.ts`
- Test: `tests/worker/classify-paper.test.ts`
- Test: `tests/worker/interpret-paper.test.ts`

- [ ] Write failing tests proving interpretation calls `claimRun`, missing usage persists null, and no cost property exists on attempt inputs.
- [ ] Remove monetary columns and repository methods/types; aggregate token sums only when at least one attempt returned that counter.
- [ ] Migrate historical `SKIPPED_BUDGET` runs to `FAILED` with `legacy_budget_skip`, rebuild the enum without `SKIPPED_BUDGET`, then drop monetary columns.
- [ ] Run the targeted worker and database tests against a dedicated migrated schema and expect all tests to pass.

### Task 4: Remove price fields from configuration and model management

**Files:**
- Modify: `packages/domain/src/config.ts`
- Modify: `packages/domain/src/model-settings.ts`
- Modify: `packages/db/src/model-settings-repository.ts`
- Modify: `apps/worker/src/runtime-ai-config.ts`
- Modify: `apps/worker/src/configured-daily-processor.ts`
- Modify: `apps/worker/src/import-journal-corpus-trial.ts`
- Modify: `apps/web/src/server/model-settings.ts`
- Modify: `apps/web/src/components/model-connection-form.tsx`
- Modify corresponding tests under `tests/domain`, `tests/db`, `tests/worker`, `tests/api`, `tests/web`, and `tests/e2e`.

- [ ] Remove `DAILY_AI_BUDGET_USD` and provider price environment parsing.
- [ ] Remove price fields from create/update/public DTOs and encrypted profile repository types.
- [ ] Remove price controls and cost wording from the model form; keep API key, provider, model, base URL, and timeout.
- [ ] Run all model-settings/config/runtime tests and expect all tests to pass.

### Task 5: Remove budget counters and update documentation

**Files:**
- Modify: `apps/worker/src/daily-pipeline.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `docs/trials/2026-09-01-kimi-abstract-trial.md`
- Modify: `tests/worker/daily-pipeline.test.ts`
- Modify: `tests/docs/operations.test.ts`

- [ ] Replace `skippedBudget` with no skip category; interpretation failures remain explicit failures.
- [ ] Remove all current operational instructions for budgets, prices, and cost estimates; retain token/duration audit wording as optional provider metadata.
- [ ] Run `rg` over active source/docs and verify no monetary runtime or UI references remain.
- [ ] Commit as `refactor(ai): remove local cost and budget enforcement`.

