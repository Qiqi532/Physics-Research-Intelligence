# Manual Pipeline Review and Automation Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review and harden the first manual daily-pipeline changes, verify the application through tests and a real local browser session, document the future daily-automation development and deployment procedure, and push only a verified review branch.

**Architecture:** Preserve the current working tree on `codex/review-manual-pipeline-automation`, review each boundary from AI contracts through persistence, worker orchestration, API, and UI, and use focused regression tests for every confirmed behavior defect. Keep future scheduler/locking/alerting work as an explicit deployment-ready specification rather than silently presenting it as implemented.

**Tech Stack:** TypeScript 5.9, Node.js 22, pnpm workspace, Next.js 16, React 19, Prisma/PostgreSQL, Redis/BullMQ, Vitest, Playwright.

---

### Task 1: Repository hygiene and review baseline

**Files:**
- Modify: `.gitignore`
- Inspect: `docs/2026-09-01-run-data-snapshot.json`
- Inspect: `data/journal-corpus/candidates.json`
- Inspect: `data/journal-corpus/science_arxiv_meta.json`

- [ ] **Step 1: Record the exact branch and working-tree baseline**

Run:

```powershell
git status --short --branch
git diff --stat
git diff --check
```

Expected: branch is `codex/review-manual-pipeline-automation`; existing manual-run changes remain unstaged; `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Add local tool directories to Git ignore rules**

Append these exact repository-root rules to `.gitignore`:

```gitignore
/.superpowers/
/.worktrees/
```

- [ ] **Step 3: Verify the ignore boundary without deleting local files**

Run:

```powershell
git check-ignore -v .superpowers/brainstorm/1549-1787821885/content/paper-interpretation.html
git check-ignore -v .worktrees/stage-3/package.json
git status --short
```

Expected: both local paths match `.gitignore`; neither directory appears as untracked; no directory is removed.

- [ ] **Step 4: Inspect proposed data artifacts for secrets and unreasonable size**

Run:

```powershell
Get-Item docs/2026-09-01-run-data-snapshot.json,data/journal-corpus/candidates.json,data/journal-corpus/science_arxiv_meta.json | Select-Object FullName,Length
rg -n -i "api[_-]?key|authorization|bearer |password|secret|ciphertext|nonce|authTag|DATABASE_URL" docs/2026-09-01-run-data-snapshot.json data/journal-corpus/candidates.json data/journal-corpus/science_arxiv_meta.json
```

Expected: files are reviewable metadata-sized artifacts and the secret scan has no credential values. If a match is a field label, inspect it and keep only demonstrably non-secret content.

- [ ] **Step 5: Commit repository hygiene separately**

Run:

```powershell
git add .gitignore
git diff --cached --check
git commit -m "chore(git): ignore local agent workspaces"
```

Expected: one commit containing only `.gitignore`.

### Task 2: Establish failing and passing baselines

**Files:**
- Inspect: `package.json`
- Inspect: `vitest.config.ts`
- Inspect: `playwright.config.ts`
- Record results in: `docs/2026-09-02-code-review-and-web-trial-report.md`

- [ ] **Step 1: Generate the Prisma client and run the fastest affected tests**

Run:

```powershell
pnpm --filter @pri/db prisma:generate
pnpm vitest run tests/domain/journal-whitelist.test.ts tests/ai/schemas.test.ts tests/ai/router.test.ts tests/worker/screen-papers.test.ts tests/worker/daily-pipeline.test.ts tests/worker/configured-daily-processor.test.ts tests/api/today.test.ts tests/web/components.test.ts
```

Expected: capture every failure with its test name and error; do not modify assertions until the expected behavior has been checked against the approved design.

- [ ] **Step 2: Run focused static checks**

Run:

```powershell
pnpm typecheck
pnpm lint
```

Expected: capture the full exit status and the first root-cause error in each failing package.

- [ ] **Step 3: Create the review report skeleton with observed evidence**

Create `docs/2026-09-02-code-review-and-web-trial-report.md` with these sections and immediately fill them from Steps 1–2:

```markdown
# 首次手动全流程代码审查与网页试运行报告

