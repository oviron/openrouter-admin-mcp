# Changelog

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
