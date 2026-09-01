# Bilingual README and Kimi Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use a real provider in automated tests, and pause for the user before every paid API action.

**Goal:** Publish an accurate bilingual project introduction and add a reproducible, safe three-paper Kimi trial that uses public metadata and abstracts only.

**Architecture:** Keep the existing Next.js Web, worker, PostgreSQL, Redis/BullMQ, provider routing, prompts, budgets, and audit models. Add a strict parser and importer for the existing local journal manifest plus a bounded CLI that resolves the saved Kimi route and invokes the existing classification and interpretation jobs for explicitly selected arXiv IDs. Local PDF bytes remain outside the application and model boundary.

**Tech Stack:** TypeScript 5.9, Node.js 22+, pnpm 11, Zod, Prisma/PostgreSQL, existing `@pri/ai` Kimi adapter, Vitest, Playwright, GitHub CLI.

---

## File map

- `README.md`: complete Chinese and English public project introduction and trial guide.
- `.gitignore`: retain the existing rule that excludes `data/journal-corpus/pdfs/`.
- `data/journal-corpus/README.md`: tracked corpus provenance, verification, and usage boundary.
- `data/journal-corpus/manifest.json`: tracked 45-entry public metadata manifest; no PDF bytes.
- `tests/docs/local-trial.test.ts`: executable assertions for bilingual docs, corpus tracking boundary, and commands.
- `apps/worker/src/journal-corpus/manifest.ts`: strict manifest schema, selected-ID validation, and mapping to `PaperSourceInput`.
- `apps/worker/src/journal-corpus/importer.ts`: idempotent per-record repository import with safe outcomes.
- `apps/worker/src/journal-corpus/trial.ts`: dependency-injected classification/interpretation loop for imported papers.
- `apps/worker/src/import-journal-corpus-trial.ts`: local CLI orchestration, persisted model routing, providers, budget, and safe logs.
- `apps/worker/src/configured-daily-processor.ts`: export the existing route-to-provider and route-to-price helpers for reuse without changing daily behavior.
- `apps/worker/package.json`: expose one explicit `corpus:journal:trial` command.
- `tests/worker/journal-corpus-manifest.test.ts`: strict parser and selection tests.
- `tests/worker/journal-corpus-importer.test.ts`: mapping, selection, idempotency-boundary, and safe-error tests.
- `tests/worker/journal-corpus-trial.test.ts`: three-paper task sequencing and failure-isolation tests using mocks only.
- `docs/trials/2026-09-01-kimi-abstract-trial.md`: created only after the real run, containing actual non-secret results and the human assessment.

## Task 1: Replace the public README with a verified bilingual introduction

