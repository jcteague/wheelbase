---
page: docs/spec/features/us-66-screener-results.md
audited_at: 2026-09-28
findings: 10
---

# Audit: docs/spec/features/us-66-screener-results.md

## Verified (14)

- ✓ `src/renderer/src/lib/screener-format.ts` exports `fmtYieldPercent` (`:10`), `fmtScore` (`:14`), `fmtSpread` (`:18`), `fmtDelta` (`:22`), `formatIvrValue` (`:26`), `fmtOpenInterest` (`:31`), `fmtQuoteTime` (`:35`). The file also has `fmtCriteriaSummary` (`:44`, US-67).
- ✓ `fmtIvr` no longer exists (grep finds none), and `src/renderer/src/components/IvrCell.tsx` exists. Matches the US-98 replacement note.
- ✓ `api/screener.ts` throws via `throwMappedIpcErrors` only on `ok:false` (`:69`); `status: 'ok' | 'provider_unavailable'` is kept as data (`:57-60`).
- ✓ `useScreenerResults` uses `screenerQueryKeys.results` with no `refetchInterval` (`src/renderer/src/hooks/useScreenerResults.ts:5,9`; `screenerQueryKeys.ts:2`).
- ✓ `ScreenerStateCard` takes a `tone` prop and exposes `data-tone` (`src/renderer/src/components/ScreenerStateCard.tsx:19,46`).
- ✓ Stale badge keys off `useMarketStatusDisplay()` with `display === 'CLOSED'` plus ranked rows and a `quoteTimestamp` (`src/renderer/src/pages/WatchlistPage.tsx:77,101`). The `Stale snapshot` badge and `screener-stale-badge` are at `components/BenchHeader.tsx:55-58`.
- ✓ The DOM hooks `screener-empty` (`BenchGrid.tsx:81`), `screener-unavailable` (`MarketDataOutage.tsx:42`) and `screener-stale-badge` still exist.
- ✓ `App.tsx` uses a `PAGE_TITLES` lookup (`src/renderer/src/App.tsx:19`).
- ✓ `e2e/screener-results.spec.ts` exists and covers the six ACs (`:53,79,102,116,132,179`).
- ✓ `e2e/assignment-helpers.ts` exports `launchElectron(env)` (`:164`); `e2e/ivr-helpers.ts` delegates to it (`:16,219`).
- ✓ `e2e/screener-helpers.ts` exists.
- ✓ The `screener:results` contract is consumed unchanged (see us-65 audit).
- ✓ Linked docs exist: `architecture/03-design-system.md`, ADR `market-status-pill`, and feature pages us-63/64/65/67/68/70/98.
- ✓ `api/screener.ts`, `hooks/screenerQueryKeys.ts`, `hooks/useScreenerResults.ts` and `ScreenerStateCard.tsx` exist.

## Drift (10)

- ✗ **The `/screener` page no longer exists.** The page describes a `/screener` route, `ScreenerPage` exporting `SCREENER_PAGE_TITLE`, and an `⌕ Screener` nav item in the present tense. `src/renderer/src/pages/ScreenerPage.tsx` was deleted in `152aabf` ("combined screener with watchlist", US-96). `App.tsx` `PAGE_TITLES` has no screener entry (`App.tsx:19-24`), and `e2e/screener-helpers.ts:302` says "there is no `#/screener` any more". Results now render in the watchlist bench (`WatchlistPage.tsx:25,73`). Suggested fix: frame as history and point to us-96.
- ✗ Page describes `ScreenerResultsTable` (a 12-column `<table>` on `TablePrimitives`, `ScoreLegend`, rank chip). The file does not exist; the bench renders cards (`BenchGrid.tsx`, `BenchCard.tsx`, `BenchDetail.tsx`), and grep finds no `ScoreLegend` in `src/renderer/src`.
- ✗ Page describes `ScreenerExcludedSection` (collapsible, `screener-excluded-toggle`, `screener-excluded-row-<ticker>`). The file does not exist, and grep finds neither testid in `src/renderer/src`.
- ✗ DOM contract lists `screener-row-<ticker>` with `data-yield-per-delta`, `screener-count` and `screener-stale-caption`. Grep finds none of these in `src/renderer/src`. The e2e helpers note that the caption "moved into the header's own `Stale snapshot` badge" (`e2e/screener-results.spec.ts:188`).
- ✗ The ADR "The score is a row data-attribute, not a 13th column" (`data-yield-per-delta`) describes a removed surface; no `data-yield-per-delta` attribute exists in `src/renderer/src`.
- ✗ The ADR "Built on `TablePrimitives`, not a new shadcn `Table`" describes the removed table and cites `WatchlistPage` as a `TablePrimitives` consumer, but the watchlist is now card-based (US-96).
- ✗ The ADR "Route paths stay stated in three places" (nav item, title map, `Switch`) no longer applies to the screener, which has no route.
- ✗ The e2e fixtures ADR says IV ranks are seeded "through the real `ivr-collect` job over the US-44 fake-scraper seam". Scraping is retired. `seedIvr` now waits for IV30 history backfilled by `watchlist.add` from a fake IV series (`e2e/screener-helpers.ts:264-300`, "[US-98/US-121]").
- ✗ Page says `e2e/screener-results.spec.ts` "runs six scenarios — one per AC". It has 8 `it()` cases; the extra Alpaca-outage copy cases are at `:149,163`.
- ✗ AC text "when Massive was unreachable" is a present-tense vendor reference; the provider is Alpaca (the e2e case is "Screener outage card names Alpaca", `:149`).

## Unverifiable (3)

- ? "The renderer never re-sorts, never computes a yield". Design rule; not mechanically verified across the bench components.
- ? "Trailing-zero trimming deliberately mirrors the US-65 engine". Rationale.
- ? Falsification-by-flipped-values narrative for the e2e suite. Process history.

## Missing files (3)

- ✗ `src/renderer/src/components/ScreenerResultsTable.tsx` does not exist.
- ✗ `src/renderer/src/components/ScreenerExcludedSection.tsx` does not exist.
- ✗ `src/renderer/src/pages/ScreenerPage.tsx` does not exist.
