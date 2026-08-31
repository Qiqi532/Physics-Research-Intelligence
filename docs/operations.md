# Personal deployment and operations

This guide covers one personal deployment of the Web and worker with PostgreSQL and Redis. It does not create cloud resources, accounts, DNS, TLS certificates, or provider keys.

## Safety boundary

- Keep `.env` server-only and outside Git. Commit only `.env.example`.
- Use a dedicated PostgreSQL database and Redis database. Never point tests at a production URL.
- The ingestion and AI pipelines consume public paper facts only. Restricted full text must not be cached or sent to a model.
- Health responses expose stable component states and error codes, never connection strings, keys, or stacks.
- Back up before upgrades. Test every restore into a separate database before relying on it.

## Prerequisites

- Node.js 22 or newer and pnpm 11.19.0.
- PostgreSQL 17 and Redis 7, or Docker with Compose for the local services in `infra/docker-compose.yml`.
- One supported AI provider key if daily classification and interpretation are enabled.

## First start

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @pri/db prisma:generate
pnpm --filter @pri/db prisma:deploy
pnpm dev
```

Edit `.env` before migration. For the checked-in local Compose services, replace `CHANGE_ME` with the local-only password declared in the Compose file. For any real deployment, create a separate strong password and do not reuse the example.

The development command runs Web and worker together. Stop it with `Ctrl+C`; stop local dependencies with:

```powershell
docker compose -f infra/docker-compose.yml stop postgres redis
```

## Local real-data trial

This is the recommended zero-cost personal deployment. PostgreSQL and Redis in the checked-in Compose file bind to loopback. Before starting, inspect active container port bindings: old containers must not show `0.0.0.0:5432` or `0.0.0.0:6379`. Back up personal data before recreating an old container.

With `.env` configured for the dedicated local database, run existing migrations, verify the nine local open PDFs, and import their public metadata:

```powershell
pnpm --filter @pri/db prisma:deploy
pnpm --filter @pri/worker corpus:download
pnpm --filter @pri/worker corpus:import
pnpm dev
```

Open `http://127.0.0.1:3000`. No AI provider key is required for public facts, Today cold-start ordering, paper detail, interests, or reading state. Missing interpretation remains visible as a truthful unavailable state. Stop Web and worker with `Ctrl+C`; preserve PostgreSQL data by stopping rather than removing its Compose volume.

### Optional trusted LAN

Only after confirming PostgreSQL and Redis are loopback-only, start Web explicitly with `pnpm --filter @pri/web dev:lan` (or `start:lan` after a production build). The command binds only Web to `0.0.0.0` and prints a warning because the application has no login. Find the computer's private IPv4 address and try `http://PRIVATE-IP:3000` from a device on the same trusted Wi-Fi or personal hotspot.

Do not add a router port-forward or public tunnel. If Windows Firewall asks, the user may choose private networks only; the application never changes firewall settings. Campus Wi-Fi client isolation can block device-to-device traffic even when both devices have internet access. In that case, keep using the guaranteed desktop URL or try a personal hotspot later.

## AI provider setup

For personal localhost use, open `http://127.0.0.1:3000/settings/models`. Create any number of named connections, choose the provider, and enter its API Key. The form fills the provider's official base URL and default model; review the current model name and prices before saving. A blank Key while editing retains the existing encrypted value. Copying a profile clears the Key, and changing providers requires a new Key.

The first save creates a 32-byte local master key outside the repository. `AI_SETTINGS_MASTER_KEY_FILE=` may be left empty to use the operating-system user data directory, or set to an absolute path outside the checkout when Web and worker run under different service layouts. Web and worker must access the same database and the same master-key file. The database stores only AES-256-GCM ciphertext, nonce, tag, and public connection metadata; the browser never receives the saved Key.

Run the lightweight connection check before the synthetic sample. The sample sends only a project-owned fictional title and abstract, writes no paper data, and can incur a small provider charge. Saved task routing is resolved once per worker batch: a change takes effect on the next batch without restarting the worker, while an already-running batch keeps its original snapshot.

LAN mode is read-only for model metadata. Key writes and paid tests remain available only at localhost because the application has no login. Structured logs use stable event/error codes and must never contain a real API Key, ciphertext, database URL, or internal stack.

