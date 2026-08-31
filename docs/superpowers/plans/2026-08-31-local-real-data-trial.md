# Physics Research Intelligence Local Real-Data Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost, repeatable local trial that safely downloads and verifies nine official open arXiv papers, imports only their public metadata through the existing repository, and serves a real desktop Web page with an explicit optional trusted-LAN mode.

**Architecture:** Keep filesystem acquisition in a focused worker-side review-corpus module: a strict manifest parser defines the trusted input, a downloader enforces the arXiv/PDF/checksum boundary, and an importer converts validated entries to the existing `PaperSourceInput` and `PaperRepository.upsertFromSource`. Add explicit package scripts for corpus operations and Web binding; keep PostgreSQL/Redis loopback-only and preserve fixture-only automated browser tests.

**Tech Stack:** TypeScript 5.9, Node.js 22 fetch/fs/crypto APIs, Zod, Prisma/PostgreSQL, Next.js 16, BullMQ/Redis, Vitest, Playwright, pnpm.

---

## File map

- Create `apps/worker/src/review-corpus/manifest.ts`: strict manifest schema, duplicate/coverage checks, and `PaperSourceInput` conversion.
- Create `apps/worker/src/review-corpus/downloader.ts`: approved-host PDF download, size/signature/checksum validation, atomic file placement, and idempotent verification.
- Create `apps/worker/src/review-corpus/importer.ts`: repository-driven, per-record import outcomes and stable summary.
- Create `apps/worker/src/download-review-corpus.ts`: explicit downloader CLI with structured, redacted results.
- Create `apps/worker/src/import-review-corpus.ts`: explicit database import CLI with guaranteed disconnect.
- Modify `apps/worker/package.json`: expose `corpus:download` and `corpus:import` commands.
- Modify `apps/web/package.json`: make `dev`/`start` localhost-only and add explicit warned `dev:lan`/`start:lan` commands.
- Modify `.gitignore`: ignore only `data/review-corpus/pdfs/` while retaining the manifest and README.
- Create `data/review-corpus/manifest.json`: nine official arXiv records covering the exact nine existing tag slugs.
- Create `data/review-corpus/README.md`: provenance, licensing, verification, redownload, and Git boundary.
- Create `tests/worker/review-corpus-manifest.test.ts`: strict validation, coverage, duplicate and conversion tests.
- Create `tests/worker/review-corpus-downloader.test.ts`: mock-only HTTP and temporary-filesystem tests.
- Create `tests/worker/review-corpus-importer.test.ts`: repository unit contract and summary tests.
- Create `tests/db/review-corpus-import.test.ts`: dedicated PostgreSQL replay/cleanup integration test.
- Create `tests/docs/local-trial.test.ts`: script, ignore, manifest coverage, and operations-document checks.
- Modify `docs/operations.md`, `README.md`, `.env.example`: exact local trial, trusted-LAN, stop/restart and no-key behavior.
- Modify `task_plan.md`, `findings.md`, `progress.md`, and `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`: stage status, evidence, red/green record and remaining manual evaluation.

### Task 1: Strict review-corpus manifest boundary

**Files:**
- Create: `apps/worker/src/review-corpus/manifest.ts`
- Create: `tests/worker/review-corpus-manifest.test.ts`

- [x] **Step 1: Write failing strict-schema and coverage tests**

Create fixture entries with the real manifest shape and assert: all nine `PHYSICS_TAG_SLUGS` occur exactly once; unknown fields, repeated `arxivId`, repeated local filenames, non-HTTPS URLs, non-arXiv abstract/PDF hosts, non-hex SHA-256, non-positive/excessive byte counts, invalid dates, and missing tag coverage fail. Also assert conversion returns `sourceName: "arxiv"`, the public abstract, `accessStatus: "OPEN"`, and never returns `pdfPath`.

```ts
expect(() => parseReviewCorpusManifest(validManifest())).not.toThrow();
expect(() => parseReviewCorpusManifest({
  ...validManifest(),
  papers: [...validManifest().papers, validManifest().papers[0]],
})).toThrow(/duplicate arXiv id/i);
expect(toPaperSourceInput(entry)).toEqual(expect.objectContaining({
  sourceName: "arxiv",
  sourceRecordId: entry.arxivId,
  abstract: entry.abstract,
  accessStatus: "OPEN",
}));
expect(toPaperSourceInput(entry)).not.toHaveProperty("pdfPath");
```

