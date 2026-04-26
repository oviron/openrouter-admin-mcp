# Changelog

## 0.7.3 — 2026-04-26

### Fixed
- **`or_key_create` was silently dropping the one-time secret.** OpenRouter's `POST /keys` response shape is `{data: {…}, key: "sk-or-v1-…"}` with the secret as a sibling of `data`, but the client's auto-unwrap returned `payload.data` and discarded the rest. The new key was created on OR but the secret was unrecoverable — every caller had to delete the key and recreate via `curl`. Real-world hit reported by user during a key rotation.
- Added `RequestOptions.noUnwrap` (default false). When set, `client.request` returns the full payload as-is. `or_key_create` opts in and reads `data` + `key` separately.
- Test mocks for `or_key_create` were nesting `key` inside `data` — wrong shape, so the bug never failed CI. Fixed both tests, plus added two new client-level tests: one that the noUnwrap envelope works, one that documents the default-unwrap trap.

### Tests
- 84 → 86 unit tests.

## 0.7.2 — 2026-04-25

### Fixed
- Tool count corrected throughout docs and assets: server actually exposes **26** tools (16 read + 10 write), not 22 as previously stated. README, og preview, hero image and CHANGELOG entries updated. Asset version badges bumped to v0.7.2. No code changes.

## 0.7.1 — 2026-04-25

### Fixed
- The `v0.7.0` npm tarball was built from the tag commit, which preceded the README/CHANGELOG refresh for the 26-tool surface. This patch republishes with the up-to-date docs (full Read/Write tool tables, guardrail bind example, design rationale, project layout). No code changes.

## 0.7.0 — 2026-04-25

### Added — model & endpoint discovery (thin GET wrappers)

- **`or_model_endpoints`** — `GET /api/v1/models/:author/:slug/endpoints`. Per-provider list for a specific model: pricing, context length, quantization, uptime over the last 30m, status. Use when picking the cheapest or most-stable provider for a model.
- **`or_models_user`** — `GET /api/v1/models/user`. Models available under the current account's privacy and guardrail settings (filtered set), distinct from `or_models` (full public catalog).
- **`or_zdr_endpoints`** — `GET /api/v1/endpoints/zdr`. ZDR-compliant model endpoints, for agents under privacy/compliance constraints.

### Tests
- 78 → 84 unit tests.

## 0.6.0 — 2026-04-25

### Added — Guardrails (account-wide spending limits + provider/model allowlists)

OpenRouter exposes a rich Guardrails API; previously 0% covered. Read tools always available; mutations require `OPENROUTER_ADMIN_ALLOW_WRITE=1`.

Read:
- **`or_guardrails_list`** — list all guardrails: limit_usd, reset_interval (daily/weekly/monthly), allowed/ignored providers, allowed/ignored models, enforce_zdr.
- **`or_guardrail_get`** — full details of one guardrail by id.
- **`or_guardrails_assignments`** — composite: combines `/guardrails/key-assignments` and `/guardrails/member-assignments` into a single grouped view ("which keys/members are bound to which guardrail").

Write (opt-in, destructive):
- **`or_guardrail_create`** / **`or_guardrail_update`** / **`or_guardrail_delete`** — CRUD over `/guardrails`.
- **`or_guardrail_assign_keys`** / **`or_guardrail_unassign_keys`** — bulk-assign a guardrail to inference keys via `/guardrails/{id}/keys/bulk-(un)assign`.
- **`or_guardrail_assign_members`** / **`or_guardrail_unassign_members`** — bulk-assign to org members via `/guardrails/{id}/members/bulk-(un)assign`.

### Added — Organization
- **`or_org_members`** — list members of the OpenRouter organization (Management-key + org account). Useful as input for guardrail member-assignments.

### Tests
- 61 → 78 unit tests (15 for guardrails, 2 for organization).

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
