# Physics Research Intelligence Local Real-Data Trial Design

**Date:** 2026-08-31  
**Status:** approved direction; implementation pending  
**Scope:** zero-cost personal local use, optional trusted-LAN access, and a traceable open-paper review corpus

## Context

Stages 2–5 are all ancestors of remote `main`; there are no unmerged historical branches. The application already has public-source connectors, a fact repository, deterministic recommendations, optional AI classification/interpretation, daily scheduling, health checks, and browser E2E. The next risk is not missing architecture but the gap between fixtures and a sustained personal trial with real papers.

The user does not currently need a domain or VPS. The first usable deployment is therefore the user's Windows computer, with PostgreSQL and Redis on loopback and the Web available through a browser. Phone/tablet access is useful only when it can be added without weakening the default security boundary.

## Goals

1. Provide a repeatable zero-cost local startup that exposes a real usable page on the computer.
2. Offer an explicit optional trusted-LAN mode for a phone or tablet without making LAN exposure the default.
3. Download one openly accessible official-platform paper for each of the nine existing PhysicsTag directions.
4. Keep a tracked, reviewable metadata manifest while keeping downloaded PDFs out of Git.
5. Import the curated corpus through the existing fact repository so real papers appear in Today and paper detail pages.
6. Preserve the public-fact/AI-interpretation boundary and allow the first trial to work without an API key.

## Non-goals

- No domain, VPS, public tunnel, cloud resource, analytics service, or external logging platform.
- No application authentication or multi-user conversion in this stage.
- No publisher scraping, subscription bypass, bulk campus-library download, or restricted-full-text model input.
- No fabricated classification, interpretation, evaluation score, or review result.
- No database schema or historical migration change unless implementation evidence proves the existing model insufficient.

## Access modes

### Computer mode (default)

- Web binds to `127.0.0.1` and is reachable only from the computer.
- PostgreSQL and Redis remain on loopback.
- The documented local URL is `http://127.0.0.1:3000` unless the port is already occupied; a changed port must be reported explicitly.
- This is the required acceptance path and must work without a domain, account, or paid service.

### Trusted-LAN mode (optional)

- A separate explicit command binds only the Web process to `0.0.0.0`; PostgreSQL and Redis stay on loopback.
- The application prints or documents the computer's private IPv4 URL for a phone/tablet on the same trusted Wi-Fi or personal hotspot.
- The implementation does not automatically open Windows Firewall or alter network profiles. If Windows prompts, the user may allow only private networks.
- Campus Wi-Fi client isolation may prevent device-to-device access. Failure of LAN access does not fail the stage if computer mode passes.
- LAN mode must carry a warning that the application has no login and must not be used on an untrusted/shared network.

Tailscale or another authenticated private overlay is deferred. It is preferable to a public tunnel if remote personal access becomes necessary, but it requires external installation and sign-in.

## Curated open-paper corpus

### Coverage

Select nine papers, one primary paper for each existing tag:

1. atomic, molecular and optical physics;
2. condensed matter;
3. materials physics;
4. high-energy physics;
5. nuclear physics;
6. astrophysics;
7. plasma physics;
8. biophysics;
9. cross-disciplinary physics.

Papers should preferably be recent enough for the trial while remaining understandable from a public abstract. Selection diversity matters more than citation counts. The manifest assigns a review-target tag for coverage planning; it does not create a model classification or claim correctness.

### Acquisition rules

- Use an official open repository, initially arXiv, and prefer the canonical abstract and PDF URLs.
- Record title, authors, abstract, submitted/published date, arXiv ID, DOI when available, primary category, canonical URLs, license URL or repository reuse statement, retrieval timestamp, and intended review-target tag.
- Download only when the official record exposes the PDF without authentication or access-control bypass.
- Rate-limit requests and use a descriptive User-Agent where supported.
- Reject HTML error pages, oversized responses, non-PDF content, redirects to non-approved hosts, and duplicate identifiers.
- Compute SHA-256 and byte length after download so local files can be verified.

### Storage layout

- `data/review-corpus/manifest.json` is tracked and contains public metadata plus local relative PDF names and checksums.
- `data/review-corpus/pdfs/` contains downloaded PDFs and is ignored by Git.
- A short README in the corpus directory explains licensing, redownload, verification, and the prohibition on committing PDFs.
- The downloader is idempotent: an existing file with the expected checksum is reused; a mismatched file is not silently overwritten.

