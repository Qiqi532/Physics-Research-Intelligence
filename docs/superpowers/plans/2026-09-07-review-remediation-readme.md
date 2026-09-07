# Review Remediation and README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct daily-delivery deduplication semantics, reconcile evaluation evidence, clean repository hygiene, and replace the duplicated README with an accurate Chinese-first project guide.

**Architecture:** Keep the existing daily pipeline shape and add one explicit post-delivery boundary: candidate selection remains read-only, Today preparation happens before delivery stamping, and stamping failures fail the run visibly. Apply recency at paper level in Prisma so any recently delivered selected screening excludes the whole paper. Documentation changes describe only verified capabilities and keep incomplete evaluation work clearly labeled.

**Tech Stack:** TypeScript, Node.js 22, pnpm workspaces, Vitest, Prisma/PostgreSQL, Next.js 16, BullMQ/Redis, Markdown.

---

## Task 1: Accept `0` as the documented delivery-recency disable switch

**Files:**
- Modify: `tests/domain/config.test.ts`
- Modify: `packages/domain/src/config.ts`

- [ ] **Step 1: Add a failing configuration test**

```ts
it("accepts zero delivery recency as an explicit disable switch", () => {
  const config = parseConfig({
    ...validEnvironment,
    DAILY_DELIVERY_RECENCY_DAYS: "0",
  });

  expect(config.DAILY_PIPELINE.deliveryRecencyDays).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm test tests/domain/config.test.ts`

Expected: FAIL because the current positive-integer parser rejects `0`.

- [ ] **Step 3: Add a bounded non-negative integer parser and use it only for delivery recency**

```ts
function parseOptionalBoundedNonNegativeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const rawValue = optionalEnvironmentValue(environment, name);
  if (rawValue === undefined) return defaultValue;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  if (value > maximum) {
    throw new Error(`${name} must be at most ${maximum}`);
  }
  return value;
}
```

- [ ] **Step 4: Add malformed-value and upper-bound coverage, then rerun**

Run: `pnpm test tests/domain/config.test.ts`

Expected: PASS.

## Task 2: Enforce delivery recency at paper level

**Files:**
- Modify: `tests/db/ai-repository-unit.test.ts`
- Modify: `packages/db/src/ai-repository.ts`

- [ ] **Step 1: Replace the screening-level expectation with paper-level relation filters**

```ts
expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    screenings: {
      some: { selected: true },
      none: {
        selected: true,
        deliveredAt: { gte: expect.any(Date) },
      },
    },
  }),
}));
```

Also assert the nested screening selector uses the matching eligible condition (`deliveredAt: null` or before the cutoff).

- [ ] **Step 2: Run the focused repository test and confirm it fails**

Run: `pnpm test tests/db/ai-repository-unit.test.ts`

Expected: FAIL because the current query puts recency inside `some`.

- [ ] **Step 3: Build distinct recent and eligible filters**

```ts
const recentDeliveryFilter = cutoff
  ? { selected: true, deliveredAt: { gte: cutoff } }
  : undefined;
const eligibleDeliveryFilter = cutoff
  ? { OR: [{ deliveredAt: null }, { deliveredAt: { lt: cutoff } }] }
  : undefined;
```

Use `some: { selected: true }` plus `none: recentDeliveryFilter` for the paper relation, and use `eligibleDeliveryFilter` in the nested selected-screening query.

- [ ] **Step 4: Rerun the focused repository test**

Run: `pnpm test tests/db/ai-repository-unit.test.ts`

Expected: PASS.

## Task 3: Stamp delivery only after Today succeeds

**Files:**
- Modify: `tests/worker/daily-pipeline.test.ts`
- Modify: `apps/worker/src/daily-pipeline.ts`
- Modify: `tests/worker/configured-daily-processor.test.ts`
- Modify: `apps/worker/src/configured-daily-processor.ts`

- [ ] **Step 1: Add lifecycle tests at the pipeline boundary**

Add `markDelivered(window, paperIds)` to test dependencies and verify this order:

```ts
[
  "ingest:2026-08-30",
  "screen:2026-08-30",
  "list-interpret:2026-08-30",
  "interpret:paper-1",
  "today:2026-08-30",
  "mark-delivered:paper-1",
  "prune:2026-08-30",
]
```

Add tests proving:
- Today failure does not call `markDelivered`.
- delivery-stamp failure rejects the run instead of being swallowed.

- [ ] **Step 2: Run the focused worker test and confirm it fails to compile or assert**

Run: `pnpm test tests/worker/daily-pipeline.test.ts`

Expected: FAIL until the dependency and ordering are implemented.

- [ ] **Step 3: Add the explicit post-Today dependency**

```ts
type DailyPipelineDependencies = {
  // existing dependencies
  markDelivered(window: DailyWindow, paperIds: string[]): Promise<void>;
};

const today = await dependencies.prepareToday(dependencies.window);
await dependencies.markDelivered(
  dependencies.window,
  interpretationPaperIds,
);
```

Do not catch stamping errors; the scheduler must observe an unsuccessful delivery run.

- [ ] **Step 4: Move repository stamping out of candidate selection**

```ts
async markDelivered(input, paperIds) {
  if (config.DAILY_PIPELINE.deliveryRecencyDays === 0 || paperIds.length === 0) {
    return;
  }
  await aiRepository.markScreeningsDelivered({
    paperIds,
    at: input.until,
  });
}
```

Delete the pre-Today `try/catch` stamping block from `listInterpretationPaperIds`.

- [ ] **Step 5: Update configured-processor mocks and test the no-op/marking behavior**

