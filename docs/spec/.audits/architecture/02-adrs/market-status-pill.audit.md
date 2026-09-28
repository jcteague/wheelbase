---
page: docs/spec/architecture/02-adrs/market-status-pill.md
audited_at: 2026-09-28
findings: 2
---

# Audit: market-status-pill.md

## Verified (11)

- ✓ Four states `LIVE | EXT | CLOSED | DELAYED` — `src/renderer/src/components/MarketStatusPill.tsx:3`.
- ✓ Token classes: LIVE `bg-wb-green`/`text-wb-green`, EXT & DELAYED `bg-wb-gold`/`text-wb-gold`, CLOSED `bg-wb-text-secondary`/`text-wb-text-secondary` — `MarketStatusPill.tsx:9-21`; `animate-wb-pulse` only when `LIVE` — `:29-36`.
- ✓ `useMarketStatus()` at `src/renderer/src/hooks/useMarketStatus.ts` with `refetchInterval: 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true` — `useMarketStatus.ts:6-17`.
- ✓ Query key `marketDataQueryKeys.marketStatus = ['market', 'status']` — `src/renderer/src/hooks/marketDataQueryKeys.ts:2`.
- ✓ Renderer calls `window.api.marketData.marketStatus()` → `market-data:market-status` — `src/renderer/src/api/market-data.ts:59-60`, `src/preload/index.ts:56`; handler `src/main/ipc/market-data.ts:88-93`; provider `AlpacaMarketDataProvider.getMarketStatus` — `src/main/integrations/alpaca-market-data.ts:223`.
- ✓ No `broker:market-status` channel — `src/main/ipc/broker.test.ts:111-120`.
- ✓ Gate `settingsQuery.data?.marketData === 'configured'` → `useMarketStatus(hasMarketData)` — `src/renderer/src/hooks/useMarketStatusDisplay.ts:20-23`; `undefined` while loading → `false`.
- ✓ `deriveMarketStatusDisplay(session, stale)` two positional args; precedence stale → DELAYED, regular → LIVE, pre/post → EXT, else CLOSED — `src/renderer/src/lib/market-status.ts:18-27`.
- ✓ Fallback `session ?? computeNYSESession()` when no session — `market-status.ts:6-16, 23`.
- ✓ `useSettings` invalidation predicate `queryKey[0] === 'broker' || queryKey[0] === 'market'` — `src/renderer/src/hooks/useSettings.ts:35`.
- ✓ `useMarketStatus` and `useStockQuotes` both keyed under `['market', …]` — `marketDataQueryKeys.ts:2-4`.

## Drift (2)

- ✗ Line 44: "The pill currently renders only on the positions list header … the position detail header does not yet show it." It also renders on `src/renderer/src/pages/CalendarPage.tsx:60` and in `src/renderer/src/components/BenchHeader.tsx:93` (watchlist bench; `useMarketStatusDisplay` also used by `WatchlistPage.tsx`, `PromotedFormChrome.tsx`). The detail-header half remains true (no pill in `PositionDetailPage.tsx`). Suggested fix: list current surfaces.
- ✗ Line 14: "The handler returns `{ isOpen, nextOpen, nextClose, session }`." The handler returns `{ status }` wrapping that object (`src/main/ipc/market-data.ts:90-91`), unwrapped in `api/market-data.ts:59-62`. Minor shape wording.

## Unverifiable (3)

- ? "Market status changes ~6 times per day … 60 s poll catches transitions within a minute" — rationale.
- ? Line 16 "the field is `hasMarketData`, formerly `hasBroker`" — `hasMarketData` is a local/return field of `useMarketStatusDisplay` (`:12, 21`); the settings field is `marketData` (`src/main/services/settings.ts:12`). History of `hasBroker` not checkable.
- ? Memory-note guidance (no "POLL" copy) — UX policy.

## Missing files (0)

None.
