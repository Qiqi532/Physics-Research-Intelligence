# LLM No-Cost Runtime and Stage 9A Integration Design

## Goal

Run classification and interpretation without any local price estimate or budget gate, preserve only provider-reported token usage, keep Kimi K2.6 as the verified default, and integrate Stage 9A only after its review findings are fixed.

## Product boundary

- The application does not calculate, store, display, reserve, or enforce monetary cost.
- A configured provider call is attempted regardless of local token history.
- Token counts are audit metadata only. They are stored when the provider returns explicit numeric usage; otherwise they remain `null` and are never estimated.
- Duration, provider, model, status, error code, idempotency, primary/fallback attempts, and source-basis disclosure remain.
- Kimi K2.6 keeps its verified structured-output and disabled-thinking request shape. Other providers never receive Kimi-only fields.
- DeepSeek, Qwen, GLM, Hunyuan, OpenAI, Gemini, and generic compatible profiles remain configurable. This change uses mock HTTP contract tests for them; no real-key test is required in this phase.

## Data migration

Drop monetary columns from `AiRun`, `AiRunAttempt`, and `AiConnectionProfile`. Convert historical `SKIPPED_BUDGET` rows to a non-budget terminal legacy failure before removing the enum value. Keep nullable token columns unchanged.

## Runtime flow

Both classification and interpretation use the same idempotent `claimRun` path. A claimed run invokes primary then bounded fallback, records each attempt, and aggregates only numeric token values returned by the provider. Missing usage remains null rather than zero.

## Stage 9A acceptance fixes

1. Make unrelated reading-state updates omit favorite columns at the database write boundary, preventing a stale read from overwriting a concurrent favorite toggle.
2. Enforce explicit upper bounds for retention and daily target configuration consistent with the 500-candidate pool.
3. Add visual-system rules for the collection list and favorite control, including active, disabled, focus, and mobile behavior.

## Verification

Use mock-provider tests only for automated AI coverage. Run migration validation on a dedicated PostgreSQL schema, targeted and full Vitest, typecheck, lint, Web/worker builds, Playwright desktop/mobile, and a manual local Kimi page check without exposing the API key.

