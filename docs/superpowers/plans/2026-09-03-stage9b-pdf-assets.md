# Stage 9B Implementation Plan — Lawful Local PDF Assets

> Date: 2026-09-03
> Branch: `codex/stage-9b-pdf-assets`
> Base: local `main@cfd5086` (contains Stage 9A favorite/retention/selection; a strict superset of `origin/main@9f846f4`)
> Status: approved design; implementation not started
> TDD: one Task per reviewable commit; each Task writes failing tests before the minimal implementation

## Goal

Give the personal library a lawful, auditable local PDF asset layer. Favorited papers whose source license explicitly permits storage are auto-downloaded; any lawful personal PDF can be imported through a local CLI. Every asset carries auditable metadata (provenance, license decision, SHA-256, size, local availability) and follows the existing 30-day / favorite lifecycle without exposing absolute filesystem paths through Web APIs.

## Approved product boundary (from the Stage 9 roadmap)

- PDFs live under a **new ignored personal-library directory**, never under a tracked evaluation corpus.
- Automatic download happens **only when the source license explicitly permits storage**; missing or ambiguous licenses fail closed (no download).
- Restricted publisher full text is **never** auto-harvested, cached, or sent to an AI provider.
- Manual import accepts only a lawful personal PDF; the application never assumes redistribution rights.
- **Removing a favorite does not delete the PDF**; normal retention cleanup deletes it only after the paper becomes expired and unprotected.
- Backups must document database + asset-directory consistency and restoration verification.

## Decisions confirmed this session (D1–D3)

| # | Decision | Chosen value | Notes |
|---|---|---|---|
| D1 | Auto-download scope | **Favorited papers** | Trigger = favorite action + daily backfill scan; see Task 3 |
| D2 | Web scope | Minimal: detail-page "local PDF available" badge + safe download endpoint; no browser upload | Browser upload deferred until auth/CSRF exist |
| D3 | License allowlist | Pure-function decision on `PaperSource.licenseUrl`; missing/ambiguous → no download | See `open-license.ts` |

## Reusable assets (verified in baseline)

- `apps/worker/src/review-corpus/downloader.ts` — proven safe-download pattern: safe filename regex, approved-URL allowlist, `redirect: manual`, `Content-Type: application/pdf`, bounded body, `%PDF` signature, SHA-256, concurrent partial+link write, fail closed.
- `packages/db/prisma/schema.prisma` — `PaperSource.licenseUrl` already exists; `Paper.createdAt` retention index already exists; `UserPaperState.isFavorite/favoritedAt` added in 9A.
- `packages/db/src/paper-repository.ts` — `pruneExpiredPapers` (9A) is the cleanup integration point.
- `apps/web/src/app/api/papers/[doi]/state/route.ts` — favorite-action hook point.
- `apps/worker/src/daily-pipeline.ts` / `configured-daily-processor.ts` — daily orchestration for the backfill stage.
- BullMQ queue infrastructure in `apps/worker/src/queue.ts`.

## Design decisions

### 1. Data model — new `PaperAsset` table (migration #8)

```prisma
enum AssetProvenance { AUTO_DOWNLOAD MANUAL_IMPORT }
enum AssetLicenseDecision { OPEN_ALLOWED NOT_PERMITTED MISSING_OR_AMBIGUOUS }

model PaperAsset {
  id             String   @id @default(uuid()) @db.Uuid
  paperId        String   @db.Uuid
  provenance     AssetProvenance
  licenseDecision AssetLicenseDecision
  licenseUrl     String?
  sourceUrl      String?
  sha256         String
  byteSize       Int
  locallyAvailable Boolean @default(false)
  errorCode      String?
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)

  paper Paper @relation(fields: [paperId], references: [id], onDelete: Cascade)

  @@unique([paperId])            // at most one PDF asset per paper
  @@index([locallyAvailable])
}
```

- `sha256` is mandatory; `byteSize` is mandatory and bounded by `PAPER_PDF_MAX_BYTES`.
- One asset row per paper (`@@unique([paperId]`) — re-import/download updates the row, does not duplicate.
- `errorCode` records a stable failure code (e.g. `unapproved_license`, `unsafe_pdf_url`, `checksum_mismatch`, `download_failed`) so failures are observable and retryable.
- Never store an absolute filesystem path in the database or expose one through Web APIs.

