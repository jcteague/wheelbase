# ADR: Market-status pill (LIVE / EXT / CLOSED / DELAYED) polled at 60 s

<!-- generated:from us-32,market-data-massive-migration,us-116 -->

## Decision

The positions list header renders a `MarketStatusPill` with one of four states:

- **LIVE** — regular session; green dot with the `animate-wb-pulse` animation.
- **EXT** — pre-market or after-hours; amber dot, no pulse.
- **CLOSED** — outside extended hours or weekend/holiday; gray dot.
- **DELAYED** — stream error received OR `Date.now() - dataUpdatedAt > 5 min`; amber dot, no pulse.

[US-116] The pill's session value comes from a `useMarketStatus()` hook (`src/renderer/src/hooks/useMarketStatus.ts`) that polls the **market-data** IPC channel `market-data:market-status` with `refetchInterval: 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`. The renderer calls it through `window.api.marketData.marketStatus()`; the query key is `marketDataQueryKeys.marketStatus` = `['market', 'status']`. There is **no** `broker:market-status` channel — the exchange session is a market fact, served by `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`) via the handler in `src/main/ipc/market-data.ts`. The handler returns `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`.

The query is **gated on market-data credentials**: `useMarketStatusDisplay` enables it only when `settingsQuery.data?.marketData === 'configured'` (the field is `hasMarketData`, formerly `hasBroker`). A journal-only install with no broker therefore still polls and still resolves. While settings are loading the gate is `false`, so no speculative request is issued — the old predicate `data?.activeBrokerEnv !== 'none'` was accidentally `true` for `undefined`, firing one request whose result TanStack Query then cached indefinitely.

Display precedence (highest first): stale → DELAYED; `session === 'regular'` → LIVE; `session === 'pre'|'post'` → EXT; otherwise CLOSED. This logic is extracted as `deriveMarketStatusDisplay()` in `src/renderer/src/lib/market-status.ts` for isolated testability.

The function signature is `deriveMarketStatusDisplay(session, stale)` — two positional args: the `session` enum and a single `stale` boolean. The DELAYED override (originally framed as separate "stream error" and ">5 min staleness" conditions) is collapsed into that one `stale` boolean by the caller; the pure function itself does not see `streamError` or `dataUpdatedAt`.

## Context / Why

- Market status changes ~6 times per day at predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, plus weekends/holidays). A 60-second poll catches transitions within a minute.
- Computing the session client-side from `Date.now()` plus a hardcoded ET schedule is fragile (holidays, half-days); the vendor's clock endpoint is authoritative. The client-side calendar survives only as the fallback `deriveMarketStatusDisplay` uses when no session has been reported — see Consequences.
- [US-116] Market clock/session lives on the **market-data** provider. It sat on the broker between the Massive migration (Massive had no clock endpoint, so account, clock and activities were split onto `broker:*`) and US-99 (which retired Massive). US-116 moved it back: "is the exchange open" is a fact about the market, and leaving it on the broker left the pill dead on any install without one. Alpaca serves `/v2/clock` from the same trading host and key pair the market-data provider already uses for open interest.
- The DELAYED override (stream error or 5-min staleness) takes precedence so a stuck stream always surfaces visually, even if the broker says the market is "open".
- A project memory note says: "MarketStatusPill, not polling indicator" — reuse this exact component on both list and detail headers; never invent "POLL" / timing copy.

## Alternatives considered

- **Compute session client-side from a hardcoded schedule** — fragile (holidays, half-days, DST).
- **Skip polling entirely** — the indicator gets stuck on its initial value.
- **Stream the market status** — neither provider offers a streaming option for clock/session.
- **Keep market status on the `broker:*` namespace** — rejected by US-116: it gates a market fact on an optional broker relationship, and leaving a market fact on a `broker:` channel re-creates the confusion the move exists to remove.
- **Show "POLL" / timing copy** — explicitly rejected by the project's UX guidance.

## Consequences

- [US-116] `useMarketStatus()` and `useStockQuotes()` are now sibling TanStack Query hooks on the **same** `market-data:*` namespace, both keyed under `['market', …]`; see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md). `useSettings`' invalidation predicate widened from `queryKey[0] === 'broker'` to `'broker' | 'market'` accordingly — without it, saving credentials would silently stop refreshing the pill.
- **When the query is disabled, the pill falls back to the local NYSE calendar.** `deriveMarketStatusDisplay(session, stale)` computes `session ?? computeNYSESession()`, so an install with no market-data credentials shows a wall-clock-derived state rather than an error. A consequence for tests: a single `LIVE` assertion is satisfiable by the clock alone during market hours, so a spec proving the query actually runs must assert two opposite fixtures.
- `deriveMarketStatusDisplay(session, stale)` is a pure function unit-testable without the hooks.
- Pill colours use Tailwind `wb-*` design tokens (not hex): `bg-wb-green` / `text-wb-green` for LIVE, `bg-wb-gold` / `text-wb-gold` for EXT and DELAYED, `bg-wb-text-secondary` / `text-wb-text-secondary` for CLOSED. The pulse is applied via the Tailwind utility class `animate-wb-pulse`, only when state is `LIVE`.
- The pill currently renders only on the positions list header (`src/renderer/src/pages/PositionsListPage.tsx`); the position detail header does not yet show it.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Market Status — REST + TanStack Query polling"; `MarketStatusDisplay` derivation table
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — ADR "Broker concerns split onto a dedicated `broker:*` namespace"; confirms no `market-data:market-status` channel
- [extract: us-116](../../.extracts/us-116.md) — ADRs "`broker:market-status` is renamed, not re-pointed" and "The pill gates on market-data credentials"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
- [feature: us-116-market-facts-from-market-data-provider](../../features/us-116-market-facts-from-market-data-provider.md)
<!-- /generated -->
