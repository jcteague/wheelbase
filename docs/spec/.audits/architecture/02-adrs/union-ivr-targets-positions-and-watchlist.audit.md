---
page: docs/spec/architecture/02-adrs/union-ivr-targets-positions-and-watchlist.md
audited_at: 2026-09-28
findings: 3
---

# Audit: union-ivr-targets-positions-and-watchlist.md

## Verified (7)

- ✓ `COLLECTION_TARGETS_QUERY` in `src/main/services/ivr-collector.ts:41-48` is `SELECT ticker FROM positions WHERE status != 'CLOSED' UNION SELECT ticker FROM watchlist`.
- ✓ Read by `listCollectionTargets` (`ivr-collector.ts:61`); `listActiveUnderlyings` no longer exists (grep empty).
- ✓ `toUpperCase()` → `Set` → `localeCompare` normalisation — `ivr-collector.ts:64-66`.
- ✓ One loop, one set of counters over the target list — `ivr-collector.ts:105-150` (`successCount`/`errorCount`/`skippedCount`).
- ✓ On quit the loop aborts at the next ticker boundary — `signal?.aborted` check at `ivr-collector.ts:109-114`; `signal` documented at lines 32-34.
- ✓ `iv_rank_floor` applies only when `ctx.ivRank !== null` — `src/main/core/screener.ts:285`.
- ✓ Links `./active-ivr-targets-from-positions.md` and `../../features/us-97-collect-ivr-for-watchlist-underlyings.md` exist.

## Drift (2)

- ✗ Consequences (lines 55-57) say collection is "paced by the scraper's internal 1 req/s rate limiter", present tense. The Barchart scraper is retired (US-121); the collector now calls `collectIvHistory` against `MarketDataProvider` bars (`ivr-collector.ts:124-131`) and there is no scraper or 1 req/s limiter in the collector path. Suggested fix: restate the runtime-growth consequence in terms of the per-ticker bar requests, or mark it as US-97-era history.
- ✗ Consequences (lines 61-63) say "`not_available` was already a skip". The per-ticker outcomes are now `collected` / `up_to_date` / `failed` / `no_market_data` (`ivr-collector.ts:135-150`); there is no `not_available` outcome, and skips count `up_to_date`. Suggested fix: update to the current outcome names or mark as history.

## Unverifiable (1)

- ? "Same-day overwrite semantics", "no backfill", and the awaited "Refresh IVR now" runtime growth — behavioural/narrative; not mechanically verified. `plans/us-97/*` sources are historical (dir exists, not audited).

## Missing files (0)

None.