### 2. Storage directory

- New directory `data/personal-library/pdfs/`, added to `.gitignore` (pattern `data/personal-library/`).
- File name: `<paperId>.pdf` (validated against `/^[0-9a-f-]{36}\.pdf$/u` — UUID from `Paper.id`), preventing path traversal and collisions.
- Directory path is configurable via `PERSONAL_LIBRARY_DIR` (default resolves relative to repo root), but the Web API never takes a path from a request.

### 3. License allowlist — `packages/domain/src/open-license.ts`

Pure function `classifyOpenLicense(licenseUrl: string | null | undefined): AssetLicenseDecision`:

- `null`/`undefined`/empty/whitespace → `MISSING_OR_AMBIGUOUS` (fail closed).
- URL parses and host+path hit the explicit allowlist:
  - `creativecommons.org/licenses/by/...` (any version, incl. `by-nc`/`by-sa` are allowed only if the allowlist explicitly includes them — default allow: `by`, `by-sa`, `by-nc`, `by-nc-sa`, `by-nc-nd`? see note) — decision: keep allowlist explicit and versioned; start with the four non-`nd` variants and review.
  - `arxiv.org/licenses/...` explicit arXiv license identifiers.
  - Any other value → `NOT_PERMITTED` or `MISSING_OR_AMBIGUOUS` depending on whether it is a known-but-disallowed license (NOT_PERMITTED) vs unparseable (MISSING_OR_AMBIGUOUS).
- Unit-tested table: missing / empty / malformed URL / disallowed host / allowed CC path / arXiv path / unknown → expected decision. No network access.

### 4. Auto-download scope and source URL policy (Task 3)

- Auto-download only for favorited papers whose source is **arXiv** (`PaperSource.sourceName == "arxiv"`) **and** whose `PaperSource.licenseUrl` classifies as `OPEN_ALLOWED`. Rationale: arXiv provides a stable PDF endpoint (`https://arxiv.org/pdf/{id}`) and explicit license metadata; Crossref/OpenAlex records generally only expose publisher landing pages, which we must not harvest.
- PDF URL is derived from the arXiv id only (`https://arxiv.org/pdf/{sourceRecordId}`), then validated by the downloader allowlist; no arbitrary URL from source records is accepted for auto-download.
- Non-arXiv favorited papers rely on manual import (Task 4).

### 5. Favorite-trigger + backfill (Task 3)

- **Primary trigger:** `POST /api/papers/[doi]/state` setting `isFavorite=true` → after a successful state write, if the paper has an arXiv source with an `OPEN_ALLOWED` license and no existing asset, enqueue an `asset-download` BullMQ job (asynchronous; the state response never blocks on download).
- **Backfill:** a new "asset backfill" stage in the daily pipeline scans `UserPaperState.isFavorite == true` papers that have no `PaperAsset`, classifies the license, and enqueues/downloads the eligible ones (idempotent; retries failures from prior days).
- **Idempotency:** job checks for an existing `PaperAsset` row before downloading; download uses partial+link atomic write; a second run converges to the same asset.
- **Failures:** write stable `errorCode`, do not auto-retry forever; the daily backfill retries next day; un-favorite → re-favorite can also re-trigger.

### 6. Manual import CLI — `apps/worker/src/manual-import-pdf.ts` (Task 4)

- Usage: `tsx apps/worker/src/manual-import-pdf.ts --doi <DOI> --pdf <local-path>` (or `--paperId`).
- Flow: resolve paper → validate file exists / `%PDF` signature / size ≤ `PAPER_PDF_MAX_BYTES` / compute SHA-256 → copy into `data/personal-library/pdfs/<paperId>.pdf` (atomic) → upsert `PaperAsset` row with `provenance=MANUAL_IMPORT`, `licenseDecision` recorded from the CLI-supplied `--license` note (default `MISSING_OR_AMBIGUOUS` unless provided).
- Errors: unknown paper, unsafe path, not a PDF, oversized, checksum/storage failure — all stable codes, exit non-zero.
- Re-import of the same paper updates the existing row (and overwrites the file only after checksum confirm).

### 7. Lifecycle integration — extend `pruneExpiredPapers` (Task 5)

