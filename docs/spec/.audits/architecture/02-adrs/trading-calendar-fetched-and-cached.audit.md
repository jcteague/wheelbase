---
page: docs/spec/architecture/02-adrs/trading-calendar-fetched-and-cached.md
audited_at: 2026-09-28
findings: 3
---

# Audit: trading-calendar-fetched-and-cached.md

## Verified (13)

- ✓ `MarketDataProvider.getMarketCalendar(range)` on the port — `src/main/integrations/market-data-provider.ts:137`; implemented in `alpaca-market-data.ts:235` and `fake-market-data.ts:277`.
- ✓ `refreshTradingCalendar` in `src/main/services/trading-calendar-store.ts:192` is the only writer (`INSERT INTO trading_session` at line 62); table from `migrations/015_create_trading_session.sql`.
- ✓ Every calendar day in range is written, closures as NULL `close_at` — `trading-calendar-store.ts:215-218` (`closes.get(day) ?? null`); migration comment and schema confirm.
- ✓ Coverage derived as `MIN(date)..MAX(date)` — `trading-calendar-store.ts:57`.
- ✓ `SessionLookup` is `open` / `closed` / `unavailable` — `src/main/core/trading-calendar.ts:32-35`.
- ✓ Warnings when never fetched and when coverage runs out within 30 days — `trading-calendar-store.ts:47,99-100,140-142`.
- ✓ Provider failure reports `{ status: 'failed' }` — `trading-calendar-store.ts:232-233`; `auth_failed` reports `{ status: 'no_market_data' }` — lines 228-230.
- ✓ US-121 bounds: `READ_LOOKBACK_DAYS = 400`, `READ_LOOKAHEAD_DAYS = 70`, `REFRESH_LOOKBACK_DAYS = 420`, `REFRESH_LOOKAHEAD_DAYS = 400`, `REFRESH_INTERVAL_DAYS = 7` — `trading-calendar-store.ts:29-43`.
- ✓ `needsRefresh` is true when stored `first_day` is later than `now − READ_LOOKBACK_DAYS` — `trading-calendar-store.ts:159`.
- ✓ `MarketCalendarSource = Pick<MarketDataProvider, 'getMarketCalendar'>` — `market-data-provider.ts:157`; consumed by `refreshTradingCalendar` / `ensureTradingCalendar` (`trading-calendar-store.ts:194,258`).
- ✓ `ensureTradingCalendar(db, getProvider, now)` with a module-level in-flight promise cleared in `finally`, never rejecting — `trading-calendar-store.ts:241,256-281`.
- ✓ Awaited by `buildWatchlistSnapshot` (`watchlist-snapshot.ts:119,133-145`) and `screenWatchlistCandidates` (`screener.ts:235,269-275`) inside `Promise.all`; the collector calls `refreshTradingCalendar` directly (`ivr-collector.ts:14,90`).
- ✓ Links: extracts us-98/us-121, features us-98/us-121, `../../schema/tables.md#trading_session` (section at `tables.md:756`), `./ivr-auth-failure-aborts-as-skip.md` all exist.

## Drift (2)

- ✗ Decision text (lines 19-20) says the collector refreshes "over 120 days back through 400 ahead". `REFRESH_LOOKBACK_DAYS` is now 420 (`trading-calendar-store.ts:39`), as the page's own US-121 update table states. Suggested fix: update the Decision paragraph to 420 so the page is not self-contradictory.
- ✗ Consequences (line 47) says every implementation — "Alpaca, the fake, the scheduler's fallback" — must answer `getMarketCalendar`. The scheduler's fallback provider no longer exists: `scheduler-instance.ts:23-35` defines only a `MarketStatusSource` (`getMarketStatus`) and `fallbackBroker` is deleted (US-116). Suggested fix: drop "the scheduler's fallback".

## Unverifiable (1)

- ? Rationale (hand-maintained tables expire silently; 2025-01-09 closure; 252 sessions ≈ 365 calendar days) — narrative. Note: a third `ensureTradingCalendar` caller exists (`src/main/services/ivr-on-demand.ts:65`) that the US-116 update does not mention; omission, not drift.

## Missing files (0)

None.
