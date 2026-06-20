# US-44: Persist IVR snapshots and schedule daily collection

**As a** trader,
**I want** the app to record an IVR snapshot for each underlying I'm trading once per market day,
**So that** I see stable, recent IVR values on position cards and in the screener without re-scraping on every render.

---

## Context

US-43 fetches IVR for a single ticker. This story adds persistence and a scheduler so the app maintains an up-to-date IVR record for every underlying with an active position. Collection runs once per market day, after market close, with politeness controls so Market Chameleon is not hammered.

Epic 12 had originally planned an `iv_snapshot` table holding raw 30-day IV values, with IVR computed locally. Because Market Chameleon publishes IVR directly on free pages, this story stores **IVR snapshots** (the computed value) instead. The Epic 12 plan will be revised in a separate update.

---

## Acceptance Criteria

```gherkin
Background:
  Given a migration creates table ivr_snapshot with columns:
    underlying TEXT NOT NULL,
    observed_at TEXT NOT NULL,           -- ISO-8601
    ivr TEXT NOT NULL,                   -- decimal string, 1 dp
    ivp TEXT,                            -- nullable
    iv30 TEXT,                           -- nullable
    source TEXT NOT NULL DEFAULT 'market-chameleon',
    PRIMARY KEY (underlying, observed_at)
  And an index exists on (underlying, observed_at DESC)

Scenario: Collector runs once per market day after close
  Given the scheduler is configured to run at 17:00 ET on trading days
  When the scheduler fires
  Then collectIVRSnapshots() is invoked

Scenario: Collector picks up all active-position underlyings
  Given positions exist for tickers ["SPY", "AAPL", "TSLA"] in phases other than CLOSED
  When collectIVRSnapshots runs
  Then it calls fetchMarketChameleonIVR for each distinct underlying
  And requests are spaced at least 1 second apart

Scenario: Successful snapshot is persisted
  Given fetchMarketChameleonIVR returns { status: "ok", data: { ticker: "SPY", ivr: 42.5, ivp: 50.0, iv30: 0.18, observedAt: "2026-05-29T21:05:00Z" } }
  When the collector persists the result
  Then a row is inserted into ivr_snapshot for ("SPY", "2026-05-29T21:05:00Z") with ivr "42.5"

Scenario: Re-running on the same calendar day overwrites the existing row
  Given an ivr_snapshot already exists for SPY on 2026-05-29
  When the collector runs again the same day
  Then the existing row's observed_at and ivr are replaced with the fresh values
  And no exception propagates from the unique constraint

Scenario: Not-available ticker is recorded but with no row written
  Given fetchMarketChameleonIVR returns { status: "not_available" }
  When the collector handles the result
  Then it does not insert a row for that ticker
  And an INFO log records "ticker not covered by Market Chameleon free IVR" with the symbol

Scenario: Parse error is logged and the collector continues to the next ticker
  Given fetchMarketChameleonIVR returns { status: "parse_error" }
  When the collector handles the result
  Then a WARN log is emitted
  And the collector continues to the next ticker without aborting the batch

Scenario: Manual trigger from settings
  Given a renderer-only IPC handler "ivr:collect-now"
  When the user clicks "Refresh IVR now" in settings
  Then the collector runs immediately for all active-position underlyings
  And the result of the batch (success count, error count) is returned to the renderer

Scenario: Market is closed on a non-trading day
  Given today is a recognised market holiday or weekend
  When collectIVRSnapshots runs (whether via scheduler or manual trigger)
  Then it calls BrokerProvider.getMarketStatus() and detects a non-trading day
  And the collector exits without making any network requests
  And an INFO log records the skip reason
```

---

## Technical Notes

- Migration file: `migrations/008_create_ivr_snapshot.sql` (verify numbering is contiguous with us-35 migrations 006 + 007).
- Service file: `src/main/services/ivr-collector.ts`.
- Scheduler: register an `afterClose` job with the shared `PollingScheduler` singleton from US-46. Do not introduce a new scheduling library.

  ```typescript
  // In src/main/index.ts, alongside the detect-assignments registration:
  import { scheduler } from './services/scheduler-instance'
  import { collectIVRSnapshots } from './services/ivr-collector'

  scheduler.register({
    name: 'ivr-collect',
    cadence: { kind: 'afterClose', offsetMinutes: 60 },
    handler: () => collectIVRSnapshots({ db, brokerProvider, logger })
  })
  // scheduler.start() is called once, after all jobs are registered
  ```

  Full consumer guide: `plans/us-35/quickstart.md` → "Adding a new scheduled job".

- Manual trigger IPC: `'ivr:collect-now'` calls `scheduler.runNow('ivr-collect')` — the scheduler resets the cadence clock to now after the out-of-band run.
- Trading-day guard: `collectIVRSnapshots` must call `BrokerProvider.getMarketStatus()` at the start and return early with an INFO log if it's a non-trading day. This covers both the scheduled path and `ivr:collect-now` manual triggers on weekends/holidays. The `afterClose` cadence also skips non-trading days at the scheduler level, so the guard is belt-and-suspenders for the scheduled path but essential for the manual path.
- Politeness: rate limit of 1 req/sec enforced in the collector, not just the scraper, so concurrent callers cannot bypass it.
- Same-day overwrite semantics: chosen so the last value of the day wins (closest to market close). Tests must cover the manual-trigger-after-scheduled-run case.

---

## Out of Scope

- IVR computation from raw IV time series (we store the scraped value directly).
- Watchlist underlyings (only active-position underlyings are collected).
- Historical backfill — first day of use has whatever the daily run produces.
- Real-time IVR streaming.

---

## Dependencies

- US-43 (scraper)
- US-40 (BrokerProvider for market status)
- US-46 (polling scheduler)

---

## Estimate

5 points