## 审查范围
## 初始验证基线
## 代码审查发现
## 修复与回归测试
## 网页试运行
## 最终验证证据
## 提交与推送清单
## 剩余风险和下一步
```

### Task 3: Harden batch screening correctness

**Files:**
- Modify: `apps/worker/src/jobs/ai-job.ts`
- Modify: `apps/worker/src/jobs/screen-papers.ts`
- Modify: `packages/ai/src/schemas.ts`
- Create: `tests/worker/ai-job.test.ts`
- Modify: `tests/worker/screen-papers.test.ts`
- Modify: `tests/ai/schemas.test.ts`

- [ ] **Step 1: Add regression tests for batch identity and output completeness**

Add tests that assert:

```typescript
const screenInput = (paperId: string) => ({
  paperId,
  title: `Paper ${paperId}`,
  abstract: null,
  journal: "Nature",
  publishedAt: null,
});

it("changes batch idempotency when the paper set changes", () => {
  const first = createBatchInputHash([screenInput("paper-a")]);
  const second = createBatchInputHash([screenInput("paper-b")]);
  expect(first).not.toBe(second);
});

it("fails a batch when the provider omits an input paper", async () => {
  const papers = [paper("p-1", "Nature"), paper("p-2", "Nature")];
  const repo = repository({
    listPapersForScreening: vi.fn().mockResolvedValue(papers),
  });
  const provider = createMockAiProvider({
    screenBatch: {
      output: {
        papers: [{
          paperId: "p-1",
          score: 0.8,
          directionSlug: "amo-optics",
          reason: "relevant",
          selected: true,
        }],
      },
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 1,
    },
  });

  const result = await screenPapers({
    from: window.from,
    until: window.until,
    limit: 100,
    batchSize: 15,
    repository: repo,
    primary: provider,
  });

  expect(result.failures).toEqual([
    { batchIndex: 0, errorCode: "business_validation" },
  ]);
  expect(repo.saveScreeningResults).not.toHaveBeenCalled();
  expect(repo.failRun).toHaveBeenCalledWith({
    runId: "run-1",
    errorCode: "business_validation",
    completedAt: expect.any(Date),
  });
});

it("rejects a non-positive batch size", async () => {
  const repo = repository();
  await expect(screenPapers({
    from: window.from,
    until: window.until,
    limit: 100,
    batchSize: 0,
    repository: repo,
    primary: createMockAiProvider(),
  })).rejects.toThrow("screen_batch_size_invalid");
});
```

- [ ] **Step 2: Run the new tests and confirm they expose the current defects**

Run:

```powershell
pnpm vitest run tests/worker/ai-job.test.ts tests/worker/screen-papers.test.ts tests/ai/schemas.test.ts
```

Expected: the new completeness and zero-size tests fail before implementation; existing tests remain diagnostic.

- [ ] **Step 3: Make batch identity content-based and validate provider coverage**

Implement these invariants:

```typescript
if (!Number.isInteger(input.batchSize) || input.batchSize <= 0) {
  throw new Error("screen_batch_size_invalid");
}

const screenInputs = batch.map(toScreenInput);
const inputHash = createBatchInputHash(screenInputs);
const batchKey = `${input.from.toISOString()}|${input.until.toISOString()}|${inputHash}`;
```

Before persistence, require the returned IDs to be unique and exactly equal to the input IDs. Any duplicate, missing, or unknown ID must fail the claimed run with `business_validation` and must not save partial screening/classification records.

- [ ] **Step 4: Re-run screening, router, schema and pipeline tests**

Run:

```powershell
pnpm vitest run tests/worker/ai-job.test.ts tests/worker/screen-papers.test.ts tests/worker/daily-pipeline.test.ts tests/worker/configured-daily-processor.test.ts tests/ai/router.test.ts tests/ai/schemas.test.ts
```

Expected: all listed suites pass with zero failures.

### Task 4: Make single-paper interpretation safe and testable

**Files:**
- Modify: `apps/web/src/server/single-interpretation.ts`
- Modify: `apps/web/src/app/api/papers/[doi]/interpret/route.ts`
- Create: `tests/api/single-interpretation.test.ts`
- Create: `tests/api/single-interpretation-route.test.ts`

- [ ] **Step 1: Add service tests for validation, idempotency and provider failure**

Export the dependency-injected interpretation core and test these exact outcomes:

```typescript
const complete = await runInterpretation({
  paperId: "paper-1",
  repository: completeRepository,
  primary: completeProvider,
  now: () => new Date("2026-09-02T00:00:00.000Z"),
});
expect(complete).toEqual({
  status: "complete",
  runId: "run-1",
});

