# ADR: Market-status pill (LIVE / EXT / CLOSED / DELAYED) polled at 60 s

<!-- generated:from us-32 -->

## Decision

The page header renders a `MarketStatusPill` with one of four states:

- **LIVE** — regular session; green dot with `wb-pulse` animation.
- **EXT** — pre-market or after-hours; amber dot, no pulse.
- **CLOSED** — outside extended hours or weekend/holiday; gray dot.
- **DELAYED** — stream error received OR `Date.now() - dataUpdatedAt > 5 min`; amber dot, no pulse.

The pill's session value comes from a `useMarketStatus()` hook that polls `market-data:market-status` with `refetchInterval: 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`. The provider returns `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`.

Display precedence (highest first): `streamError != null` → DELAYED; stale (>5 min) → DELAYED; `session === 'regular'` → LIVE; `session === 'pre'|'post'` → EXT; otherwise CLOSED. This logic is extracted as `deriveMarketStatusDisplay()` in `src/renderer/src/lib/market-status.ts` for isolated testability.

## Context / Why

- Market status changes ~6 times per day at predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, plus weekends/holidays). A 60-second poll catches transitions within a minute.
- Computing the session client-side from `Date.now()` plus a hardcoded ET schedule is fragile (holidays, half-days); the provider's clock endpoint is authoritative.
- The DELAYED override (stream error or 5-min staleness) takes precedence so a stuck stream always surfaces visually, even if the provider says the market is "open".
- A project memory note says: "MarketStatusPill, not polling indicator" — reuse this exact component on both list and detail headers; never invent "POLL" / timing copy.

## Alternatives considered

- **Compute session client-side from a hardcoded schedule** — fragile (holidays, half-days, DST).
- **Skip polling entirely** — the indicator gets stuck on its initial value.
- **Stream the market status** — the provider has no streaming option for clock/session.
- **Show "POLL" / timing copy** — explicitly rejected by the project's UX guidance.

## Consequences

- `useMarketStatus()` is a sibling hook to `useStockQuotes()` — see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md).
- `deriveMarketStatusDisplay({ session, streamError, dataUpdatedAt })` is a pure function unit-testable without the hooks.
- Pill colours: green `#3fb950` (LIVE), amber `#e6a817` (EXT/DELAYED), gray `#6e7681` (CLOSED). The pulse animation (`@keyframes wb-pulse`) lives in `src/renderer/src/index.css` and is applied only when state is `LIVE`.
- The pill renders on both the positions list header and the position detail header — same component, same data.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Market Status — REST + TanStack Query polling"; `MarketStatusDisplay` derivation table
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
