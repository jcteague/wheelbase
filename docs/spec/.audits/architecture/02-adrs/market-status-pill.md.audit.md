---
page: docs/spec/architecture/02-adrs/market-status-pill.md
audited_at: 2026-06-29
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/market-status-pill.md

## Verified (13)

- ✓ IPC channel `broker:market-status` registered in `src/main/ipc/broker.ts:26` via `handleIpcCall`, returning `{ status }`.
- ✓ Renderer calls it through `window.api.broker.marketStatus()` — `src/preload/index.ts:38` exposes `marketStatus: () => invoke('broker:market-status')`.
- ✓ Hook lives at `src/renderer/src/hooks/useMarketStatus.ts` and uses TanStack `useQuery`.
- ✓ Poll/cache options match: `refetchInterval: 60_000` (`REFETCH_INTERVAL_MS = 60_000`), `staleTime: 30_000` (`STALE_TIME_MS = 30_000`), `refetchOnWindowFocus: true` — `useMarketStatus.ts:5-17`.
- ✓ Query key `brokerQueryKeys.marketStatus = ['broker', 'market-status']` — `src/renderer/src/hooks/brokerQueryKeys.ts:4`.
- ✓ No `market-data:market-status` channel exists; market clock/session is a broker concern. grep finds only `broker:market-status`.
- ✓ Served by `AlpacaBrokerProvider.getMarketStatus()` in `src/main/integrations/alpaca-broker.ts:196`.
- ✓ Handler/provider returns `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }` — `alpaca-broker.ts:201-204`; renderer type matches at `src/renderer/src/api/broker.ts:11-15`.
- ✓ Display precedence implemented as `deriveMarketStatusDisplay()` in `src/renderer/src/lib/market-status.ts:18`: stale → DELAYED; `regular` → LIVE; `pre`/`post` → EXT; else CLOSED.
- ✓ Function signature is `deriveMarketStatusDisplay(session, stale)` — two positional args (`MarketSession | undefined`, `boolean`); the pure function does not reference `streamError` or `dataUpdatedAt` (`market-status.ts:18-26`).
- ✓ DELAYED override collapsed into one `stale` boolean by the caller: `useStockQuotes.ts:117` ORs `staleInfo.stale || streamError !== null`; `PositionsListPage.tsx:189` passes that single `stale` into `deriveMarketStatusDisplay`.
- ✓ Pill colours use `wb-*` tokens (not hex): LIVE `text-wb-green`/`bg-wb-green`, EXT & DELAYED `text-wb-gold`/`bg-wb-gold`, CLOSED `text-wb-text-secondary`/`bg-wb-text-secondary` — `src/renderer/src/components/MarketStatusPill.tsx:9-21`. `animate-wb-pulse` applied only when `state === 'LIVE'` (`MarketStatusPill.tsx:34`).
- ✓ Linked docs exist: `../../.extracts/market-data-massive-migration.md`, `./market-data-tanstack-cache.md`, `../../.extracts/us-32.md`, `../../features/us-32-live-position-prices.md`.

## Drift (1)

- ✗ Page claims (Decision §1 "The page header renders a `MarketStatusPill`" and Consequences: "The pill renders on **both** the positions list header and the position detail header — same component, same data"). In code the pill is rendered **only** on the positions list: `MarketStatusPill` is imported/used solely in `src/renderer/src/pages/PositionsListPage.tsx:12,64`. The position detail page (`src/renderer/src/pages/PositionDetailPage.tsx`, `PositionDetailContent.tsx`) has no reference to `MarketStatusPill`, `useMarketStatus`, or `broker` market status (grep returns nothing). Suggested fix: either render the pill on the detail header, or update the page to say the pill currently appears only on the list header. (Note: this also contradicts the project memory note quoted in §Context line 26 — "reuse this exact component on both list and detail headers".)

## Unverifiable (0)

(none)

## Missing files (0)

(none)