const missing = await runInterpretation({
  paperId: "missing-paper",
  repository: missingPaperRepository,
  primary: completeProvider,
});
expect(missing).toEqual({
  status: "failed",
  errorCode: "business_validation",
});

const inProgress = await runInterpretation({
  paperId: "paper-1",
  repository: inProgressRepository,
  primary: completeProvider,
});
expect(inProgress).toEqual({
  status: "in_progress",
  runId: "run-1",
});
```

Also assert that a failed provider records attempts and calls `failRun`, while a complete provider saves one interpretation and completes the run.

- [ ] **Step 2: Add route tests that prohibit internal-error disclosure**

Mock `interpretSinglePaper` and assert the unavailable response is generic:

```typescript
const response = await POST(new Request("http://localhost"), {
  params: Promise.resolve({ doi: "10.1103%2Fexample" }),
});
const body = await response.json();

expect(response.status).toBe(503);
expect(body).toEqual({
  status: "unavailable",
  errorCode: "service_unavailable",
});
expect(JSON.stringify(body)).not.toContain("private database URL");
```

- [ ] **Step 3: Run the new tests and confirm the disclosure test fails first**

Run:

```powershell
pnpm vitest run tests/api/single-interpretation.test.ts tests/api/single-interpretation-route.test.ts
```

Expected: current route fails the generic-error assertion because it exposes `String(error)`.

- [ ] **Step 4: Remove internal error text from public results**

Change the unavailable result to:

```typescript
| { status: "unavailable" };
```

Log the original exception only through `logError`, and map the route response to the generic payload from Step 2. Preserve 200 for complete/duplicate, 202 for in-progress, 404 for missing DOI, and 502 with stable `AiErrorCode` for provider failures.

- [ ] **Step 5: Re-run single-paper and existing API tests**

Run:

```powershell
pnpm vitest run tests/api/single-interpretation.test.ts tests/api/single-interpretation-route.test.ts tests/api/papers.test.ts tests/api/today.test.ts
```

Expected: all listed API suites pass with no internal exception text in response bodies.

### Task 5: Repair Web component and Today regressions

**Files:**
- Modify: `apps/web/src/components/recommendation-card.tsx`
- Modify: `apps/web/src/server/today.ts`
- Modify: `tests/web/components.test.ts`
- Modify: `tests/api/today.test.ts`
- Modify: `apps/web/src/app/globals.css` only if browser evidence shows missing button/error styling

- [ ] **Step 1: Update the Today candidate-limit expectation**

Change the exact expectation in `tests/api/today.test.ts` from `candidateLimit: 50` to `candidateLimit: 500`, matching both Web and Worker configuration.

- [ ] **Step 2: Render the hook-based recommendation card through React**

Replace direct invocation of `RecommendationCard` in the component test with React server rendering:

```typescript
const output = renderToStaticMarkup(
  createElement(RecommendationCard, { paper: recommendation() }),
);
expect(output).toContain("/papers/10.1103%2Fexample");
```

Add a no-interpretation fixture and assert the markup contains both `详情页` and `AI 解读`, while an interpreted paper contains `查看解读` and no `AI 解读` button.

- [ ] **Step 3: Remove accidental UTF-8 BOM changes**

Normalize the first line of `apps/web/src/server/today.ts`, `packages/ai/src/mock-provider.ts`, `packages/ai/src/providers/gemini.ts`, and `packages/ai/src/providers/openai.ts` so they begin with the first source character and no BOM.

- [ ] **Step 4: Run Web and Today tests**

Run:

```powershell
pnpm vitest run tests/web/components.test.ts tests/api/today.test.ts tests/web/responsive-css.test.ts tests/web/standalone-assets.test.ts
```

Expected: all listed suites pass; the hook-based component no longer triggers an invalid-hook-call failure.

### Task 6: Review persistence, migration and daily orchestration

**Files:**
- Review/modify: `packages/db/prisma/schema.prisma`
- Review/modify: `packages/db/prisma/migrations/20260901230000_add_paper_screening/migration.sql`
- Review/modify: `packages/db/src/ai-repository.ts`
- Review/modify: `packages/db/src/today-repository.ts`
- Review/modify: `apps/worker/src/configured-daily-processor.ts`
- Review/modify: `apps/worker/src/daily-pipeline.ts`
- Modify: `tests/db/ai-repository-unit.test.ts`
- Modify: `tests/db/today-repository-unit.test.ts`
- Modify: `tests/worker/configured-daily-processor.test.ts`
- Modify: `tests/worker/daily-pipeline.test.ts`

- [ ] **Step 1: Validate the Prisma schema and migration**

Run:

```powershell
pnpm --filter @pri/db exec prisma validate --schema prisma/schema.prisma
pnpm --filter @pri/db prisma:generate
```

Expected: Prisma validates the `SCREEN` enum, `PaperScreening` relations, unique key and indexes, then generates the client successfully.

- [ ] **Step 2: Add unit assertions for screened selection and Today ordering**

Assert that database query arguments enforce the requested time window and limit, selected candidates exclude `selected=false`, and Today ordering places interpreted papers first without changing the deterministic score ordering inside each group.

- [ ] **Step 3: Verify partial screening behavior is represented truthfully**

Add a daily-pipeline assertion that one failed batch yields `failedBatches: 1` while interpretation, Today preparation and cleanup still run. Confirm an ingestion failure prevents all later stages.

- [ ] **Step 4: Run database and orchestration tests**

Run:

```powershell
pnpm vitest run tests/db/ai-repository-unit.test.ts tests/db/today-repository-unit.test.ts tests/worker/configured-daily-processor.test.ts tests/worker/daily-pipeline.test.ts
```

Expected: all listed suites pass and query snapshots match the schema.

### Task 7: Harden the manual runner and commit reviewed application changes

**Files:**
- Modify: `apps/worker/src/manual-daily-run.ts`
- Update: `docs/2026-09-02-code-review-and-web-trial-report.md`

- [ ] **Step 1: Stop printing the local master-key path**

Replace the path-bearing log with a boolean configuration signal:

```typescript
console.log(
  `[manual-daily] AI_SETTINGS_MASTER_KEY_FILE_CONFIGURED=${Boolean(process.env.AI_SETTINGS_MASTER_KEY_FILE)}`,
);
```

- [ ] **Step 2: Run the affected Worker tests and typecheck**

Run:

```powershell
pnpm vitest run tests/worker/screen-papers.test.ts tests/worker/daily-pipeline.test.ts tests/worker/configured-daily-processor.test.ts
pnpm typecheck
```

Expected: zero test failures and typecheck exit code 0.

- [ ] **Step 3: Review the complete application diff and update findings**

Run:

```powershell
git diff -- apps packages tests data/journal-corpus docs/2026-09-01-first-manual-run-report.md docs/2026-09-01-run-data-snapshot.json docs/2026-09-02-manual-daily-pipeline-full-logic.md
git diff --check
```

Record each confirmed finding with severity, evidence, minimal fix and regression test in the review report.

- [ ] **Step 4: Commit the reviewed functional change as one logical unit**

Stage only reviewed application, migration, test, corpus metadata and manual-run report files. Verify with `git diff --cached --name-only` and create:

```powershell
git commit -m "feat(pipeline): add journal-screened daily recommendations"
```

Expected: no `.env`, secret, PDF, backup, `.superpowers`, `.worktrees`, dependency or build artifact is staged.

### Task 8: Write the daily automation development and deployment guide

**Files:**
- Create: `docs/daily-automation-development-and-deployment.md`
- Modify: `README.md`
- Update: `docs/2026-09-02-manual-daily-pipeline-full-logic.md`
- Update: `docs/2026-09-02-code-review-and-web-trial-report.md`
- Modify: `tests/docs/operations.test.ts`

- [ ] **Step 1: Write the implementation-state matrix**

The guide must begin by distinguishing:

```markdown
| Capability | Current state | Required before enabling automation |
|---|---|---|
| Timezone-aware daily scheduling | Implemented | Verify configuration in target host |
| Same-window queue idempotency | Implemented | Add end-to-end restart test |
| Cross-process execution lock | Not implemented | Add PostgreSQL advisory lock or durable run lease |
| Run status history | Not implemented | Add DailyPipelineRun model and state transitions |
| Failure alerting | Not implemented | Add an approved notification channel |
```

- [ ] **Step 2: Document the development sequence**

Specify small, testable stages for run-state persistence, lease acquisition/renewal/release, retry policy, scheduler integration, metrics, alerting, operator controls, continuous three-day shadow runs, and the final `DAILY_PIPELINE_ENABLED=true` approval gate. For every stage include exact source/test file targets, acceptance criteria and rollback behavior.

- [ ] **Step 3: Document deployment and operations**

Include prerequisite versions, environment variables without values, secret injection, PostgreSQL/Redis preparation, migration commands, build commands, process topology, health checks, startup order, backup, restore drill, log retention, alert thresholds, restart recovery, rollback and post-deploy verification.

- [ ] **Step 4: Link the guide from README and reconcile the manual-flow document**

Add a Chinese README documentation link and correct any sentence in the manual-flow document that describes future locking, status tracking or alerting as already implemented.

- [ ] **Step 5: Add documentation contract tests**

Update `tests/docs/operations.test.ts` to assert the new guide contains `DAILY_PIPELINE_ENABLED`, `Asia/Shanghai`, migration, backup, rollback, run lock, partial failure and three-day shadow-run guidance.

- [ ] **Step 6: Run documentation tests and commit**

Run:

```powershell
pnpm vitest run tests/docs/operations.test.ts tests/docs/local-trial.test.ts
git add README.md docs/daily-automation-development-and-deployment.md docs/2026-09-02-manual-daily-pipeline-full-logic.md docs/2026-09-02-code-review-and-web-trial-report.md tests/docs/operations.test.ts
git diff --cached --check
git commit -m "docs(operations): define daily automation rollout"
```

Expected: documentation tests pass and the commit contains only documentation, its contract test and the review report.

### Task 9: Full verification and browser trial

**Files:**
- Update: `docs/2026-09-02-code-review-and-web-trial-report.md`
- Modify: `tests/e2e/today.spec.ts` only if a confirmed browser regression needs coverage

- [ ] **Step 1: Run the complete non-E2E verification suite**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: every command exits 0; Vitest reports zero failed tests; the production build completes.

- [ ] **Step 2: Verify local dependencies without exposing credentials**

Run:

```powershell
docker compose -f infra/docker-compose.yml ps
```

If PostgreSQL or Redis is stopped, run:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres redis
```

