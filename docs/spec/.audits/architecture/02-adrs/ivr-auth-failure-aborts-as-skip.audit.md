---
page: docs/spec/architecture/02-adrs/ivr-auth-failure-aborts-as-skip.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/ivr-auth-failure-aborts-as-skip.md

## Verified (7)

- ✓ Calendar refresh or a ticker turn reporting `no_market_data` stops the batch and returns `MARKET_DATA_UNAVAILABLE` (`{ 0, 0, 0, skippedReason: 'market_data_unavailable' }`) with INFO `ivr_collection_skipped_no_market_data` — `src/main/services/ivr-collector.ts:51-56,93-98,150-154`.
- ✓ Every remaining target marked `no_market_data` — `runState.markNoMarketData(targets)` / `targets.slice(index)`, `ivr-collector.ts:96,152`.
- ✓ `no_market_data` originates from `MarketDataError('auth_failed')` — `src/main/services/iv-history.ts:239-242`.
- ✓ Other errors caught per ticker, logged under `err`, counted `failed`, loop continues — `ivr-collector.ts:120-138` and `iv-history.ts:243-244`.
- ✓ DB errors (`Database.SqliteError`) rethrown — `ivr-collector.ts:131`.
- ✓ `refreshTradingCalendar` returns `{ status: 'no_market_data' }` on `auth_failed` (`src/main/services/trading-calendar-store.ts:181,228-230`); on-demand awaits `ensureTradingCalendar` and settles `no_market_data` (`src/main/services/ivr-on-demand.ts:64-66`).
- ✓ On-demand never rejects: `run` catches everything and returns `failed` (`ivr-on-demand.ts:61-78`); cited sources exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Known limit (entitlement 403 also maps to `auth_failed`) — depends on Alpaca's responses; review advisory.

## Missing files (0)

None.