- When a paper is deleted because it is expired and not favorited, also delete its PDF file from the personal-library directory (bounded, best-effort; a file-delete failure logs a stable code but does not make Today unavailable or roll back the DB delete).
- Regression guarantees: **un-favoriting does not delete the PDF**; favorited papers (and their assets) are retained; deleting a paper cascades the asset row and removes the file; repeated cleanup in the same window converges.
- Asset file without a DB row (orphan) is reportable via a read-only command, not auto-deleted.

### 8. Minimal Web surface — badge + safe download endpoint (Task 6)

- Paper detail presentation adds `localPdfAvailable: boolean` (from `PaperAsset.locallyAvailable`); badge shown only when true.
- `GET /api/papers/[doi]/asset`: looks up the asset row, refuses when not locally available, streams the fixed file `data/personal-library/pdfs/<paperId>.pdf` as `application/pdf` with `Content-Disposition: inline`. No path from the request is used for file resolution; no absolute path is returned.
- Browser upload is explicitly out of scope for 9B.

### 9. Config (Task 7)

- `.env.example`: `PERSONAL_LIBRARY_DIR` (optional, default `data/personal-library/pdfs`), `PAPER_PDF_MAX_BYTES` (default 50 MiB). Strict parse, positive bounded integers, reject malformed values (mirror `PAPER_RETENTION_DAYS` style).

### 10. Backup consistency (Task 7)

- `docs/operations.md`: a valid backup = PostgreSQL custom-format dump **plus** a copy of `data/personal-library/pdfs/`; restore drill verifies both, including a SHA-256 spot check against `PaperAsset`.

## Task breakdown (each Task = failing tests → minimal implementation → targeted gate → commit)

### Task 1 — Asset model, migration, repository
- Files: `packages/db/prisma/schema.prisma`; a new Prisma migration generated by Prisma (name starts with the date `20260903` and contains `add_paper_asset`); new `packages/db/src/asset-repository.ts`; `packages/db/src/index.ts` exports.
- Failing tests (`tests/db/asset-repository.test.ts`): create row; duplicate `paperId` rejected; cascade delete with paper; strict enum/field validation; `locallyAvailable`/`errorCode` update; byte-size bound.
- Apply migration only in a dedicated test schema (e.g. `pri_stage9b_test`); verify with Prisma generate/validate/status.
- Commit message: `feat(db): add paper asset model and repository`.

### Task 2 — License allowlist + safe downloader
- Files: new `packages/domain/src/open-license.ts` (+ `packages/domain` export); new `apps/worker/src/personal-library/downloader.ts`; export from `@pri/domain`.
- Failing tests:
  - `tests/domain/open-license.test.ts`: missing/empty/malformed/disallowed host/allowed CC path/allowed arXiv path/unknown → expected decision table.
  - `tests/worker/personal-library-downloader.test.ts`: unsafe filename rejected; unapproved URL rejected; HTML-masquerading-as-PDF rejected (`wrong_content_type`/`invalid_pdf`); checksum mismatch rejected; size bound; existing-file verification (idempotent); concurrent partial+link race converges.
- Reuse the review-corpus downloader internals (factor shared PDF-verification helpers if that keeps both call sites clean).
- Commit message: `feat(assets): add open-license allowlist and safe PDF downloader`.

### Task 3 — Favorite-triggered auto-download + daily backfill
- Files: `apps/web/src/app/api/papers/[doi]/state/route.ts` (enqueue on favorite); `apps/worker/src/queue.ts` (+ new `asset-download` job type); new `apps/worker/src/jobs/download-asset.ts`; `apps/worker/src/configured-daily-processor.ts` + `daily-pipeline.ts` (backfill stage).
- Failing tests:
  - `tests/api/papers-state.test.ts` (or existing state test): favorite=true with arXiv+OPEN_ALLOWED enqueues job; favorite=true with disallowed/missing license does not; favorite=false never enqueues; response does not block on download.
  - `tests/worker/download-asset.test.ts`: job skips when asset exists; downloads when eligible; writes stable errorCode on failure; no real network (mock fetch).
  - `tests/worker/daily-pipeline.test.ts`: backfill scans favorited-without-asset papers and enqueues only eligible ones; idempotent reruns.
- Commit message: `feat(worker): auto-download PDFs for favorited open-license papers`.