Environment-based provider configuration remains a compatibility fallback only when no database task routing exists. For that mode, fill exactly one named key, for example `AI_PROVIDER_GLM_API_KEY`, `AI_PROVIDER_KIMI_API_KEY`, or `AI_PROVIDER_HUNYUAN_API_KEY`.

If multiple named keys are present, set `AI_DEFAULT_PROVIDER` to one of `deepseek`, `openai`, `gemini`, `qwen`, `glm`, `kimi`, or `hunyuan`. Explicit classification and interpretation primary/fallback routes remain available through the `AI_CLASSIFY_*` and `AI_INTERPRET_*` variables.

Other providers can use `compatible` when they implement OpenAI Chat Completions plus JSON mode. Set `AI_PROVIDER_COMPATIBLE_API_KEY`, `AI_PROVIDER_COMPATIBLE_BASE_URL`, and `AI_PROVIDER_COMPATIBLE_MODEL`, then set `AI_DEFAULT_PROVIDER=compatible`. Endpoint/model/pricing overrides use the same provider-prefixed variable pattern shown in `.env.example`.

The built-in fallback prices are deliberately conservative budget reservations, not billing quotes. Enter current provider prices with the `*_INPUT_COST_PER_MILLION_USD` and `*_OUTPUT_COST_PER_MILLION_USD` overrides when accurate cost reporting is required.

## Daily automation

Set:

```dotenv
DAILY_PIPELINE_ENABLED=true
DAILY_PIPELINE_TIME=06:00
DAILY_PIPELINE_TIMEZONE=Asia/Shanghai
```

The worker upserts one stable BullMQ scheduler. Each daily run executes public-source ingestion, classification, budgeted interpretation, and Today preparation in order. The schedule has two bounded attempts with exponential backoff. Source cursors, AI idempotency keys, interpretation budget reservations, and the stable scheduler ID make repeated execution in the same window safe.

## Production build and processes

Keep `NEXT_TELEMETRY_DISABLED=1` in the server environment for both build and runtime so the framework does not send anonymous telemetry.

```powershell
pnpm build
pnpm --filter @pri/web start
```

Run the worker in a second supervised process:

```powershell
pnpm --filter @pri/worker start
```

Use the operating system's process supervisor to inject `.env`, restart on failure, and send `SIGTERM` for graceful shutdown. Run exactly one worker for a personal deployment unless concurrency has been reviewed.

The Web build uses Next.js standalone output. Its postbuild script copies `.next/static` and, when present, `public` into `.next/standalone/apps/web`. Verify after every build:

```powershell
Test-Path apps/web/.next/standalone/apps/web/server.js
Test-Path apps/web/.next/standalone/apps/web/.next/static
```

Both commands must return `True`.

## Health checks

- `GET /api/health/live`: process liveness only; expected HTTP 200 and `status=alive`.
- `GET /api/health/ready`: PostgreSQL, Redis, queue backlog, and worker readiness. Expected HTTP 200 when ready and 503 otherwise.
- `queue_backlog` means waiting jobs exceeded 100. `worker_unavailable` means no BullMQ worker is registered. Disabled scheduling reports queue and worker as `disabled`.

Do not publish readiness endpoints through an unauthenticated diagnostics dashboard. The response itself is safe for a load balancer or local operator check.

## Backup

Create an application-consistent PostgreSQL custom-format dump. The following uses the checked-in local Compose service and writes inside the container before copying it out:

```powershell
New-Item -ItemType Directory -Force backups
docker compose -f infra/docker-compose.yml exec -T postgres pg_dump -U pri -d pri -Fc --file=/tmp/pri-backup.dump
docker compose -f infra/docker-compose.yml cp postgres:/tmp/pri-backup.dump ./backups/pri-backup.dump
docker compose -f infra/docker-compose.yml exec -T postgres rm -f /tmp/pri-backup.dump
Get-FileHash ./backups/pri-backup.dump -Algorithm SHA256
```

Store the dump and checksum away from the application host. The Redis queue is operational state, not the source of record; after a restore the stable daily scheduler is recreated by the worker.

Back up the database and master key separately. Do not print, hash into application logs, or commit the master key. Copy the file as an opaque secret into a protected backup location, record only that the copy exists, and restrict access to the service account. A database dump without its matching master key cannot decrypt saved provider credentials; a master key without the database contains no connection records.

