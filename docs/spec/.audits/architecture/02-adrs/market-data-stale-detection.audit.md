---
page: docs/spec/architecture/02-adrs/market-data-stale-detection.md
audited_at: 2026-09-28
findings: 1
---

# Audit: market-data-stale-detection.md

## Verified (7)

- ✓ `STALE_THRESHOLD_MS = 5 * 60 * 1000` — `src/renderer/src/hooks/useStockQuotes.ts:17`.
- ✓ `STALE_POLL_INTERVAL_MS = 30 * 1000` and `setInterval(evaluate, STALE_POLL_INTERVAL_MS)` — `useStockQuotes.ts:18, 109`.
- ✓ Stale when `dataUpdatedAt > 0 && age > STALE_THRESHOLD_MS`; single `setStaleInfo((prev) => …)` functional updater that returns `prev` when unchanged — `useStockQuotes.ts:94-105`.
- ✓ `streamError !== null` forces stale immediately — `useStockQuotes.ts:117`.
- ✓ Banner text `Prices may be delayed — last updated {minutesAgo}m ago` — `src/renderer/src/components/StaleDataBanner.tsx:20`; rendered on `src/renderer/src/pages/PositionsListPage.tsx:248`.
- ✓ `deriveMarketStatusDisplay(session, stale)` returns `DELAYED` when stale — `src/renderer/src/lib/market-status.ts:18-22`.
- ✓ Ticks bump freshness through `setQueryData` — `useStockQuotes.ts:75-80`.

## Drift (1)

- ✗ Line 30 says "e2e mocks `Date.now()` to return `t - 6min`, fires a tick … asserts the banner". The e2e AC-7 test triggers a stream error instead (`e2e/live-underlying-price.spec.ts:328-345`); the Date.now-advance threshold case lives in the unit test `src/renderer/src/hooks/useStockQuotes.test.ts:271-296` (spies `Date.now` forward `+6 min`). Suggested fix: describe the hook unit test + stream-error e2e.

## Unverifiable (2)

- ? 5-minute threshold rationale (illiquid tickers) — heuristic.
- ? Rejected alternatives (per-ticker staleness, 30 s threshold) — design history.

## Missing files (0)

None.
