---
page: docs/spec/features/us-96-one-live-bench.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/features/us-96-one-live-bench.md

## Verified (17)

- ✓ All cited sources exist: `src/main/core/watchlist-signal.ts`, `src/main/core/ivr-freshness.ts`, `src/main/services/{watchlist-snapshot,underlying-quotes,earnings-horizon}.ts`, `src/main/ipc/watchlist.ts`, `src/renderer/src/pages/WatchlistPage.tsx`, `src/renderer/src/lib/{bench,day-change}.ts`, `components/Bench{Card,Detail,Grid,Header,Section}.tsx`, `components/FreshnessRing.tsx`, `components/IvrCell.tsx`, `e2e/watchlist-bench.spec.ts`.
- ✓ `watchlist:snapshot` registered (`src/main/ipc/watchlist.ts:32`), bridged (`src/preload/index.ts:76`).
- ✓ `watchlist:list` retired — no non-test reference under `src/` (grep).
- ✓ `ScreenerPage`, `ScreenerResultsTable`, `ScreenerExcludedSection` gone — no files or references under `src/` (grep); `ScreenerCriteriaStrip` / `ScreenerStateCard` survive ("moved across unchanged").
- ✓ `e2e/watchlist-bench.spec.ts` contains 33 test cases — matches "33 ACs".
- ✓ `IpcIvRank.state` includes `'expired'` (`src/preload/index.d.ts:439`).
- ✓ Price gate labels: `Price unavailable` (`watchlist-signal.ts:62`).
- ✓ IV gate labels: `IV unavailable` (`:85,89`), `IV too old to judge` (`:77`), `IV predates earnings` (`:78`), `IV low` (`:95`).
- ✓ Earnings gate labels: `Earnings date unknown` (`:135`), `Earnings in N days` (`:141`).
- ✓ Earnings window 7 days inclusive (`EARNINGS_WINDOW_DAYS = 7`, `withinWindow: daysUntil <= …`, `watchlist-signal.ts:53,123`), counted on the Eastern day (`:99`).
- ✓ Reason precedence earnings → price → IV (`watchlist-signal.ts:161`).
- ✓ Outage copy `Data unavailable · not evaluated` (`src/renderer/src/lib/bench.ts:30`).
- ✓ Empty Meets section "Waiting for market data — no screen has run…" (`src/renderer/src/components/BenchGrid.tsx:91`).
- ✓ Bench merges `screener:results` `ranked` in engine order without re-sorting (`lib/bench.ts:71-75`).
- ✓ Expired reading shows `exp` (`IvrCell.tsx:64`); never-collected shows `n/a` (`IvrCell.tsx:50`).
- ✓ Earnings come from the shared store via `readEarningsOrEmpty` (`watchlist-snapshot.ts:24`); quotes via `fetchIsolatedStockQuotes` on `MarketDataProvider` (`:20,30`).
- ✓ Linked pages us-66, us-67, us-68, us-70, us-98 exist.

## Drift (1)

- ✗ "IV rank from the IVR snapshot store aged through the us-98 freshness engine" (How a row is built). Since US-121 the snapshot service reads IV rank via `readIvRankLookup` (`src/main/services/watchlist-snapshot.ts:26`), which reads the app's own stored IV30 series (`src/main/services/iv-rank-lookup.ts:1-9`, `iv-history-read.ts`), not the retired Barchart-fed IVR snapshot store. The "locally-stored IV reading" phrasing in Degradation is still accurate. Suggested fix: say "IV rank computed from the stored IV30 history".

## Unverifiable (3)

- ? Freshness-ring fill step function (full / three-quarters / half / quarter / empty gold with dot) and tooltip content — visual; not traced in `FreshnessRing.tsx`.
- ? Per-item isolation claims ("one ticker's quote failing empties only that price"; "provider failing to construct still returns a fully rendered bench") — behavioural; not traced.
- ? "Five inherited e2e suites were re-pointed … keeping every test name" — historical.

## Missing files (0)

None.
