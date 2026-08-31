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

## AI provider setup

For the simplest setup, fill exactly one named key, for example `AI_PROVIDER_GLM_API_KEY`, `AI_PROVIDER_KIMI_API_KEY`, or `AI_PROVIDER_HUNYUAN_API_KEY`. The application supplies the official base URL, a current default model, 45-second timeout, output limits, and conservative local budget reservation rates.

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

Then point a temporary Web/worker process at `pri_restore_check`, call both health endpoints, open Today and one paper detail, and verify reading state. Delete the validation database only after recording the result. Restoring the active database is an explicit maintenance-window operation: stop Web and worker, preserve the failed database, restore, run `prisma:deploy`, verify, and then restart.

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
