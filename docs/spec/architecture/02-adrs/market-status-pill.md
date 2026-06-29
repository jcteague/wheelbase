# ADR: Market-status pill (LIVE / EXT / CLOSED / DELAYED) polled at 60 s

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

The positions list header renders a `MarketStatusPill` with one of four states:

- **LIVE** — regular session; green dot with the `animate-wb-pulse` animation.
- **EXT** — pre-market or after-hours; amber dot, no pulse.
- **CLOSED** — outside extended hours or weekend/holiday; gray dot.
- **DELAYED** — stream error received OR `Date.now() - dataUpdatedAt > 5 min`; amber dot, no pulse.

The pill's session value comes from a `useMarketStatus()` hook (`src/renderer/src/hooks/useMarketStatus.ts`) that polls the **broker** IPC channel `broker:market-status` with `refetchInterval: 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`. The renderer calls it through `window.api.broker.marketStatus()`; the query key is `brokerQueryKeys.marketStatus` = `['broker', 'market-status']`. There is **no** `market-data:market-status` channel — market clock/session is a broker concern, served by `AlpacaBrokerProvider` (`src/main/integrations/alpaca-broker.ts`) via the handler in `src/main/ipc/broker.ts`. The handler returns `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`.

Display precedence (highest first): stale → DELAYED; `session === 'regular'` → LIVE; `session === 'pre'|'post'` → EXT; otherwise CLOSED. This logic is extracted as `deriveMarketStatusDisplay()` in `src/renderer/src/lib/market-status.ts` for isolated testability.

The function signature is `deriveMarketStatusDisplay(session, stale)` — two positional args: the `session` enum and a single `stale` boolean. The DELAYED override (originally framed as separate "stream error" and ">5 min staleness" conditions) is collapsed into that one `stale` boolean by the caller; the pure function itself does not see `streamError` or `dataUpdatedAt`.

## Context / Why

- Market status changes ~6 times per day at predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, plus weekends/holidays). A 60-second poll catches transitions within a minute.
- Computing the session client-side from `Date.now()` plus a hardcoded ET schedule is fragile (holidays, half-days); the broker's clock endpoint is authoritative.
- Market clock/session lives on the **broker** provider (still Alpaca), not the market-data provider. The market-data vendor moved to Massive (a Polygon-compatible delayed-data vendor), but Massive has no clock/session endpoint — so the broker concerns (account, market clock/session, activities) were split onto a dedicated `broker:*` namespace served by `AlpacaBrokerProvider`. See ADR [market-data-massive-migration](../../.extracts/market-data-massive-migration.md) for the provider split.
- The DELAYED override (stream error or 5-min staleness) takes precedence so a stuck stream always surfaces visually, even if the broker says the market is "open".
- A project memory note says: "MarketStatusPill, not polling indicator" — reuse this exact component on both list and detail headers; never invent "POLL" / timing copy.

## Alternatives considered

- **Compute session client-side from a hardcoded schedule** — fragile (holidays, half-days, DST).
- **Skip polling entirely** — the indicator gets stuck on its initial value.
- **Stream the market status** — neither provider offers a streaming option for clock/session.
- **Keep market status on the `market-data:*` namespace** — rejected during the Massive migration: the market-data vendor (Massive) has no clock endpoint, so the session read stays with the broker (Alpaca) on `broker:market-status`.
- **Show "POLL" / timing copy** — explicitly rejected by the project's UX guidance.

## Consequences

- `useMarketStatus()` polls a broker channel, while `useStockQuotes()` reads quotes from the market-data channels — sibling TanStack Query hooks across two IPC namespaces; see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md).
- `deriveMarketStatusDisplay(session, stale)` is a pure function unit-testable without the hooks.
- Pill colours use Tailwind `wb-*` design tokens (not hex): `bg-wb-green` / `text-wb-green` for LIVE, `bg-wb-gold` / `text-wb-gold` for EXT and DELAYED, `bg-wb-text-secondary` / `text-wb-text-secondary` for CLOSED. The pulse is applied via the Tailwind utility class `animate-wb-pulse`, only when state is `LIVE`.
- The pill currently renders only on the positions list header (`src/renderer/src/pages/PositionsListPage.tsx`); the position detail header does not yet show it.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Market Status — REST + TanStack Query polling"; `MarketStatusDisplay` derivation table
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — ADR "Broker concerns split onto a dedicated `broker:*` namespace"; confirms no `market-data:market-status` channel
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