Expected: PostgreSQL and Redis are healthy. Do not print `.env` or the model-settings key path.

- [ ] **Step 3: Run Playwright with the dedicated test schema**

Run:

```powershell
$env:TEST_DATABASE_URL='postgresql://pri:pri@127.0.0.1:5432/pri?schema=pri_stage5_e2e'
pnpm test:e2e
```

Expected: desktop Chromium and mobile Chromium projects pass, with external network blocked and Mock Provider used.

- [ ] **Step 4: Start the reviewed Web application for visible browser inspection**

Run:

```powershell
pnpm --filter @pri/web dev
```

Open the local app and verify `/api/health/live`, `/api/health/ready`, `/`, `/library`, `/settings/models`, one interpreted paper detail, and one non-interpreted recommendation. Exercise the AI interpretation button only against the Mock Provider/test environment; do not trigger a paid provider.

- [ ] **Step 5: Record browser evidence and stop the local process**

Record page, viewport, observed state and result in the review report. Stop the development server cleanly with `Ctrl+C` after inspection.

- [ ] **Step 6: Re-run any test affected by a browser-discovered fix**

Run the exact focused test first, then repeat `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. A browser-only symptom must receive Playwright coverage when it can be reproduced with fixtures.

### Task 10: Final commit audit and GitHub push

**Files:**
- Update: `docs/2026-09-02-code-review-and-web-trial-report.md`

- [ ] **Step 1: Add final verification evidence to the review report**

Record command, timestamp, exit code, test count, build result, browser routes checked, unresolved risks and why no paid model call was made.

- [ ] **Step 2: Commit the final evidence update**

Run:

```powershell
git add docs/2026-09-02-code-review-and-web-trial-report.md
git diff --cached --check
git commit -m "docs(review): record verification evidence"
```

- [ ] **Step 3: Audit branch contents against main**

Run:

```powershell
git status --short --branch
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected: working tree has no unintended staged files; commits are logically separated; no local workspace, secret, PDF, backup or build artifact appears.

- [ ] **Step 4: Run a final secret-pattern scan on committed content**

Run:

```powershell
git diff main...HEAD | rg -n "sk-[A-Za-z0-9_-]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|postgresql://\S+:\S+@"
```

Expected: no added credential or private-key value is found. If a documentation-only local example matches, verify it uses public placeholder credentials and record that classification in the review report.

- [ ] **Step 5: Push the independent review branch without force**

Run:

```powershell
git push -u origin codex/review-manual-pipeline-automation
```

Expected: remote branch is created and tracks `origin/codex/review-manual-pipeline-automation`; `main` is unchanged.
