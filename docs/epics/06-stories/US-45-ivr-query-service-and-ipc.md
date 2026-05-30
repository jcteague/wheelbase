# US-45: Expose current IVR through a service + IPC for downstream consumers

**As an** Epic 08 candidate screener (and Epic 12 display surfaces),
**I want** a single service call to fetch the most recent IVR for any underlying,
**So that** screener filters and badge displays do not duplicate scraping logic or directly query the database.

---

## Context

With IVR snapshots persisted (US-44), the renderer and downstream services need a clean read path. This story adds `volatility-service.ts` with `getCurrentIVR(ticker)` returning the most recent snapshot (or a typed "no data" outcome), an IPC handler `volatility:get-ivr`, and a freshness flag indicating how old the snapshot is.

No UI ships in this story — the consumer surfaces (badge on position card, panel in roll dialog, screener column) live in Epic 12 / Epic 08.

---

## Acceptance Criteria

```gherkin
Background:
  Given volatility-service.ts is defined in src/main/services/volatility-service.ts
  And IPC handler "volatility:get-ivr" is registered

Scenario: Fetch current IVR for a covered ticker
  Given an ivr_snapshot exists for SPY with ivr "42.5" observed_at "2026-05-28T21:05:00Z"
  When getCurrentIVR("SPY") is called on 2026-05-29
  Then it returns { status: "ok", ticker: "SPY", ivr: "42.5", ivp?: ..., observedAt: "2026-05-28T21:05:00Z", ageDays: 1, isStale: false }

Scenario: Snapshot is stale when older than 3 trading days
  Given the most recent ivr_snapshot for SPY is from 2026-05-20
  And today is 2026-05-29 (7 trading days later)
  When getCurrentIVR("SPY") is called
  Then it returns isStale: true and ageDays: 7

Scenario: No snapshot exists for the ticker
  Given no rows in ivr_snapshot for "XYZ"
  When getCurrentIVR("XYZ") is called
  Then it returns { status: "no_data", ticker: "XYZ", reason: "no IVR collected yet" }

Scenario: IPC returns the same shape as the service
  Given the renderer invokes ipcRenderer.invoke("volatility:get-ivr", { ticker: "SPY" })
  Then the response matches the service's return shape (Zod-validated at the IPC boundary)

Scenario: Batch IPC fetches IVR for multiple tickers in one round trip
  Given the renderer invokes ipcRenderer.invoke("volatility:get-ivr-batch", { tickers: ["SPY", "AAPL", "XYZ"] })
  Then the response is { results: [ { ticker: "SPY", ... }, { ticker: "AAPL", ... }, { ticker: "XYZ", status: "no_data" } ] }
  And the order matches the input

Scenario: In-process cache reduces DB reads
  Given getCurrentIVR("SPY") has been called within the last 60 seconds
  When getCurrentIVR("SPY") is called again
  Then the cached snapshot is returned without a database read
  And the cache TTL is configurable via service options for tests
```

---

## Technical Notes

- File: `src/main/services/volatility-service.ts`
- IPC handlers: `src/main/ipc/volatility.ts`
- Stale threshold (3 trading days) is a constant for now; configurable later if it becomes contentious.
- Cache is process-local Map with TTL; clear on any new snapshot insertion to keep callers honest.

---

## Out of Scope

- IVR badge / sparkline UI (Epic 12).
- Earnings-proximity flag (Epic 12 US-91).
- Historical IVR query (Epic 12 if needed).
- IVR computation from raw IV — we read the scraped value directly.

---

## Dependencies

- US-44 (snapshot store)

---

## Estimate

3 points
