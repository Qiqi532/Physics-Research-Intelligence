# Recommendation, Internal API, and Today Physics Implementation Plan

> **For agentic workers:** Implement inline in this task. Keep every behavior change in a red → minimal green → local refactor cycle and record the exact command/output in `progress.md`. Create one final commit only, as explicitly requested by the user.

**Goal:** 实现可解释、确定性的论文推荐，提供 Today/详情/阅读状态内部 API，并交付可用的 Today Physics 首页与论文详情页。

**Architecture:** 新的 `@pri/recommendation` 包只接收普通数据并返回稳定分数、分项和最多三条理由，不依赖数据库或 AI。`@pri/db` 新增 Today 窄仓储并扩展论文详情读取；Next.js Route Handler 通过可注入服务暴露安全 DTO，服务端页面直接调用同一服务边界，只有阅读状态按钮使用小型客户端组件。

**Tech Stack:** TypeScript ESM、Vitest、Prisma 7.10.0、PostgreSQL、Next.js 16、React 19、原生 CSS。

---

## File map

- Create `packages/recommendation/package.json`, `tsconfig.json`, `src/score.ts`, `src/reasons.ts`, `src/index.ts`: 纯评分、稳定排序和可读理由。
- Create `tests/recommendation/score.test.ts`: 权重、冷启动、缺失数据、状态与确定性单元测试。
- Create `packages/db/src/today-repository.ts`; modify `packages/db/src/index.ts`, `packages/db/package.json`: Today 聚合、阅读队列与状态更新仓储。
- Modify `packages/db/src/paper-repository.ts`: 详情安全返回最新完整解读和用户状态。
- Create `tests/db/today-repository.test.ts`; modify `tests/db/paper-repository.test.ts`: 专用 PostgreSQL schema 集成覆盖。
- Create `apps/web/src/server/today.ts`; modify `apps/web/src/server/papers.ts`: 可注入内部 API 服务与安全序列化。
- Create `apps/web/src/app/api/today/route.ts`, `apps/web/src/app/api/papers/[doi]/state/route.ts`; modify detail route behavior only through its service.
- Create `tests/api/today.test.ts`; modify `tests/api/papers.test.ts`: API 空数据、错误、详情解读和状态更新测试。
- Create `apps/web/src/components/today-overview.tsx`, `recommendation-card.tsx`, `reading-queue.tsx`, `paper-interpretation.tsx`, `paper-state-controls.tsx`, `status-panel.tsx`.
- Modify `apps/web/src/app/page.tsx`, `layout.tsx`, `globals.css`; create `apps/web/src/app/loading.tsx`, `error.tsx`, `papers/[doi]/page.tsx`, `papers/[doi]/loading.tsx`.
- Create `tests/web/presentation.test.ts`: 纯页面呈现模型覆盖空、错误、无分类和无解读状态。
- Modify `task_plan.md`, `findings.md`, `progress.md`, `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`: 记录实际完成状态与验证证据。

### Task 1: Deterministic recommendation core

- [x] Write `tests/recommendation/score.test.ts` first. Cover exact component scores for interest match, classification relevance, recency, cross-disciplinary discovery, `SAVED`/`READING` boost, `COMPLETE`/`SKIPPED` penalty, `LIKE`/`DISLIKE`, no interests, no classifications, no interpretation, stable ties, and at most three non-generic reasons.
- [x] Run `pnpm test tests/recommendation/score.test.ts`; record the module-not-found red.
- [x] Create `@pri/recommendation` with these public shapes:

```ts
type RecommendationInput = {
  paperId: string;
  publishedAt: Date | null;
  classifications: Array<{ tagSlug: string; relevance: number; isCrossDisciplinary: boolean }>;
  interests: Readonly<Record<string, number>>;
  readingStatus: "UNREAD" | "SAVED" | "READING" | "COMPLETE" | "SKIPPED";
  feedback: "NONE" | "LIKE" | "DISLIKE";
};

type RecommendationScore = {
  total: number;
  breakdown: {
    interest: number;
    classification: number;
    recency: number;
    discovery: number;
    readingState: number;
  };
  reasons: string[];
};
```

- [x] Clamp all inputs, round public scores consistently, use a fixed linear recency decay, and generate reasons from positive/negative score facts only. Do not use `Math.random`, current time inside the scorer, AI, journal-name heuristics, or hidden module state.
- [x] Re-run the exact test green; run `pnpm --filter @pri/recommendation typecheck`.

### Task 2: Today and detail database boundary

- [x] Write `tests/db/today-repository.test.ts` and extend the paper repository integration test before implementation. Use only `TEST_DATABASE_URL`; clean only records in its configured schema.
- [x] Cover a new user with no interests, interested ranking, cross signal aggregation, saved/reading queue, skipped penalty, papers without classifications or interpretations, latest complete interpretation selection, and DOI-based state upsert.
- [x] Run the two targeted DB files and record red before adding repository methods.
- [x] Implement `TodayRepository.getToday({ userId, now, candidateLimit })` with independent Prisma reads started together and deterministic scoring using the injected `now`.
- [x] Implement `TodayRepository.setPaperStateByDoi` with normalized DOI lookup, enum-safe input, upsert, and a not-found result. Extend `PaperRepository.findByDoi` to return only the latest `COMPLETE` interpretation content plus the default user's safe state.
- [x] Do not change `schema.prisma` or historical migrations. Re-run targeted DB tests green and typecheck `@pri/db`.

### Task 3: Internal API services and Route Handlers