## Import boundary

Add a worker-side review-corpus import command rather than inserting rows from a page or ad-hoc SQL.

1. Read and strictly validate the tracked manifest, rejecting unknown fields and duplicate arXiv IDs/source record IDs.
2. Convert each record to the existing `SourcePaperInput` shape.
3. Call the existing `PaperRepository.upsertFromSource` with `sourceName=arxiv`, the official identifier, public metadata/abstract, original URL, access status, and license URL.
4. Do not read PDF bytes during import and do not persist a local PDF path in the database.
5. Report stable per-record outcomes and a final inserted/updated/failed summary without logging secrets or full abstracts.
6. Re-running the import must not create duplicate Paper or PaperSource rows.

The review-target tag remains manifest metadata until the real classification pipeline runs. The importer must not write a fake PaperClassification merely to improve the UI.

## AI behavior

The first local page must work without any model key:

- Real public facts and abstracts are visible.
- Today can recommend using freshness and existing deterministic fallback behavior.
- Paper detail clearly reports missing AI interpretation.

For a later real interpretation trial, the user sets exactly one named provider variable in the local ignored `.env`. Keys must not be pasted into chat, command output, the manifest, logs, screenshots, or Git. Classification/interpretation continue to consume title, public metadata, and abstract only; downloaded PDFs remain for human review.

## Local run flow

1. Verify local PostgreSQL and Redis are healthy and loopback-only for the new run.
2. Apply existing migrations to a dedicated local trial schema/database boundary.
3. Download/verify the nine open PDFs and import their manifest metadata.
4. Start one worker and one Web process with daily automation disabled for the interactive trial unless explicitly enabled.
5. Open the computer URL and verify Today, interests, detail, source disclosure, and reading states.
6. Optionally start trusted-LAN mode and attempt a phone/tablet connection without exposing database ports.

The run instructions must include stop/restart commands and identify which data is persistent.

## Error handling and safety

- A failed paper download does not delete or corrupt already verified files.
- A partial corpus import reports failures and can be safely re-run.
- Network and provider failures must not make the whole Today page permanently unavailable.
- No downloader or trial command may use production credentials or a production database.
- The actual local Web page may call real official sources only during an explicit acquisition/import step; automated tests remain fixture-only and block real providers.
- The current old Compose containers expose database ports on all interfaces. Before optional LAN mode, recreate them from the checked-in loopback Compose configuration or otherwise verify PostgreSQL/Redis are not reachable from the LAN.

## Testing strategy

Follow TDD for all behavior changes:

- Manifest schema tests: unknown fields, duplicates, invalid URL/host/license, checksum and excessive size.
- Downloader tests: mock HTTP only, PDF signature/content type, redirects, idempotent reuse, mismatch refusal, timeout and 429/5xx handling.
- Importer unit tests: strict conversion, no PDF read, stable summary and safe logging.
- PostgreSQL integration test: first import plus replay produces the expected real-metadata facts without duplicates, then cleans the dedicated test schema.
- Script/config tests: localhost is default; LAN binding requires an explicit command and warning.
- Playwright remains fixture-only. A separate manual browser trial verifies real imported data on desktop and, when the network permits, mobile/LAN.

## Acceptance criteria

- All historical branches remain merged into main and no unrelated workspace content is modified.
- Nine official open-paper PDFs are present locally, checksum-verified, and ignored by Git.
- The tracked manifest covers all nine PhysicsTag directions without invented review scores.
- Repeated download and import runs are idempotent.
- Real papers appear on Today and detail pages on the computer at a reported local URL.
- Interests and reading-state controls operate on the real imported papers.
- The page remains usable without an API key and truthfully discloses missing AI output.
- Optional LAN access is documented and attempted only after database/Redis loopback verification.
- Full Vitest, PostgreSQL integration, Playwright, Prisma, lint, typecheck and production builds pass; generated artifacts and business fixtures are cleaned.

## Manual user actions

- If Windows Firewall blocks optional LAN access, the user decides whether to allow the Web process on private networks only.
- If real AI interpretation is desired, the user places one provider key in the ignored local `.env`; no key is required for corpus download, import, or fact browsing.
- Human reviewers fill the 30-paper evaluation rubric. The nine-paper starter corpus supplies material but does not fabricate those judgments.