- [x] **Step 2: Run the focused test and record the red result**

Run: `pnpm vitest run tests/worker/review-corpus-manifest.test.ts`

Expected: FAIL because `apps/worker/src/review-corpus/manifest.ts` does not exist.

- [x] **Step 3: Implement the minimal strict manifest parser**

Define a strict Zod schema with `schemaVersion: 1`, a non-empty `generatedAt`, and exactly nine paper entries. Each entry contains `reviewTargetTag`, `arxivId`, `title`, non-empty `authors`, `abstract`, `submittedAt`, nullable `doi`, `primaryCategory`, `abstractUrl`, `pdfUrl`, nullable `licenseUrl`, `retrievedAt`, `pdfFile`, lowercase SHA-256, and byte length capped at 50 MiB. Add post-parse checks for exact taxonomy coverage and duplicates, and a conversion function typed as `PaperSourceInput`.

```ts
export function toPaperSourceInput(entry: ReviewCorpusEntry): PaperSourceInput {
  return paperSourceInputSchema.parse({
    doi: entry.doi ?? undefined,
    sourceName: "arxiv",
    sourceRecordId: entry.arxivId,
    sourceUrl: entry.abstractUrl,
    licenseUrl: entry.licenseUrl,
    retrievedAt: new Date(entry.retrievedAt),
    title: entry.title,
    abstract: entry.abstract,
    journal: `arXiv:${entry.primaryCategory}`,
    firstAuthor: entry.authors[0],
    publishedAt: new Date(entry.submittedAt),
    originalUrl: entry.abstractUrl,
    accessStatus: "OPEN",
  });
}
```

- [x] **Step 4: Run the focused test and typecheck**

Run: `pnpm vitest run tests/worker/review-corpus-manifest.test.ts && pnpm --filter @pri/worker typecheck`

Expected: all manifest tests PASS and worker typecheck exits 0.

- [x] **Step 5: Commit the manifest boundary**

Run: `git add apps/worker/src/review-corpus/manifest.ts tests/worker/review-corpus-manifest.test.ts && git commit -m "feat(worker): validate review corpus manifests"`

### Task 2: Safe, idempotent PDF downloader

**Files:**
- Create: `apps/worker/src/review-corpus/downloader.ts`
- Create: `tests/worker/review-corpus-downloader.test.ts`

- [x] **Step 1: Write failing downloader tests using only mock fetch and a temporary directory**

Cover a valid `%PDF-` response, an already verified file (zero network calls), checksum mismatch refusal, HTML masquerading as PDF, wrong content type, excessive declared/streamed size, redirect to an unapproved host, timeout, and terminal 429/5xx. Assert a failed request leaves neither the final file nor a partial file.

```ts
const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(pdfBytes, {
  status: 200,
  headers: { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length) },
}));
const result = await downloadCorpusEntry(entryFor(pdfBytes), {
  corpusDirectory,
  fetchImpl,
  sleep: async () => undefined,
});
expect(result.status).toBe("downloaded");
expect(await readFile(join(corpusDirectory, entry.pdfFile))).toEqual(pdfBytes);
```

- [x] **Step 2: Run the focused test and record the red result**

Run: `pnpm vitest run tests/worker/review-corpus-downloader.test.ts`

Expected: FAIL because the downloader module does not exist.

- [x] **Step 3: Implement bounded acquisition and atomic placement**

Reuse `createRetriableFetch` with injected `fetchImpl`/`sleep`, three attempts, a 30-second timeout, and a descriptive `User-Agent`. Disable automatic redirect following, approve only `https://arxiv.org/pdf/...` and `https://export.arxiv.org/pdf/...`, validate status/content type/content length, stream no more than 50 MiB, verify the `%PDF-` prefix and SHA-256, write to a sibling `.partial` file, then atomically rename. Existing matching files return `verified`; existing mismatches throw without overwrite.