## Restore and verify

Never test a restore over the active database. The local example creates a separate validation database:

```powershell
docker compose -f infra/docker-compose.yml exec -T postgres createdb -U pri pri_restore_check
docker compose -f infra/docker-compose.yml cp ./backups/pri-backup.dump postgres:/tmp/pri-backup.dump
docker compose -f infra/docker-compose.yml exec -T postgres pg_restore -U pri -d pri_restore_check --clean --if-exists /tmp/pri-backup.dump
docker compose -f infra/docker-compose.yml exec -T postgres psql -U pri -d pri_restore_check -c 'SELECT count(*) FROM "Paper";'
docker compose -f infra/docker-compose.yml exec -T postgres psql -U pri -d pri_restore_check -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
docker compose -f infra/docker-compose.yml exec -T postgres rm -f /tmp/pri-backup.dump
```

Restore the database dump and its matching opaque master-key file to the configured path; restore both before starting Web or worker. Verify the key file exists and is readable by only the intended service account without displaying its contents. Then point a temporary Web/worker process at `pri_restore_check`, call both health endpoints, open Today and one paper detail, and run one lightweight connection check from localhost. Delete the validation database only after recording the result. Restoring the active database is an explicit maintenance-window operation: stop Web and worker, preserve the failed database, restore, run `prisma:deploy`, verify, and then restart.

If the master key is lost, existing ciphertext is intentionally unrecoverable. Stop the worker, move the unusable key path aside if present, start Web locally, and re-enter every API Key in the model console so each profile is encrypted with the newly created master key. Re-save task routing, run lightweight checks, then restart the worker. Never try to recover keys from logs or browser artifacts.

## Troubleshooting

### Daily job did not run

1. Confirm `DAILY_PIPELINE_ENABLED=true`, a valid `HH:mm` time, and an IANA timezone.
2. Call readiness and confirm Redis/worker are ready.
3. Check structured events `worker.started`, `worker.queue.error`, and the daily job result around the scheduled time.
4. Restart one worker; scheduler reconciliation is an idempotent upsert.

### Queue backlog or Redis reconnects

- `queue_backlog`: confirm a worker is running and PostgreSQL/provider dependencies respond before adding concurrency.
- `queue_unavailable` or `redis_unavailable`: check Redis health, network policy, TLS scheme, and Redis database number (0–15).
- Redis reconnect delay is exponential and capped at five seconds. The daily job itself has only two attempts.
- Preserve failed jobs for diagnosis; successful history is capped at 30 and failed history at 100.

### Source failures

- Timeouts, 429, and 5xx use the existing bounded source retry/fallback rules. No test or health check calls a source.
- Verify `SOURCE_CONTACT_EMAIL` for polite Crossref access, optional `CROSSREF_ISSN`, and any OpenAlex allowance key.
- A single source failure is isolated. `all_sources_failed` stops that daily run before AI work so a partial unsafe window is not presented as complete.

### Provider failures and exhausted budget

- Stable error codes distinguish authentication, rate limit, timeout, upstream 5xx, invalid JSON/schema, and configuration failures. Logs omit keys and stacks.
- Provider fallback is used only for retryable failures and never bypasses the logical task idempotency key.
- `budget_exceeded` creates an auditable skipped run and continues Today preparation. Raise `DAILY_AI_BUDGET_USD` only after reviewing current provider prices and prior attempt costs.
- If a provider rejects JSON mode, choose another named provider/model or configure a compatible model that supports JSON objects; do not weaken output validation.

### Today or paper detail is degraded

- A missing or corrupt AI interpretation must leave public paper facts visible.
- A temporary database failure returns a recoverable whole-page state. Restore readiness, then reload; no browser data reset is required.
- Interest changes should reorder Today after save; if not, verify the PUT response, reload, and inspect PostgreSQL readiness.

## Upgrade checklist

1. Create and checksum a backup.
2. Stop Web and worker.
3. Install the locked dependencies and run Prisma generate, validate, and migrate deploy.
4. Run unit/integration tests and Playwright against dedicated test schemas.
5. Build Web and worker; verify standalone static assets.
6. Start worker, then Web; verify liveness, readiness, Today, interests, detail, and reading state.
7. Keep the previous application checkout and backup until the next successful daily run.
