# Bilingual README and Kimi Trial Design

## Status

Approved in conversation on 2026-09-01. This design covers the public project presentation and the first real-model trial. It does not add PDF upload, full-text extraction, paper chat, or RAG.

## Goal

Update the repository presentation in complete Chinese and English, then run a reproducible local trial in which three papers from `data/journal-corpus` are imported from public metadata and abstracts, classified, interpreted with a user-configured Kimi connection, displayed in the application, and reviewed by a human.

## Documentation and GitHub presentation

The root README will contain a complete Chinese section followed by a complete English section. Both sections will distinguish implemented MVP behavior from planned work and will cover:

- the product purpose and current MVP capabilities;
- a concise Web, worker, PostgreSQL, Redis, and AI-provider architecture;
- zero-cost local startup, health checks, and the model settings page;
- safe Kimi setup without showing or committing a real API key;
- the role of the 45-entry local `data/journal-corpus` manifest and the selected three-paper trial;
- the fact that the current AI pipeline sends public metadata and abstracts only and does not read or transmit local PDF bytes;
- trial steps, acceptance criteria, privacy and cost boundaries;
- known limitations and the later PDF-reading and RAG roadmap.

GitHub repository metadata will be updated after the README is verified. The About description will be a concise Chinese-English project summary. Topics will be `physics`, `research`, `papers`, `ai`, `literature-review`, `nextjs`, `typescript`, `postgresql`, and `prisma`. The Homepage field will remain empty because there is no public deployment URL.

## Trial corpus

The first comparison uses these three manifest entries:

1. `2504.21524v1` — *Levitated Sensor for Magnetometry in Ambient Environment*;
2. `2410.10611v2` — *A phase microscope for quantum gases*;
3. `2408.15441v2` — *Tracking the baryon number with nuclear collisions*.

The selection spans precision measurement, quantum gases, and nuclear physics. It is intended to reveal classification and interpretation differences across fields without creating a costly batch run.

## Architecture and data flow

1. A small-batch local-corpus entry point reads `data/journal-corpus/manifest.json` and accepts an explicit allowlist of arXiv IDs.
2. Strict validation rejects unknown IDs, duplicate selections, malformed records, non-arXiv sources, or missing required public facts.
3. Valid records are mapped to the existing `PaperSourceInput` boundary and written through the existing paper repository. The import is idempotent through the arXiv source-record identity.
4. Existing classification and interpretation jobs receive the stored public title, abstract, journal, and publication date.
5. The existing runtime routing resolves the user-created Kimi connection. Prompts require strict JSON, evidence levels, evidence references, and the disclosure `基于摘要解读`.
6. Structured outputs and AI run attempts are persisted with provider, model, prompt version, provider-reported token counts when available, duration, status, and stable error codes.
7. The paper detail and Today interfaces display the results for human comparison.

PostgreSQL remains the source of truth. Redis and BullMQ remain replaceable operational state. Local PDFs remain in `data/journal-corpus/pdfs/` and are not read by the importer or sent to Kimi during this trial.

## Components and boundaries

### Bilingual README

The README is the public entry point and operational quick start. It links to the detailed operations, evaluation, design, and roadmap documents rather than duplicating every production procedure.

### Journal-corpus manifest parser

The parser owns strict validation of the existing snake_case manifest shape and selected-ID rules. It returns a typed representation and never reads PDF bytes.

### Small-batch importer and command

The importer owns mapping and isolated per-record repository writes. The command owns configuration, database lifecycle, selected IDs, safe summary logging, and exit status. It must not print abstracts, local paths, credentials, or database connection details.

### Existing AI pipeline

The existing provider abstraction, Kimi OpenAI-compatible adapter, connection console, routing, versioned prompts, idempotency, fallback, and audit records are reused. Automated tests use mock providers only.

### Human-guided local run

The user enters the Kimi API key only in the localhost model settings page. The assistant guides one visible action at a time: start dependencies, open the app, save the connection, run the lightweight test, run the synthetic sample, assign routing, import three records, execute AI work, and inspect results.

## Error handling and safety

- Unknown or duplicate selected IDs fail before any database write.
- A malformed manifest fails closed with a validation error.
- One repository failure is isolated and reported with a stable safe code; successful records remain usable.
- Re-running the import converges on the same paper/source records.
- Provider timeout, invalid JSON, schema mismatch, or persistence failure produces a truthful failed AI run. No interpretation is fabricated.
- Logs contain IDs, counts, statuses, durations, and stable error codes only. They exclude abstracts, API keys, ciphertext, database URLs, internal stacks, and PDF paths.
- The real Kimi API is never called by automated tests. A paid real call occurs only after the user saves the connection locally and confirms the connection checks.
- The API key remains in the application form and encrypted local storage. It is never pasted into chat, source files, commands, or Git.

## Testing and verification

Implementation will follow the repository's existing testing patterns:

- parser tests for valid entries, malformed fields, unknown IDs, duplicate IDs, and safe failures;
- importer tests for exact selection, mapping, idempotent repository usage, isolated failures, and log-safe results;
- command-level behavior tests where practical without a real provider;
- existing AI and worker tests to protect strict schemas, abstract-only prompts, routing, and audit behavior;
- targeted tests first, followed by type checking, the full Vitest suite, relevant Playwright coverage, build checks, and `git diff --check` in proportion to the final change.

The manual trial records the outcome for each paper, provider and model, prompt version, provider-reported token usage when available, duration, failure code if any, and a short human quality assessment.

## Acceptance criteria

The trial is complete when:

1. the Kimi lightweight connection test and synthetic-paper sample pass;
2. all three selected public metadata and abstract records are present in PostgreSQL;
3. each paper has a classification and a Chinese structured interpretation while retaining its original English title and abstract;
4. the UI displays research question, innovations, methods and evidence, limitations, reading advice, evidence levels, and the abstract-only source disclosure;
5. AI run audit data exposes model, prompt version, duration, provider-reported tokens when available, and truthful failures without exposing secrets;
6. the three results receive a human comparison, with the expectation that the first run establishes a baseline rather than final academic quality.

## Execution order

1. Implement and verify the bilingual README.
2. Update the GitHub About description and topics.
3. Implement and test the strict three-paper small-batch import path.
4. Verify local PostgreSQL, Redis, configuration, migrations, Web, and worker readiness.
5. Ask the user to enter the Kimi API key in `/settings/models` and complete both connection tests.
6. Assign Kimi as the classification and interpretation primary route.
7. Import the three selected records and execute classification and interpretation.
8. Inspect pages, audit data, cost, and quality with the user.
9. If necessary, version and refine the prompt, then rerun only the intended papers. Full-text features remain a separate design phase.