- [x] **Step 4: Run downloader and source retry regression tests**

Run: `pnpm vitest run tests/worker/review-corpus-downloader.test.ts tests/sources/http.test.ts`

Expected: all downloader and existing bounded-retry tests PASS with no real network calls.

- [x] **Step 5: Commit the downloader**

Run: `git add apps/worker/src/review-corpus/downloader.ts tests/worker/review-corpus-downloader.test.ts && git commit -m "feat(worker): download verified review papers"`

### Task 3: Idempotent corpus importer

**Files:**
- Create: `apps/worker/src/review-corpus/importer.ts`
- Create: `tests/worker/review-corpus-importer.test.ts`
- Create: `tests/db/review-corpus-import.test.ts`

- [x] **Step 1: Write failing repository-contract tests**

Assert one `upsertFromSource` call per valid manifest record, stable `imported`/`failed` record outcomes, continued processing after one repository rejection, totals that equal input length, omission of abstract text from results/log payloads, and no filesystem/PDF dependency.

```ts
const result = await importReviewCorpus(manifest, repository);
expect(repository.upsertFromSource).toHaveBeenCalledTimes(9);
expect(result.summary).toEqual({ total: 9, imported: 9, failed: 0 });
expect(JSON.stringify(result)).not.toContain(manifest.papers[0]!.abstract);
```

- [x] **Step 2: Run the importer unit test and record the red result**

Run: `pnpm vitest run tests/worker/review-corpus-importer.test.ts`

Expected: FAIL because the importer module does not exist.

- [x] **Step 3: Implement the minimal importer**

Accept an already parsed `ReviewCorpusManifest` and the existing `PaperRepository`; convert each entry with `toPaperSourceInput`, await `upsertFromSource`, and return only `arxivId`, `paperId`, status and a stable sanitized error code. Never open `pdfFile`.

- [x] **Step 4: Add and run the PostgreSQL replay test**

Using `TEST_DATABASE_URL`, import the same two representative real-manifest entries twice and assert two `Paper` plus two `PaperSource` rows, not four. Clean `Paper` rows before/after and disconnect; retain `_prisma_migrations`.

Run: `pnpm vitest run tests/worker/review-corpus-importer.test.ts tests/db/review-corpus-import.test.ts`

Expected: unit tests PASS; PostgreSQL test PASS when `TEST_DATABASE_URL` is present and otherwise is explicitly skipped like the existing repository integration tests.

- [x] **Step 5: Commit the importer**

Run: `git add apps/worker/src/review-corpus/importer.ts tests/worker/review-corpus-importer.test.ts tests/db/review-corpus-import.test.ts && git commit -m "feat(worker): import review corpus facts"`

### Task 4: Explicit corpus commands and nine-paper tracked manifest

**Files:**
- Create: `apps/worker/src/download-review-corpus.ts`
- Create: `apps/worker/src/import-review-corpus.ts`
- Modify: `apps/worker/package.json`
- Modify: `.gitignore`
- Create: `data/review-corpus/manifest.json`
- Create: `data/review-corpus/README.md`
- Create: `tests/docs/local-trial.test.ts`

- [ ] **Step 1: Write failing command/config documentation tests**

Assert the worker exposes `corpus:download` and `corpus:import`; `.gitignore` ignores `data/review-corpus/pdfs/`; the committed manifest parses and covers the nine actual `PHYSICS_TAG_SLUGS`; every canonical URL is official HTTPS arXiv; the README says PDFs are not committed and distinguishes human full-text review from model abstract input.

- [ ] **Step 2: Run the documentation boundary test and record the red result**

Run: `pnpm vitest run tests/docs/local-trial.test.ts`

Expected: FAIL because commands and corpus files do not yet exist.

- [ ] **Step 3: Select and verify nine official arXiv records**

Use the official arXiv abstract/API records to select exactly one primary paper for each existing tag. Record verbatim public metadata and canonical links; do not create evaluation scores or classifications. Download each official PDF once, then populate its actual lowercase SHA-256 and byte length in `manifest.json`. If a record has no explicit license URL, store `null` and explain arXiv's repository access terms without claiming a Creative Commons license.