Run: `pnpm test tests/worker/daily-pipeline.test.ts tests/worker/configured-daily-processor.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the behavior fix**

Run: `git add packages/domain/src/config.ts apps/worker/src/daily-pipeline.ts apps/worker/src/configured-daily-processor.ts tests/domain/config.test.ts tests/db/ai-repository-unit.test.ts tests/worker/daily-pipeline.test.ts tests/worker/configured-daily-processor.test.ts`

Run: `git commit -m "fix(pipeline): make daily delivery dedupe truthful"`

Expected: one focused local commit; no push.

## Task 4: Reconcile evaluation evidence and repository hygiene

**Files:**
- Modify: `.gitignore`
- Modify: `docs/evaluation-runs/2026-09-03-full-review-sheet.md`
- Modify: `docs/evaluation-runs/2026-09-03-ai-firstpass-review.md`
- Modify: `docs/evaluation-runs/output-snapshot-2026-09-03.json`
- Modify: `task_plan.md`
- Add if verified useful: `docs/evaluation-runs/2026-09-03-ai-full-outputs.md`
- Add if verified useful: `docs/evaluation-runs/2026-09-04-human-review-stash.md`

- [ ] **Step 1: Recompute D1 counts from the 30 per-paper records**

Use a small read-only extraction command against the Markdown table and manually cross-check edge rows.

Expected: the aggregate statement exactly matches the listed 30 scores and the pass-count arithmetic.

- [ ] **Step 2: Correct evidence labels**

Update the review sheet so already-populated columns are not described as pending. Label `output-snapshot-2026-09-03.json` as an early 11-paper snapshot rather than a full-30 result. Keep human-review status incomplete where D2/D5/D6 evidence is still missing.

- [ ] **Step 3: Ignore local scratch and raw-response artifacts**

Add scoped entries:

```gitignore
/.workbuddy/
/.tmp-*
/fetch-test.mjs
/docs/evaluation-runs/today-response-*.json
/docs/evaluation-runs/scripts/
```

Do not delete the user's local files.

- [ ] **Step 4: Update the current task ledger**

Make `task_plan.md` distinguish completed implementation from pending human evaluation and follow-up reliability work.

- [ ] **Step 5: Run documentation consistency checks**

Run: `rg -n "待产出|待填写|26/30|4 分|3 分|自动调度|distributed lock|run ledger" docs/evaluation-runs task_plan.md`

Expected: no stale claims; remaining pending labels refer to genuinely incomplete human review.

- [ ] **Step 6: Commit evidence and hygiene updates**

Run: `git add .gitignore docs/evaluation-runs task_plan.md`

Run: `git commit -m "docs(evaluation): reconcile manual review evidence"`

Expected: raw provider response and local scratch files remain untracked/ignored.

## Task 5: Rewrite README using approved Approach A

**Files:**
- Modify: `README.md`
- Add: `tests/docs/readme-contract.test.ts`
- Modify: `tests/docs/local-trial.test.ts`

- [ ] **Step 1: Add or adjust contract tests for critical README claims**

Assert the README includes:
- Chinese-first project purpose and target user.
- exact quick-start commands and service URLs.
- explicit security/local-first constraints.
- current limitations: scheduler disabled by default, no distributed run ledger/lock, 30-paper human review incomplete, no license declaration.
- one concise English overview rather than a mirrored duplicate.

- [ ] **Step 2: Run the documentation contract test and confirm the intended failure**

Run: `pnpm test tests/docs/readme-contract.test.ts`

Expected: FAIL for newly required structure or limitation language.

- [ ] **Step 3: Replace README with the approved information architecture**

Use these sections:

```md
# Physics Research Intelligence
> 面向实验 AMO 物理研究者的本地优先论文情报工作台。

## 项目状态
## 为什么做这个项目
## 核心能力
## 系统架构
## 快速开始
## 模型与密钥配置
## 数据、安全与隐私
## 开发与测试
## 当前限制
## 路线图与项目文档
## English overview
```

Keep every command copy-pastable. Do not add CI badges, a license claim, or unsupported production/deployment promises.

- [ ] **Step 4: Run README contract and link/path checks**

Run: `pnpm test tests/docs/readme-contract.test.ts tests/docs/local-trial.test.ts`

Run: `rg -n "pnpm |http://localhost|docs/|LICENSE|自动调度|30 篇|English" README.md`

Expected: PASS, and each referenced local path exists.

- [ ] **Step 5: Commit the README rewrite**

Run: `git add README.md tests/docs/readme-contract.test.ts tests/docs/local-trial.test.ts`

Run: `git commit -m "docs(readme): clarify project status and local setup"`

Expected: one reviewable README-focused local commit; no push.

## Task 6: Verify the complete local branch and prepare the approval report

**Files:**
- Inspect: all changed files
- No new changes expected unless verification reveals a defect

- [ ] **Step 1: Run fastest focused checks**

Run: `pnpm lint`

Run: `pnpm typecheck`

Expected: both PASS.

- [ ] **Step 2: Run the full unit/integration suite with the isolated review database**

Run: `pnpm test`

Expected: all tests PASS using the already-prepared isolated test schema; no real model calls.

- [ ] **Step 3: Run production build and end-to-end tests**

Run: `pnpm build`

Run: `pnpm test:e2e`

Expected: build PASS and all browser scenarios PASS against the isolated E2E schema.

- [ ] **Step 4: Review the final diff and commit graph**

Run: `git status --short`

Run: `git diff --check`

Run: `git log --oneline --decorate -8`

Expected: no whitespace errors, only intentional uncommitted files (if any), and the planned commits are present locally.

- [ ] **Step 5: Report for explicit push approval**

Provide: audit fixes, test evidence, changed-file summary, remaining risks, referenced GitHub-project recommendations, and the exact remote branch/commits that would be pushed. Do not run `git push` until the user explicitly approves after this report.