### Task 4 — Manual import CLI
- Files: new `apps/worker/src/manual-import-pdf.ts`; export entry in `apps/worker/package.json` scripts if needed.
- Failing tests (`tests/worker/manual-import-pdf.test.ts`, mock fs): unknown paper; unsafe/absolute path; non-PDF file; oversized file; success copies file + writes asset with MANUAL_IMPORT; re-import updates existing row; checksum computed correctly.
- Commit message: `feat(worker): add manual lawful PDF import CLI`.

### Task 5 — Lifecycle & cleanup integration
- Files: `packages/db/src/paper-repository.ts` (`pruneExpiredPapers` + asset-file removal); optional `apps/worker/src/personal-library/orphan-report.ts`.
- Failing tests (`tests/db/paper-repository.test.ts`): delete removes DB asset row and disk file; un-favoriting keeps file; favorited paper with asset retained; repeated cleanup converges; file-delete failure logs stable code without breaking Today.
- Commit message: `fix(db): clean paper assets on retention, keep on un-favorite`.

### Task 6 — Minimal Web surface
- Files: `packages/db/src/today-repository.ts` or `apps/web/src/server/papers.ts` (expose `localPdfAvailable`); `apps/web/src/presentation/paper.ts`; `apps/web/src/app/papers/[doi]/page.tsx` (badge); new `apps/web/src/app/api/papers/[doi]/asset/route.ts`.
- Failing tests: component test for badge visibility only when available; route test for 200/PDF stream, 404/`asset_not_available` when missing; no absolute path leakage. Add 1 desktop + 1 mobile Playwright assertion.
- Commit message: `feat(web): show local PDF availability and safe download endpoint`.

### Task 7 — Config, backups, full gates, review
- Files: `.gitignore` (`data/personal-library/`); `.env.example`; `packages/domain/src/config.ts` (+ config tests); `docs/operations.md`; `docs/daily-automation-development-and-deployment.md` (backup note); `task_plan.md` / `findings.md` / `progress.md` / `README.md`.
- Failing tests: config strict-parse for `PERSONAL_LIBRARY_DIR` and `PAPER_PDF_MAX_BYTES`; `.gitignore` pattern test.
- Full gates: `pnpm lint`, `pnpm typecheck` (all workspaces), `pnpm test` (Vitest + PostgreSQL in dedicated schema), `pnpm test:e2e` (desktop+mobile, dedicated E2E schema, mock provider, no external network), `pnpm build` (Web standalone + worker), Prisma generate/validate/migrate status, `git diff --check`, staged secret scan.
- Local security review: path traversal, URL allowlist, symlink, atomic concurrent writes, log redaction (never log absolute paths / license keys), E2E teardown zero business rows.
- Commit message: `chore(assets): config, backup docs and full verification`.

## Test & acceptance matrix

| Category | Scenario | Acceptance |
|---|---|---|
| License | missing/ambiguous license | never downloads (fail closed) |
| License | allowed CC/arXiv license | downloads |
| Download | HTML masquerading as PDF | rejected, stable code |
| Download | checksum/size mismatch | rejected, stable code |
| Idempotency | job run twice | one asset row, one file |
| Trigger | favorite=true eligible | async job enqueued, response unblocked |
| Trigger | favorite=false / ineligible | no job |
| Backfill | favorited without asset | eligible ones downloaded next day |
| Cleanup | expired non-favorite | DB row + disk file removed |
| Cleanup | un-favorite | PDF kept |
| Cleanup | repeat same window | converges |
| Web | available asset | badge + 200 PDF stream, no absolute path |
| Web | missing asset | no badge; route 404 stable code |
| Security | logs/responses | no absolute paths, no keys, no connection IDs |
| Backup | db + asset dir | restore drill + SHA-256 spot check |

## Human tasks (unchanged, outside 9B code)

- 30-paper cross-direction content review.
- Real-provider first trial run.
- Browser PDF upload only after auth/CSRF boundaries exist.

## Start precondition / next-conversation start

1. This worktree `D:\Physics Research Intelligence\.worktrees\stage-9b-pdf-assets` is based on local `main@cfd5086`; it does not touch `codex/review-manual-pipeline-automation`.
2. First failing test: Task 1 asset-repository row create, before any Prisma change.
3. Do not implement Tasks 2–7 in the same diff as Task 1; do not start Phase 10/11.
4. Keep the facts/interpretation boundary, mock-provider tests, no-real-network automated policy, and no budget estimation.
