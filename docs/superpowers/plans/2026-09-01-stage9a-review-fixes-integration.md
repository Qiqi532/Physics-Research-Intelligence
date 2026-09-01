# Stage 9A Review Fixes and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the independent review findings in Stage 9A, verify the branch, and integrate it with the no-cost LLM runtime.

**Architecture:** Preserve the seven focused Stage 9A commits, add one review-fix commit on that branch, then merge through a dedicated integration branch. Do not mix Phase 9B PDF storage or later RAG work into this change.

**Tech Stack:** TypeScript, Next.js, Prisma/PostgreSQL, Vitest, Playwright.

---

### Task 1: Prevent concurrent favorite-state overwrite

**Files:**
- Modify: `packages/db/src/today-repository.ts`
- Test: `tests/db/today-repository.test.ts`

- [ ] Add a regression test where a reading update omits `isFavorite` while a favorite toggle occurs; the unrelated update must not write favorite columns.
- [ ] Build Prisma `create` and `update` data separately: creation uses explicit/default favorite values, while update includes `isFavorite` and `favoritedAt` only when the request includes `isFavorite`.
- [ ] Keep repeated `isFavorite: true` idempotent and preserve the first `favoritedAt` value.
- [ ] Run the Today repository PostgreSQL tests and expect all tests to pass.

### Task 2: Enforce bounded daily configuration

**Files:**
- Modify: `packages/domain/src/config.ts`
- Modify: `tests/domain/config.test.ts`
- Modify: `docs/operations.md`

- [ ] Add failing tests for retention above 3,650 days, target above 500, and target min/max invariant failures.
- [ ] Add a bounded positive-integer parser with `PAPER_RETENTION_DAYS <= 3650` and both daily targets `<= 500`.
- [ ] Document the limits and run configuration tests.

### Task 3: Complete collection styling

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `tests/e2e/today.spec.ts`

- [ ] Add collection-list/card spacing and favorite-button normal, active, disabled, hover, and focus-visible states using existing design tokens.
- [ ] Add a mobile rule that keeps controls usable without horizontal overflow.
- [ ] Run desktop/mobile collection Playwright coverage.

### Task 4: Integrate and verify

**Files:**
- Merge reviewed branch: `codex/stage-9-local-library`
- Update: `README.md`
- Update: `task_plan.md`
- Update: `findings.md`
- Update: `progress.md`

- [ ] Run `git diff --check` and review Critical/Warning findings locally.
- [ ] Run Prisma generate/validate/migrate status on a dedicated schema.
- [ ] Run full Vitest, lint, typecheck, Web/worker production builds, and Playwright desktop/mobile.
- [ ] Confirm no secrets, API keys, generated build artifacts, or unrelated corpus files are staged.
- [ ] Merge with an explicit conventional commit and push only after fresh verification is green.