- [ ] **Step 4: Implement the two CLIs and scripts**

Both CLIs load `data/review-corpus/manifest.json` relative to the repository root, strictly parse it, emit stable structured summaries via `toLogSafeData`, and set a nonzero exit code on any failure. The import CLI uses `parseConfig`, `createPrismaClient`, `createPaperRepository`, and a `finally` disconnect. Add:

```json
"corpus:download": "tsx src/download-review-corpus.ts",
"corpus:import": "tsx src/import-review-corpus.ts"
```

- [ ] **Step 5: Run tests, verify downloads, and prove idempotence**

Run: `pnpm vitest run tests/docs/local-trial.test.ts tests/worker/review-corpus-*.test.ts`

Run twice: `pnpm --filter @pri/worker corpus:download`

Expected: first run reports downloaded/verified nine; second run reports verified nine with no replacement. `git status --ignored --short data/review-corpus` shows the PDFs ignored and only manifest/README trackable.

- [ ] **Step 6: Commit source, tests, manifest and docs but not PDFs**

Run: `git add .gitignore apps/worker/package.json apps/worker/src/download-review-corpus.ts apps/worker/src/import-review-corpus.ts data/review-corpus/manifest.json data/review-corpus/README.md tests/docs/local-trial.test.ts && git diff --cached --name-only`

Expected: no `.pdf`, `.partial`, checksum output, key, or environment file appears.

Run: `git commit -m "feat(worker): add curated open-paper corpus"`

### Task 5: Safe desktop and optional trusted-LAN start modes

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `tests/docs/local-trial.test.ts`

- [ ] **Step 1: Extend the failing config tests**

Assert default Web development and production commands bind `127.0.0.1`; LAN commands exist separately, bind only Web to `0.0.0.0`, and call a warning wrapper before starting. Assert operations text keeps PostgreSQL/Redis on loopback, warns there is no login, gives `http://127.0.0.1:3000`, explains private-network-only firewall choice and campus client isolation, and supplies stop/restart commands.

- [ ] **Step 2: Run the test and record the red result**

Run: `pnpm vitest run tests/docs/local-trial.test.ts`

Expected: FAIL on missing localhost/LAN script boundaries and operations content.

- [ ] **Step 3: Add minimal scripts and documentation**

Use Next CLI `-H 127.0.0.1` for local development and the standalone server's `HOSTNAME=127.0.0.1` for production. Add explicit `dev:lan`/`start:lan` wrappers that print the no-login warning and set only the Web hostname to `0.0.0.0`; do not change database URLs, Redis URLs, firewall, network profile, or Compose ports. Document that no AI key is required for facts and that exactly one named provider key may later be placed in ignored `.env`.

- [ ] **Step 4: Run focused tests and package checks**

Run: `pnpm vitest run tests/docs/local-trial.test.ts tests/docs/operations.test.ts && pnpm --filter @pri/web typecheck && pnpm --filter @pri/web lint`

Expected: tests PASS; Web typecheck/lint exit 0.

- [ ] **Step 5: Commit local access modes**

Run: `git add apps/web/package.json package.json .env.example README.md docs/operations.md tests/docs/local-trial.test.ts && git commit -m "docs(ops): add safe local trial workflow"`

### Task 6: Real local database import and desktop browser acceptance

**Files:**
- No production source changes expected; record evidence in `progress.md` and `findings.md`.

- [ ] **Step 1: Verify service binding before mutation**

Inspect Docker Compose expansion and active listeners. PostgreSQL 5432 and Redis 6379 must resolve to `127.0.0.1`. If old containers still bind `0.0.0.0`, stop before LAN mode and recreate only the named PRI Compose services after recording their exact project/container identity; do not touch unrelated containers.

- [ ] **Step 2: Back up existing personal trial data before import**

Use the documented custom-format `pg_dump`, copy it to ignored `backups/`, compute SHA-256, and verify `pg_restore --list` can read it. Do not commit the dump.

- [ ] **Step 3: Apply existing migrations and import twice**

