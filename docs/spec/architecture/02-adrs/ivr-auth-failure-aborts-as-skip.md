# ADR: A market-data auth failure aborts the IVR run as a skip; every other failure is per-ticker

<!-- generated:from us-121 -->

## Decision

- When the run's calendar refresh, or a ticker's turn, reports `no_market_data` (the provider
  raised `MarketDataError('auth_failed')`), `collectIVRSnapshots` stops and returns `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason:
'market_data_unavailable' }` with one INFO line (`ivr_collection_skipped_no_market_data`), and
  marks **every** remaining target `no_market_data` in the run state.
- Any other error — network, rate limit, a bad symbol, an engine throw — is caught in that ticker's
  `try/catch`, logged under `err`, counted `failed`, and the loop continues.
- A DB write error is **not** caught per ticker: it is systemic and rethrown.
- `refreshTradingCalendar` / `ensureTradingCalendar` report `{ status: 'no_market_data' }` on an
  auth failure, and both collection paths settle every affected ticker `no_market_data`. On a
  fresh install the calendar fetch is the first market-data call; before this fix it swallowed
  `auth_failed` and the card said "Last IV history run failed" instead of naming the credentials.
- The on-demand path never rejects; an auth failure there settles the ticker `no_market_data`.

## Why

With no credentials every ticker fails identically; 25 WARN lines and `errorCount: 25` would
report a configuration state as a broken run. Everything else follows the batch failure-isolation
rule ([alert-evaluation-failure-isolation](./alert-evaluation-failure-isolation.md),
[ivr-collector-per-ticker-failure-isolation](./ivr-collector-per-ticker-failure-isolation.md)).

## Alternatives considered

- **Ask `settings.getCredentialStatus()` first** — couples the collector to the settings service
  and duplicates the factory's credential resolution.
- **Treat auth like any per-ticker failure** — noisy and misleading.

## Known limit

Alpaca returns 403 for both missing credentials and a missing data entitlement; both map to
`auth_failed`, so an entitlement 403 masquerades as "needs credentials" (review advisory, not applied).

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "A market-data auth failure aborts the run as a skip…"
- `plans/us-121/refactor-phase-results.md` (Layer 7)
- `src/main/services/ivr-collector.ts`, `ivr-on-demand.ts`, `trading-calendar-store.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