- [x] Write `tests/api/today.test.ts` and extend `tests/api/papers.test.ts` first. Cover serializable score breakdown/reasons, empty Today, generic 503, valid state patch, invalid JSON/enums, invalid DOI, missing paper, source disclosure, evidence levels, and no internal stack/cost/credentials.
- [x] Run the targeted API tests and record red.
- [x] Implement `createTodayApi(repository, options)` plus configured wrapper following `createPaperApi`. Accept an injected `now` in tests and use user `default` only at the composition boundary.
- [x] Add `GET /api/today` and `PATCH /api/papers/[doi]/state`. Extend detail DTO with `interpretation` and `userState`; parse persisted interpretation through the strict stage-3 schema before exposing it, mapping corrupt/missing AI content to an unavailable interpretation rather than breaking paper facts.
- [x] Keep database URLs, normalized titles, AI runs, costs, raw errors and restricted content out of DTOs and logs. Re-run API tests green.

### Task 4: Presentation models and reusable UI states

- [x] Write `tests/web/presentation.test.ts` first for homepage `ready`/`empty`/`error`, detail `ready`/`missing_interpretation`, abstract-only disclosure, evidence grouping, access labels, and absent DOI behavior.
- [x] Run the targeted test and record red.
- [x] Implement small pure presentation helpers colocated under `apps/web/src/presentation/` and focused components under `apps/web/src/components/`.
- [x] Keep public facts, AI summary, inference, and uncertainty in separate semantic sections with visible labels. Ensure links/buttons have text labels, visible focus, sufficient contrast and correct native elements.
- [x] Re-run presentation tests green and run Web typecheck.

### Task 5: Today Physics homepage

- [x] Add failing source-level/page-model tests proving the page includes 今日统计、跨方向信号、个性推荐 and 阅读队列, plus empty/error affordances.
- [x] Implement the root page as an async Server Component using the configured Today service directly. Do not fetch the app's own `/api/today` route.
- [x] Render paper cards with title, source/journal, date, tags, recommendation reasons, access status, detail link when DOI exists, and safe original link when available.
- [x] Add responsive grid/list CSS, skip link, landmark headings, visible focus, touch-sized controls, and `loading.tsx` skeletons without animation dependence.
- [x] Re-run targeted tests, lint and Web typecheck.

### Task 6: Paper detail and reading-state interaction

- [x] Add failing page/presentation tests for Chinese and English overview labels, research question, innovations, methods, limitations, evidence level, confidence language, provenance, original link, abstract-only badge, missing AI state and restricted-access warning.
- [x] Implement `papers/[doi]/page.tsx` as a Server Component. Resolve configured paper service directly, call `notFound()` only for a real 404, and render a safe error panel for service failure.
- [x] Implement `paper-state-controls.tsx` as the only client component. PATCH the state API, expose pending/success/error status via `aria-live`, and refresh the Server Component after success.
- [x] Add segment loading and app error boundaries. Re-run targeted tests, lint and Web typecheck.

### Task 7: Local simplification and review

- [x] Read and apply the `simplify` skill only to stage-4 code; preserve behavior and avoid unrelated refactors.
- [x] Read and apply the `code-review` skill. CodeRabbit was unavailable and would upload code, so the documented local fallback was used. Warning-level feedback-state and repeated-tag findings received red-green regression tests and fixes.
- [x] Re-run all stage-4 targeted tests after review.

### Task 8: Full verification and browser QA

- [x] Use a dedicated stage-4 test schema derived without exposing credentials. Run migrations only there, then `pnpm test` including PostgreSQL integration tests.
- [x] Run `pnpm --filter @pri/db prisma:generate`, `prisma:validate`, and `prisma migrate status` against the test schema; all four existing migrations are applied and there is no stage-4 migration.
- [x] Run `pnpm lint`, `pnpm typecheck`, Web production build and worker production build. A temporary `APPDATA` was used for the known Next.js Windows cache permission boundary.
- [x] Start the local Web app with fixture/test-schema data and inspect homepage/detail at desktop and narrow viewport. The in-app browser runtime failed to initialize three times, so isolated local headless Chrome was used; reading-state, loading, empty, error and missing-AI states were verified without real network or AI calls.
- [x] Run `git diff --check`, tracked/untracked build-output inspection, staged sensitive-name/content scan, and final `git status --short --branch`.

### Task 9: Documentation and final commit

- [x] Update the three planning files and mark only actually completed MVP Task 5/6 items.
- [x] Stage only stage-4 source, tests and docs; explicitly exclude `.env`, test database files, `.next`, generated build output and `*.tsbuildinfo`.
- [ ] Inspect `git diff --cached --stat` and `git diff --cached`; create one Conventional Commit that matches the actual staged diff. Do not push.
- [ ] Record the final verification summary in `progress.md`, create the commit, then record/verify its hash through fresh Git commands and report any remaining untracked generated files separately.

## Completion conditions

- The same inputs and injected `now` always produce the same recommendation order, breakdown and reasons.
- Cold start, missing classification, missing interpretation and reading-state cases have explicit deterministic behavior.
- No stage-4 code calls an AI provider, external API, telemetry or analytics service.
- Today and detail responses expose only facts, user state, validated stage-3 interpretation, evidence, provenance and recommendation output.
- Homepage/detail are responsive, keyboard usable and visibly distinguish fact, AI summary, inference and uncertainty.
- Every success claim is backed by a fresh command with exit code 0 and browser evidence.