**Files:**
- Modify: `tests/docs/local-trial.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add a failing bilingual README contract test**

Add this test inside the existing `describe("local real-data trial boundary", ...)` block:

```ts
it("publishes a bilingual MVP and Kimi abstract-trial guide", async () => {
  const readme = await readFile("README.md", "utf8");

  expect(readme).toContain("# Physics Research Intelligence");
  expect(readme).toContain("## 中文");
  expect(readme).toContain("## English");
  expect(readme).toMatch(/45 篇|45 papers/);
  expect(readme).toContain("2504.21524v1");
  expect(readme).toContain("2410.10611v2");
  expect(readme).toContain("2408.15441v2");
  expect(readme).toMatch(/Kimi/);
  expect(readme).toMatch(/公开元数据与摘要|public metadata and abstracts/);
  expect(readme).toMatch(/不读取.*PDF|does not read.*PDF/is);
  expect(readme).toContain("http://127.0.0.1:3000/settings/models");
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```powershell
pnpm vitest run tests/docs/local-trial.test.ts
```

Expected: FAIL because the current README does not contain the complete bilingual structure and selected trial IDs.

- [ ] **Step 3: Rewrite `README.md` in two complete language sections**

Use this exact top-level structure and keep Chinese and English claims aligned:

```markdown
# Physics Research Intelligence

> 面向个人物理研究的可解释论文情报平台。An explainable paper-intelligence platform for personal physics research.

[中文](#中文) · [English](#english)

## 中文

### 项目简介
### MVP 当前能力
### 系统架构
### 零成本本地启动
### Kimi 模型接入
### 首次三论文试运行
### 数据与安全边界
### 验证与测试
### 已知限制
### 路线图与文档

## English

### Overview
### Current MVP capabilities
### Architecture
### Zero-cost local start
### Kimi model setup
### First three-paper trial
### Data and safety boundaries
### Verification and tests
### Known limitations
### Roadmap and documentation
```

The architecture section must describe this implemented flow without claiming PDF support:

```text
Public sources / local public manifest
  -> worker ingestion and AI jobs
  -> PostgreSQL facts, interpretations, and audit records
  -> Next.js Today and paper-detail pages

Redis/BullMQ holds replaceable queue state.
The saved Kimi API key is encrypted locally and is never returned to the browser.
```

The trial section must name the three approved IDs and titles, label the run as public-metadata-and-abstract-only, and link to the journal corpus README and the approved design. Keep production deployment details linked to `docs/operations.md` rather than duplicating the full operations guide.

- [ ] **Step 4: Run the documentation tests**

Run:

```powershell
pnpm vitest run tests/docs/local-trial.test.ts tests/docs/operations.test.ts
```

Expected: both test files PASS.

- [ ] **Step 5: Review wording for implemented-versus-planned accuracy**

Run:

```powershell
rg -n "已完成|implemented|计划|planned|PDF|全文|full text|Kimi" README.md
git diff --check -- README.md tests/docs/local-trial.test.ts
```

Expected: PDF/full-text statements remain limitations or future work; no whitespace errors.

- [ ] **Step 6: Commit the bilingual README**

```powershell
git add -- README.md tests/docs/local-trial.test.ts
git commit -m "docs: publish bilingual project introduction"
```

## Task 2: Track the reproducible metadata boundary without committing PDFs

**Files:**
- Modify: `.gitignore`
- Modify: `tests/docs/local-trial.test.ts`
- Add: `data/journal-corpus/README.md`
- Add: `data/journal-corpus/manifest.json`

- [ ] **Step 1: Extend the existing corpus-boundary test**

Add this test:

```ts
it("tracks a 45-paper journal manifest while excluding local PDFs", async () => {
  const [gitignore, rawManifest, corpusReadme] = await Promise.all([
    readFile(".gitignore", "utf8"),
    readFile("data/journal-corpus/manifest.json", "utf8"),
    readFile("data/journal-corpus/README.md", "utf8"),
  ]);
  const manifest = JSON.parse(rawManifest) as Array<{ arxiv_id: string; pdf_file: string }>;

  expect(gitignore).toContain("data/journal-corpus/pdfs/");
  expect(manifest).toHaveLength(45);
  expect(new Set(manifest.map(({ arxiv_id }) => arxiv_id)).size).toBe(45);
  expect(manifest.every(({ pdf_file }) => pdf_file.endsWith(".pdf"))).toBe(true);
  expect(corpusReadme).toMatch(/不得.*Git|must not.*Git/is);
  expect(corpusReadme).toMatch(/元数据.*摘要|metadata.*abstract/is);
});
```

Run:

```powershell
pnpm vitest run tests/docs/local-trial.test.ts
```

Expected: the code-level assertions pass locally; Step 3 separately enforces the Git tracking boundary.

- [ ] **Step 2: Preserve the existing PDF ignore rule and stage only reproducible metadata**

The retained `.gitignore` lines must be:

```gitignore
# Journal full-text corpus for AI reading / RAG (metadata remains tracked)
data/journal-corpus/pdfs/
```

Do not stage `data/journal-corpus/pdfs/`, `candidates.json`, `science_arxiv_meta.json`, or `scripts/` in this task.

- [ ] **Step 3: Verify the exact staged corpus files**

Run:

```powershell
git add -- .gitignore tests/docs/local-trial.test.ts data/journal-corpus/README.md data/journal-corpus/manifest.json
git diff --cached --check
git diff --cached --name-only
git check-ignore -v data/journal-corpus/pdfs/2504.21524v1.pdf
```

Expected staged list: exactly `.gitignore`, `tests/docs/local-trial.test.ts`, `data/journal-corpus/README.md`, and `data/journal-corpus/manifest.json`. `git check-ignore` must identify the journal PDF rule.

- [ ] **Step 4: Commit the metadata boundary**

```powershell
git commit -m "data: add journal corpus metadata manifest"
```

## Task 3: Add strict journal-manifest parsing and selected-ID mapping

**Files:**
- Create: `tests/worker/journal-corpus-manifest.test.ts`
- Create: `apps/worker/src/journal-corpus/manifest.ts`

- [ ] **Step 1: Write failing parser and selection tests**

Cover the real snake_case shape, strict unknown-field rejection, versioned arXiv IDs, duplicate requested IDs, unknown requested IDs, requested-order preservation, and mapping that marks access as `UNKNOWN` and never exposes `pdf_file`.

Use this core expectation:

```ts
const selected = selectJournalCorpusEntries(parseJournalCorpusManifest([entry()]), [
  "2504.21524v1",
]);
const input = toJournalPaperSourceInput(selected[0]!, new Date("2026-09-01T00:00:00Z"));

expect(input).toEqual(expect.objectContaining({
  sourceName: "arxiv",
  sourceRecordId: "2504.21524v1",
  sourceUrl: "https://arxiv.org/abs/2504.21524v1",
  abstract: expect.any(String),
  accessStatus: "UNKNOWN",
}));
expect(JSON.stringify(input)).not.toContain("2504.21524v1.pdf");
```

- [ ] **Step 2: Run the new test and verify the module is missing**

```powershell
pnpm vitest run tests/worker/journal-corpus-manifest.test.ts
```

Expected: FAIL because `apps/worker/src/journal-corpus/manifest.ts` does not exist.

- [ ] **Step 3: Implement the strict manifest module**

Define and export these exact public boundaries:

```ts
export type JournalCorpusEntry = z.infer<typeof journalCorpusEntrySchema>;

export function parseJournalCorpusManifest(value: unknown): JournalCorpusEntry[];
export async function readJournalCorpusManifest(path: string): Promise<JournalCorpusEntry[]>;
export function selectJournalCorpusEntries(
  manifest: readonly JournalCorpusEntry[],
  requestedIds: readonly string[],
): JournalCorpusEntry[];
export function toJournalPaperSourceInput(
  entry: JournalCorpusEntry,
  retrievedAt: Date,
): PaperSourceInput;
```

The strict entry schema must contain exactly these existing fields:

```ts
const journalCorpusEntrySchema = z.object({
  arxiv_id: z.string().regex(/^\d{4}\.\d{4,5}v\d+$/u),
  journal: z.string().trim().min(1),
  title: z.string().trim().min(1),
  journal_ref: z.string().trim().min(1).nullable(),
  doi: z.string().trim().min(1).nullable(),
  published: z.iso.datetime(),
  authors: z.array(z.string().trim().min(1)).min(1),
  primary_category: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  abstract: z.string().trim().min(1),
  pdf_file: z.string().regex(/^[A-Za-z0-9._-]+\.pdf$/u),
  pdf_size: z.number().int().positive().max(50 * 1024 * 1024),
  pdf_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  source: z.literal("arxiv"),
  license_note: z.string().trim().min(1),
}).strict();
```

Selection must reject an empty request, reject duplicate IDs before lookup, reject any ID absent from the manifest, and return entries in requested order. Mapping must use the canonical arXiv abstract URL, the first author, the journal name, DOI when present, public abstract, `licenseUrl: undefined`, and `accessStatus: "UNKNOWN"`. It must not read a PDF or infer an open-content license from `license_note`.

- [ ] **Step 4: Run parser tests and worker type checking**

```powershell
pnpm vitest run tests/worker/journal-corpus-manifest.test.ts
pnpm --filter @pri/worker typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the parser**

```powershell
git add -- apps/worker/src/journal-corpus/manifest.ts tests/worker/journal-corpus-manifest.test.ts
git commit -m "feat(worker): parse selected journal corpus records"
```

## Task 4: Add an idempotent, safe small-batch importer

**Files:**
- Create: `tests/worker/journal-corpus-importer.test.ts`
- Create: `apps/worker/src/journal-corpus/importer.ts`

- [ ] **Step 1: Write failing importer tests**

Use a mocked `PaperRepository["upsertFromSource"]` to prove requested order, exact record count, returned paper IDs, per-record failure isolation, and absence of abstracts/PDF paths in serialized results. Call the importer twice and assert the same source identities are sent both times so repository idempotency remains the single source of truth.

The result contract must be:

```ts
export type JournalCorpusImportResult = {
  outcomes: Array<
    | { arxivId: string; status: "imported"; paperId: string }
    | { arxivId: string; status: "failed"; errorCode: "repository_write_failed" }
  >;
  summary: { total: number; imported: number; failed: number };
};
```

- [ ] **Step 2: Run the importer test and verify it fails**

```powershell
pnpm vitest run tests/worker/journal-corpus-importer.test.ts
```

Expected: FAIL because the importer module does not exist.

- [ ] **Step 3: Implement the importer**

Implement this boundary without logging inside the library function:

```ts
export async function importJournalCorpus(
  entries: readonly JournalCorpusEntry[],
  repository: Pick<PaperRepository, "upsertFromSource">,
  retrievedAt: Date,
): Promise<JournalCorpusImportResult> {
  const outcomes: JournalCorpusImportResult["outcomes"] = [];
  for (const entry of entries) {
    try {
      const { paper } = await repository.upsertFromSource(
        toJournalPaperSourceInput(entry, retrievedAt),
      );
      outcomes.push({ arxivId: entry.arxiv_id, status: "imported", paperId: paper.id });
    } catch {
      outcomes.push({
        arxivId: entry.arxiv_id,
        status: "failed",
        errorCode: "repository_write_failed",
      });
    }
  }
  const imported = outcomes.filter(({ status }) => status === "imported").length;
  return {
    outcomes,
    summary: { total: outcomes.length, imported, failed: outcomes.length - imported },
  };
}
```

- [ ] **Step 4: Run importer, parser, and existing review-corpus regression tests**

```powershell
pnpm vitest run tests/worker/journal-corpus-importer.test.ts tests/worker/journal-corpus-manifest.test.ts tests/worker/review-corpus-importer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the importer**

```powershell
git add -- apps/worker/src/journal-corpus/importer.ts tests/worker/journal-corpus-importer.test.ts
git commit -m "feat(worker): import selected journal corpus records"
```

## Task 5: Add a bounded real-model trial runner and CLI

**Files:**
- Create: `tests/worker/journal-corpus-trial.test.ts`
- Create: `apps/worker/src/journal-corpus/trial.ts`
- Create: `apps/worker/src/import-journal-corpus-trial.ts`
- Modify: `apps/worker/src/configured-daily-processor.ts`
- Modify: `apps/worker/package.json`
- Modify: `tests/docs/local-trial.test.ts`

- [ ] **Step 1: Write failing trial-runner tests with mock functions only**

Define a dependency-injected runner and test all three papers, stable order, one classification failure, one interpretation failure, and continued processing after either failure. Never construct a real provider in this test.

Use this result contract:

```ts
export type JournalCorpusTrialResult = {
  outcomes: Array<{
    arxivId: string;
    paperId: string;
    classification: { status: string; runId?: string; errorCode?: string };
    interpretation: { status: string; runId?: string; errorCode?: string };
  }>;
  summary: {
    total: number;
    classificationComplete: number;
    interpretationComplete: number;
    failed: number;
  };
};
```

Count `complete` and `duplicate` as successful for reruns. Count a paper as failed when either logical task is `failed` or `skipped`.

- [ ] **Step 2: Run the trial test and verify it fails**

```powershell
pnpm vitest run tests/worker/journal-corpus-trial.test.ts
```

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the dependency-injected trial loop**

Expose this signature:

```ts
export async function runJournalCorpusTrial(input: {
  papers: readonly { arxivId: string; paperId: string }[];
  classify(paperId: string): Promise<ClassifyPaperOutcome>;
  interpret(paperId: string): Promise<InterpretPaperOutcome>;
}): Promise<JournalCorpusTrialResult>;
```

For each selected paper, call classification and interpretation once each, store only stable result fields, and continue to the next paper after a logical failure. Unexpected thrown errors must be converted by the CLI to `trial_runtime_error`; they must not be serialized with stacks or inputs.

- [ ] **Step 4: Export the existing task-provider helpers for CLI reuse**

In `apps/worker/src/configured-daily-processor.ts`, rename and export the existing private helpers without changing behavior:

```ts
export function createTaskProviders(
  route: RuntimeAiTaskRoute,
  createProvider: typeof createConnectionProvider,
) { /* existing taskProviders body */ }

export function createTaskPrices(route: RuntimeAiTaskRoute): ProviderPrices {
  /* existing taskPrices body */
}
```

Update the two internal call sites to use the exported names. Existing `tests/worker/configured-daily-processor.test.ts` must remain green.

- [ ] **Step 5: Implement the local CLI orchestration**

`apps/worker/src/import-journal-corpus-trial.ts` must:

1. load `.env` without printing it;
2. require one or more positional arXiv IDs;
3. parse the server config and manifest;
4. select records and resolve persisted model routing before database writes;
5. create the Kimi providers from the resolved classification and interpretation routes;
6. synchronize physics tags, import selected public facts, and run AI only for successful imports;
7. print one `toLogSafeData` JSON summary containing IDs, statuses, run IDs, counts, and stable error codes;
8. disconnect the Prisma client in `finally`;
9. set a nonzero exit code when import or AI outcomes fail.

The script entry must remain fixed and non-secret:

```json
{
  "corpus:journal:trial": "tsx src/import-journal-corpus-trial.ts"
}
```

The guided invocation will be:

```powershell
pnpm --filter @pri/worker corpus:journal:trial -- 2504.21524v1 2410.10611v2 2408.15441v2
```

No command-line argument may contain an API key. The CLI must use the encrypted connection saved through `/settings/models`.

- [ ] **Step 6: Extend the docs command contract**

Add to `tests/docs/local-trial.test.ts`:

```ts
expect(workerPackage.scripts["corpus:journal:trial"])
  .toBe("tsx src/import-journal-corpus-trial.ts");
```

Update both README language sections with the exact guided command and the statement that it runs paid calls only after the local Kimi route is configured.

- [ ] **Step 7: Run all targeted trial tests and type checking**

```powershell
pnpm vitest run tests/worker/journal-corpus-manifest.test.ts tests/worker/journal-corpus-importer.test.ts tests/worker/journal-corpus-trial.test.ts tests/worker/configured-daily-processor.test.ts tests/worker/runtime-ai-config.test.ts tests/worker/classify-paper.test.ts tests/worker/interpret-paper.test.ts tests/docs/local-trial.test.ts
pnpm --filter @pri/worker typecheck
```

Expected: PASS with zero real network calls.

- [ ] **Step 8: Commit the bounded trial command**

```powershell
git add -- apps/worker/src/journal-corpus/trial.ts apps/worker/src/import-journal-corpus-trial.ts apps/worker/src/configured-daily-processor.ts apps/worker/package.json tests/worker/journal-corpus-trial.test.ts tests/docs/local-trial.test.ts README.md
git commit -m "feat(worker): add bounded Kimi corpus trial"
```

## Task 6: Verify, review, publish README, and update GitHub metadata

**Files:**
- Verify all files changed in Tasks 1–5
- External update: `Qiqi532/Physics-Research-Intelligence` About description and topics

- [ ] **Step 1: Run the fastest relevant complete checks**

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits 0. Automated tests must use mocks and local test databases only.

- [ ] **Step 2: Run final repository safety checks**

```powershell
git diff --check
git status --short --branch
git ls-files data/journal-corpus/pdfs
git log -8 --oneline
```

Expected: `git diff --check` is clean; `git ls-files data/journal-corpus/pdfs` prints nothing; unrelated user files remain unstaged; recent commits match the planned logical groups.

- [ ] **Step 3: Inspect GitHub authentication and current metadata**

```powershell
gh auth status
gh repo view Qiqi532/Physics-Research-Intelligence --json description,homepageUrl,repositoryTopics,url
```

Expected: authenticated access to the intended public repository; homepage remains empty.

- [ ] **Step 4: Push verified commits and update About/topics**

```powershell
git push origin main
gh repo edit Qiqi532/Physics-Research-Intelligence --description "面向个人物理研究的可解释 AI 论文情报平台 · Explainable AI paper intelligence for personal physics research" --add-topic physics --add-topic research --add-topic papers --add-topic ai --add-topic literature-review --add-topic nextjs --add-topic typescript --add-topic postgresql --add-topic prisma
```

Do not set `--homepage`, do not add a secret, and do not force-push.

- [ ] **Step 5: Verify the public result**

```powershell
gh repo view Qiqi532/Physics-Research-Intelligence --json description,homepageUrl,repositoryTopics,url
git status --short --branch
```

Expected: the bilingual description and nine topics are present, homepage is empty, and local `main` matches `origin/main` apart from pre-existing unrelated working-tree changes.

## Task 7: Run the first guided Kimi trial with the user

**Files:**
- Create after the run: `docs/trials/2026-09-01-kimi-abstract-trial.md`

- [ ] **Step 1: Verify local prerequisites without displaying secrets**

```powershell
Test-Path -LiteralPath .env
docker compose -f infra/docker-compose.yml ps
```

Expected: `.env` exists; PostgreSQL and Redis are running or can be started. Never print `.env`.

- [ ] **Step 2: Start missing local dependencies and apply migrations**

```powershell
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
```

Expected: services are healthy and migrations deploy successfully.

- [ ] **Step 3: Start Web and worker and open the model settings page**

```powershell
pnpm dev
```

Before opening the form, verify the currently available model names and prices against Moonshot AI's official platform documentation because these values can change. Then open `http://127.0.0.1:3000/settings/models`. Ask the user to create a named Kimi connection, confirm the official base URL, select a currently supported Kimi model, enter current prices, and paste the API key only into the local form.

- [ ] **Step 4: Pause for the user to run both paid-safe checks**

The user runs “轻量连通测试” and then “合成论文示例”. Continue only after both report success. If either fails, capture only the visible stable error code and fix configuration without asking for the API key.

- [ ] **Step 5: Pause for the user to assign Kimi routing**

Set the saved Kimi profile as both classification primary and interpretation primary. Leave fallbacks empty for the first baseline unless the user explicitly adds a second provider.

- [ ] **Step 6: Execute the approved three-paper command**

```powershell
pnpm --filter @pri/worker corpus:journal:trial -- 2504.21524v1 2410.10611v2 2408.15441v2
```

Expected: three imports and six logical AI tasks complete or return truthful per-paper failures. The command prints no abstract, PDF path, database URL, or API key.

- [ ] **Step 7: Inspect non-secret AI audit records**

Run this query through the checked-in local PostgreSQL service:

```powershell
docker compose -f infra/docker-compose.yml exec -T postgres psql -U pri -d pri -c 'SELECT s."sourceRecordId", r."runType", r.status AS "runStatus", a.status AS "attemptStatus", a.provider, a.model, r."promptVersion", a."totalTokens", a."durationMs", a."estimatedCostUsd", a."errorCode" FROM "AiRun" r JOIN "AiRunAttempt" a ON a."aiRunId" = r.id JOIN "Paper" p ON p.id = r."paperId" JOIN "PaperSource" s ON s."paperId" = p.id WHERE s."sourceName" = ''arxiv'' AND s."sourceRecordId" IN (''2504.21524v1'', ''2410.10611v2'', ''2408.15441v2'') ORDER BY s."sourceRecordId", r."runType", a.ordinal;'
```

Expected: classification and interpretation audit rows for each selected record with provider/model/prompt/status fields and no secrets.

- [ ] **Step 8: Inspect the three paper pages with the user**

Open the DOI-based paper-detail links exposed by the application and compare:

- research question;
- overview and innovations;
- methods and evidence;
- limitations and reading advice;
- evidence levels and references;
- the exact source disclosure `基于摘要解读`;
- unsupported or overly confident claims.

- [ ] **Step 9: Write the actual trial report**

Create `docs/trials/2026-09-01-kimi-abstract-trial.md` with actual values only. Include the selected IDs/titles, connection profile name but no API key, provider/model, prompt versions, per-task status, tokens, duration, estimated cost, human observations, failures, and the decision for the next prompt iteration. Do not use placeholders and do not copy entire abstracts or model outputs.

- [ ] **Step 10: Verify and commit the trial report**

```powershell
rg -n -i "api[_ -]?key|authorization|bearer|secret" docs/trials/2026-09-01-kimi-abstract-trial.md
git diff --check -- docs/trials/2026-09-01-kimi-abstract-trial.md
git add -- docs/trials/2026-09-01-kimi-abstract-trial.md
git commit -m "docs(trial): record first Kimi abstract evaluation"
git push origin main
```

Expected: the scan contains only explanatory labels and no credential-like value; the report is clean, committed, and published.
