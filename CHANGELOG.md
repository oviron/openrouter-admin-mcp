# Changelog

## 0.5.0 — 2026-04-25

### Added
- **`or_generation`** — fetch a single inference call by `generation_id` (the `gen-…` ID OR returns in completion responses). Returns model, provider, total cost, prompt/completion/reasoning tokens, latency, generation time, finish reason. Use when an agent needs to explain why a specific call cost what it did. Bypasses GET cache (one-shot inspection, never reused).
- **`or_models`** — list the OpenRouter model catalog with current pricing per 1M tokens, context length, output modalities. Filter via `search`, `supported_parameters`, `output_modalities` (forwarded to OR).
- **`or_model_get`** — full details for a single model id: description, context, max completion, modalities, tokenizer, supported parameters, pricing.

### Tests
- 53 → 61 unit tests (3 for generation, 5 for models).

## 0.4.0 — 2026-04-25

### Removed (design — interpretive logic out)
- **Near-limit warnings (`⚠️`)** removed from `or_keys_list`, `or_key_get`, `or_overview` payloads. The agent has `limit` and `limit_remaining` and decides what's "near" — server should not interpret. Rationale: research into production MCP servers (Stripe, GitHub, Linear) — none embed interpretive flags in payloads. See `inbox/research/2026-04-25-mcp-server-best-practices.md`.

### Added (plumbing)
- **HTTP retry on 429 / 5xx** with exponential backoff (1s/2s/4s, capped 8s) and `Retry-After` header support (seconds or HTTP-date). Default 3 retries; configurable via `ClientOptions.maxRetries`. 4xx other than 429 are not retried.
- **In-session GET cache** for `/credits`, `/key`, `/keys`, `/keys/{hash}`. Default 60s TTL. Mutations on `/keys/*` invalidate the list cache. Configurable via `ClientOptions.cache` and `cacheTtlMs`. Per-call `noCache: true` opt-out. `/activity` and `/generation` are never cached.

### Tests
- 45 → 53 unit tests. New coverage: retry behavior (429 with Retry-After, 5xx with backoff, max-retry exhaustion, no retry on 401), cache (TTL, exempt paths, `noCache` flag, write-invalidates-list, disable flag).

## 0.3.0 — 2026-04-25

### Security
- **Destructive write tools (`or_key_create`, `or_key_update`, `or_key_delete`) are now opt-in.** They are not registered by default. Set `OPENROUTER_ADMIN_ALLOW_WRITE=1` in the env block to enable. Rationale: prevents accidental key mutation through prompt-injected tool calls when only read access is intended. Read-only tools (`or_overview`, `or_credits`, `or_current_key`, `or_keys_list`, `or_key_get`, `or_activity`) are unchanged and always available.
- Startup log now reports which mode is active (`write tools: ENABLED|disabled`).

### Tooling
- Added Biome (`@biomejs/biome`) as the linter/formatter — `npm run lint`, `npm run lint:fix`, `npm run format`.
- CI workflow now runs `lint → build → test` in sequence on Node 20 and 22.
- Dropped Node 18 from the support matrix (vitest 4.x requires Node ≥20.18 for `node:util.styleText`). `engines.node` bumped to `>=20.18`.
- `prepublishOnly` now runs lint + build + test before publishing.

### Tests
- 42 → 45 unit tests. New `test/registration.test.ts` covers the opt-in registration matrix (default / `allowWrite=false` / `allowWrite=true`).

## 0.2.0 — 2026-04-25

### Added
- `or_overview` — one-shot dashboard combining credits, active keys (with reset/expiration), and today's UTC burn by model. Replaces the common 3-call diagnose-cost pattern.
- `limit_reset` field on inference keys: `daily` / `weekly` / `monthly`. Supported in `or_key_create`, `or_key_update`, and surfaced in `or_keys_list` / `or_key_get` outputs.
- `expires_at` field on inference keys: ISO 8601 timestamp. Supported in `or_key_create` (set), `or_key_update` (set or `null` to clear), and surfaced in outputs.
- `or_activity` aggregation `by_key` — group spending by inference key hash.
- Near-limit warning (⚠️) in `or_keys_list` and `or_key_get` when a key has spent ≥90% of its limit.

### Changed
- `or_key_update` output now includes the reset cadence (e.g. `Limit: 0.3 (daily)`).
- `prepublishOnly` script: build + tests run automatically before `npm publish`.

### Tests
- 28 → 42 unit tests. New cases cover reset/expiration round-trips, by_key aggregation, near-limit thresholds, and the overview composite (including graceful degradation when `/activity` errors).

## 0.1.0 — 2026-04-25

Initial release.

- `or_credits`, `or_current_key`
- `or_keys_list`, `or_key_get`, `or_key_create`, `or_key_update`, `or_key_delete`
- `or_activity` with `none` / `by_model` / `by_day` / `by_provider` aggregations and token-level breakdown (prompt / completion / reasoning)
- TypeScript + vitest + mocked `fetch`, 28 unit tests
