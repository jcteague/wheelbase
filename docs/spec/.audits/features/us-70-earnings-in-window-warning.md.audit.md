---
page: docs/spec/features/us-70-earnings-in-window-warning.md
audited_at: 2026-09-28
findings: 4
---

# Audit: docs/spec/features/us-70-earnings-in-window-warning.md

## Verified (16)

- ✓ 13 of 14 listed source files exist (`src/main/core/screener.ts`, `integrations/finnhub-earnings.ts`, `integrations/fake-earnings.ts`, `services/earnings-dates.ts`, `services/screener.ts`, `services/evaluate-alerts.ts`, `preload/index.d.ts`, `renderer/src/api/screener.ts`, `components/EarningsBadge.tsx`, `migrations/013_create_earnings_date.sql`, `e2e/screener-earnings.spec.ts`, `e2e/earnings-format.ts`, `e2e/screener-helpers.ts`).
- ✓ `EarningsLookup` / `CandidateEarnings` declared in the engine (`src/main/core/screener.ts:66,79`); engine imports only `decimal.js`, `date-fns` and sibling core modules (`screener.ts:5-8`) — no integrations/db/logger.
- ✓ `earnings_in_window` filter code (`screener.ts:123,291`) uses `earningsWithinHolding` (`:191,299`) on a `found` date (`:266-270`); `date-fns` `startOfDay` imported (`:6`).
- ✓ `rankCandidates` sorts `earningsTier → compareYieldPerDelta → ticker` (`screener.ts:532-540`); `earningsTier` maps clear 0, unknown/unavailable 1, flagged 2 (`:424-432`).
- ✓ `screenTicker` exists (`screener.ts:495`).
- ✓ `fetchEarningsCalendar` (US-98 rename) with `lookaheadDays` option (`finnhub-earnings.ts:170-174`) and `mapWithConcurrency` fan-out (`:3,195`); `EarningsCalendarRead` type (`:21`).
- ✓ `getEarnings` (`services/earnings-dates.ts:297`) is a projection alongside `getEarningsCalendar` (`:255`).
- ✓ `LOOKAHEAD_BUFFER_DAYS = 45` and `horizon: addDays(currentDate, criteria.dteMax + LOOKAHEAD_BUFFER_DAYS)` (`src/main/services/earnings-horizon.ts:31,53`) — ~90 days on default dteMax 45.
- ✓ US-56 alert path keeps its 30-day horizon: `EARNINGS_HORIZON_DAYS = 30` and `getEarnings(db, …)` (`src/main/services/evaluate-alerts.ts:33,191,225`).
- ✓ `earningsFlagged` removed — only asserted absent in tests (`src/main/ipc/screener.test.ts:188`, `src/renderer/src/api/screener.test.ts:132`); `IpcCandidateEarnings` declared and used as `earnings` (`src/preload/index.d.ts:502,528`).
- ✓ `EarningsBadge` gold treatment `bg-wb-gold-dim border-wb-gold-border text-wb-gold` (`EarningsBadge.tsx:16`), neutral for unknown/unavailable (`:23-24`), no badge for clear (`:41`); copy "Earnings date unknown"/"Earnings date unavailable" (`:34,36`).
- ✓ Migration `014_add_last_earnings.sql:1` adds nullable `last_earnings` to `earnings_date`.
- ✓ `e2e/screener-earnings.spec.ts` has exactly 10 `it()` cases (lines 70–209), one per AC — matches "10 scenarios".
- ✓ `fake-earnings.ts` imports `EarningsLookup` from the engine (`fake-earnings.ts:10`).
- ✓ All four linked ADRs exist in `docs/spec/architecture/02-adrs/` (earnings-persisted-per-ticker, earnings-four-state-lookup, earnings-tier-before-score, unknown-earnings-never-excludes) plus alert-evaluation-failure-isolation.
- ✓ `../schema/tables.md#earnings_date` anchor exists (`tables.md:676`).

## Drift (4)

- ✗ Source files list `src/renderer/src/components/ScreenerResultsTable.tsx`, which no longer exists — US-96 deleted it (the badge/rank now render on bench cards, `src/renderer/src/components/Bench*.tsx`). Also the "Rendering" section's "under the ticker symbol in the same cell" / "demoted row renders `—` in place of its rank number" describes the retired table. Suggested fix: point to the bench components.
- ✗ "the Finnhub module re-exports `EarningsLookup` so callers of the feed can name its return shape" — `src/main/integrations/finnhub-earnings.ts` no longer references `EarningsLookup` (grep); since US-98 it returns `EarningsCalendarRead` (`finnhub-earnings.ts:21`).
- ✗ "This mirrors how `IvRank` is declared in the engine and `services/ivr-snapshots.ts` conforms to it" — `src/main/services/ivr-snapshots.ts` does not exist; since US-121 the IV-rank read path is `src/main/services/iv-rank-lookup.ts` over IV30 history (`iv-rank-lookup.ts:1-9`). `IvRank` itself is still at `screener.ts:51`.
- ✗ "the DTE-window conversion happens once, in the screener service" — the horizon is now computed in `src/main/services/earnings-horizon.ts:53` (`readEarningsOrEmpty`, imported by `services/screener.ts:23` and `services/watchlist-snapshot.ts:24`). Minor; add `earnings-horizon.ts` to Source files.

## Unverifiable (3)

- ? "Massive gates earnings behind a paid add-on and Alpaca does not serve it" — vendor-policy rationale; Massive is retired (US-99), so read as history. Not a code claim.
- ? Read-through store semantics (past-date rejection shared by fetched and stored rows; DB write failure swallowed; whole-store failure degrades to `unavailable`) — plausible in `earnings-dates.ts` but not traced line-by-line.
- ? Known gaps (shallow-horizon starvation, clobbering) — behavioural narrative.

## Missing files (1)

- ✗ `src/renderer/src/components/ScreenerResultsTable.tsx` (listed in Source files) does not exist. All linked spec pages (us-56, us-65, us-66, us-67, us-98, domain/market-data, domain/alerts, schema/tables) resolve.