Run: `pnpm --filter @pri/db prisma:generate`, `pnpm --filter @pri/db prisma:validate`, `pnpm --filter @pri/db prisma:deploy`, then run `pnpm --filter @pri/worker corpus:import` twice.

Expected: all four existing migrations are applied; both runs complete; the second creates no duplicate `PaperSource` records.

- [ ] **Step 4: Start Web and worker in local-only mode**

Start dependencies, Web and one worker with `DAILY_PIPELINE_ENABLED=false`. Report the actual available desktop URL, normally `http://127.0.0.1:3000`, and verify `/api/health/live` is 200 plus `/api/health/ready` reflects the intentionally disabled scheduler safely.

- [ ] **Step 5: Perform real desktop browser checks**

Open the local page in the in-app browser. Verify Today renders real titles/public facts, a detail page discloses arXiv source and missing AI interpretation, interest changes alter deterministic ordering where classifications exist or preserve truthful cold-start behavior where they do not, and reading states cycle through saved/reading/complete/skipped. Capture no sensitive settings and commit no screenshot.

- [ ] **Step 6: Attempt optional LAN access only if safe**

After loopback verification for PostgreSQL/Redis, start the explicit LAN Web command, determine the private IPv4 address without changing firewall, and report the candidate URL. If campus Wi-Fi isolation or Windows Firewall blocks it, leave desktop mode running and record the limitation; do not create a public tunnel.

### Task 7: Full verification, review, traceability and push

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-08-27-physics-research-intelligence-mvp.md`

- [ ] **Step 1: Update tracked planning and evidence files**

Record every TDD red/green command and count, the nine real paper identifiers and checksums, import replay counts, browser URL/result, LAN attempt, backup checksum location (not its contents), known limitations, and the remaining manual 30-paper evaluation. Mark only genuinely completed MVP items complete.

- [ ] **Step 2: Run complete automated verification**

Run full Vitest with the dedicated PostgreSQL test schema, full Playwright, Prisma generate/validate/migration status, workspace lint/typecheck, Web production build, worker production build, standalone static-resource checks, and `git diff --check`.

Expected: every command exits 0; Playwright remains fixture-only and makes no real source/provider calls.

- [ ] **Step 3: Clean generated artifacts and test business data**

Remove only generated `.next`, worker `dist`, Playwright outputs, screenshots, `.partial` files and `*.tsbuildinfo` inside this worktree. Delete business fixture rows from dedicated test schemas while preserving `_prisma_migrations`. Keep the intentionally downloaded ignored corpus PDFs for human review.

- [ ] **Step 4: Perform local code review and fix all serious/warning findings with TDD**

Review the complete stage diff for path traversal, redirect bypass, partial-file corruption, unbounded response memory, checksum race, logging of abstracts/secrets, production database/test crossover, duplicate import, process cleanup and LAN exposure. For each finding, add a failing regression test, implement the smallest fix, and rerun the affected suite.

- [ ] **Step 5: Scan staged content and create the final Conventional Commit**

Stage only stage-related source/tests/docs/manifest. Confirm staged paths contain no `.env`, key/token/credential values, PDF, database dump, `.next`, `dist`, Playwright output, screenshot, `*.tsbuildinfo`, or test database content. Run `git diff --cached --check`, then commit with a message matching the actual remaining diff, such as `feat(trial): add local real-paper workflow`.

- [ ] **Step 6: Push without merging or rewriting other branches**

Run: `git push -u origin codex/stage-6-local-trial`

Expected: the stage branch is published for review. Do not force-push, delete, rewrite, merge, or modify any other branch/worktree.

## Self-review result

- Spec coverage: all goals, non-goals, access modes, nine-paper acquisition/storage, repository import, no-key AI behavior, local run, recovery, fixture-only tests, browser acceptance and manual actions map to Tasks 1–7.
- Completeness scan: every implementation and error path has an explicit test and command; no unfinished marker or deferred code step remains.
- Type consistency: `ReviewCorpusManifest`, `ReviewCorpusEntry`, `parseReviewCorpusManifest`, `toPaperSourceInput`, `downloadCorpusEntry`, and `importReviewCorpus` are introduced once and used consistently; database writes remain behind the existing `PaperRepository`.
