---
page: docs/spec/features/us-68-promote-result-to-new-wheel.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/features/us-68-promote-result-to-new-wheel.md

## Verified (24)

- ✓ `src/renderer/src/lib/promote.ts` exports `buildPromoteSearch` (`:50`), `parsePromotedParams` (`:69`), `markMovedMaterially` (`:94`), `isPremiumOverridden` (`:137`), `derivePromoteBanner` (`:153`), `promoteBannerMessage` (`:179`); signatures match the Contracts block.
- ✓ Threshold is `|fresh − promoted| > max($0.05, 5%)`, strict `.gt`, via `decimal.js` (`promote.ts:94-98`).
- ✓ Banner precedence offline > stale > moved > edited > match > none; `stale` carries `session: 'CLOSED' | 'EXT'` (`promote.ts:104-111`, `:153-173`).
- ✓ `derivePromoteBanner` tests only `CLOSED || EXT` (`promote.ts:157`); `MarketStatusDisplay` has four members incl. `DELAYED` (`MarketStatusPill.tsx:3`); `useMarketStatusDisplay(stale = false)` default (`useMarketStatusDisplay.ts:20`) and `usePromoteBanner` calls it with no argument (`usePromoteBanner.ts:35`) — Known-gap claim accurate.
- ✓ Banner copy "Price moved: quoted … → now … — review before submitting" and "Couldn't refresh quote — showing screener snapshot from …" (`promote.ts:183-192`).
- ✓ `parseInputDecimal` and `parsePositiveInputDecimal` in `src/renderer/src/lib/decimal-input.ts:11,17`.
- ✓ `computeDteFromInput` uses `differenceInCalendarDays(parseISO(…), new Date())` (`src/renderer/src/lib/format.ts:71-73`); older `computeDte` uses `Date.UTC` (`format.ts:48-50`) and backs `lib/verdict.ts:152`.
- ✓ `usePromotedQuote` uses `buildOccSymbol`, `getOptionSnapshots`, `staleTime: Infinity`, `gcTime: 0`, `retry: false`, no interval/focus refetch (`usePromotedQuote.ts:2-53`), under `marketDataQueryKeys.promotedQuote` (`marketDataQueryKeys.ts:10`).
- ✓ `PromotedFormChrome` owns `usePromoteBanner` (`PromotedFormChrome.tsx:24`), rendered only in promoted mode.
- ✓ `NewWheelForm` optional `promoted` prop (`NewWheelForm.tsx:62`), defaults `contracts: '1'` and seeds thesis (`:40-48`), opens Advanced when promoted (`:72`), `useWatch` for live derived values (`:97-99`), override read from `isPremiumOverridden` directly (`:105`).
- ✓ `NewWheelPage` parses once in a `useState` initializer (`NewWheelPage.tsx:24`) and clears via `history.replaceState` (`:36`).
- ✓ DOM contract `promote-provenance` (`PromoteProvenance.tsx:16`), `promote-banner` with `data-kind`/`data-tone` (`PromotedQuoteNotice.tsx:28`), `derived-capital` / `derived-yield` (`NewWheelDerivedRow.tsx:65,76`).
- ✓ "⊞ Promoted from Screener" provenance strip (`PromoteProvenance.tsx:20`).
- ✓ `e2e/promote-to-trade.spec.ts` exists with 10 `it()`s: 9 AC scenarios (CLOSED and EXT split) + 1 leak regression (`:66-223`).
- ✓ `e2e/screener-helpers.ts` has promote helpers (`promoteCard` `:990`, `promoteBannerKind` `:997`) and watchlist notes (`:346`).
- ✓ All other key files exist: `usePromoteBanner.ts`, `PromotedQuoteNotice.tsx`, `NewWheelDerivedRow.tsx`, `ui/AlertBox.tsx`, `ui/TablePrimitives.tsx`, `src/main/core/dte.ts`.
- ✓ No migration / no IPC added — nothing US-68-specific found in `src/main/ipc/`.
- ✓ Linked pages us-63, us-65, us-66, us-67, us-39, `contracts/ipc-handlers.md`, `architecture/03-design-system.md` exist.

## Drift (6)

- ✗ Key files cite `src/renderer/src/components/ScreenerResultsTable.tsx` — deleted in commit `152aabf` ("combined screener with watchlist", US-96). The entry point is now a **`Review trade →`** button on `MatchingPutCard` (`src/renderer/src/components/MatchingPutCard.tsx:50-54`), not a "Promote to trade" action column on a ranked table.
- ✗ Key files cite `src/renderer/src/pages/ScreenerPage.tsx` — deleted in `152aabf`. The promote effect (note lookup + navigate) now lives in `WatchlistPage.handleReview` (`src/renderer/src/pages/WatchlistPage.tsx:156-159`). The Contracts section's "produced by `ScreenerPage`" is likewise stale.
- ✗ DOM contract `screener-promote-<ticker>` no longer exists in `src/renderer/src`; the e2e helper clicks `bench-review-<ticker>` (`e2e/screener-helpers.ts:992`, `MatchingPutCard.tsx:50`).
- ✗ "The 12 metric columns US-66 pinned keep their positions" / "trailing, unlabelled action column" — no screener results table remains (see above).
- ✗ Summary names the seam `market-data:optionSnapshots`; the registered channel is `market-data:option-snapshots` (`src/main/ipc/market-data.ts:65`, `src/preload/index.ts:33`). Also names `useWatchlist` as a seam; the page now reads notes from `useWatchlistSnapshot` (`WatchlistPage.tsx:20,72,157`).
- ✗ Related link "US-39 — Massive market-data provider — the fresh quote's source" is present tense, but Massive was retired by US-99; the fresh quote now comes from the Alpaca market-data provider. Suggested fix: point at `us-99-alpaca-market-data-provider.md` or frame US-39 as history.

## Unverifiable (4)

- ? "All 10 assertions were falsified against the running app before being trusted" — process claim.
- ? "the provider re-reads `process.env` on every call, so no new test seam was needed" — not traced into the fake provider.
- ? "`computeDte` still backs ~9 call sites" — 10 non-test renderer files reference `computeDte(` (incl. `format.ts` itself); roughly consistent, not counted per call site.
- ? Wouter `navigate` / `useHashLocation` `searchHook` behaviour rationale — library behaviour, not in repo code.

## Missing files (2)

- ✗ `src/renderer/src/components/ScreenerResultsTable.tsx`
- ✗ `src/renderer/src/pages/ScreenerPage.tsx`
