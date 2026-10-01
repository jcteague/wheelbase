# ADR: Call-chain picker: chain IPC, client-side delta band, one-shot underlying snapshot

<!-- generated:from us-101 -->

## Decision

**The `useCallChain` hook.** Each PMCC leg picks its contract through `useCallChain({ ticker, preset, underlyingPrice })`. The hook wraps a TanStack query on the existing `market-data:option-chain` IPC with `type: 'call'`, the preset's expiration window (`chainWindow`) and strike bounds (`strikeBounds`). It uses a 30 s `staleTime` and a 60 s `refetchInterval`, is enabled only for a valid ticker, and filters through `select: filterCallChain`. The presets are `LEAPS_PRESET` (180+ DTE, Δ 0.70–0.85, strikes below spot) and `SHORT_PRESET` (20–45 DTE, Δ 0.25–0.35, strikes above spot).

As shipped:

- **No `limit` on the request.** The adapter follows every page, because a 180+ DTE call window on a liquid name runs well past one 250-contract page. This supersedes research's single-page `limit: 250` plan and its truncation risk.
- **Delta band applied client-side.** Alpaca's chain filter has no delta parameter.
- **Greek-less contracts are kept**, sorted to the end and shown as `Δ —`.
- **Adjusted contracts are dropped:** any quote whose OCC root is not the ticker never reaches the picker.
- **The selection survives refetches.** `filterCallChain` keeps the selected contract even when a refetch moves it out of the band. The leg section holds the last-seen selected quote, so the select, quote strip and stale notice survive a refetch that omits it.
- **`placeholderData` keeps the previous page for the same ticker** during a refetch. A different ticker does not inherit it.
- **Idle when there is no ticker.** A disabled chain query reports `idle`, so "Loading…" never shows before a ticker is typed.

Notices come from the pure `deriveChainNotice` in priority order `loading` → `unavailable` → `empty` → `stale`. A notice is `stale` when the selected quote is older than `STALE_QUOTE_MS` (5 min). The copy comes from `chainNoticeMessage`, the same derive/message split as `derivePromoteBanner`. A selection writes only `strike`, `expiration` and `contractId`. Fill, fees and fill date are never written by a selection or a refetch, and `Enter manually` clears the selection and unlocks the fields.

**The underlying price comes from `useUnderlyingPrice(ticker)`, not `useStockQuotes([ticker])`.** It is a one-shot `getStockQuotes` snapshot on its own query key, and it never touches the stock-quote subscription.

## Context / Why

- The `MarketDataProvider` abstraction already sits behind `market-data:option-chain`, so no new IPC or adapter method is needed.
- The 5-minute stale threshold matches the detail page's `SNAPSHOT_STALE_THRESHOLD_MS`.
- **Why not `useStockQuotes`, the single-subscription hazard:** `useStockQuotes` owns the main process's **single** stock-quote stream subscription. It calls `setStockQuoteTickers` on mount and `[]` on unmount. Mounting it inside the sheet replaced the positions list's live feed with the sheet's one ticker, then cleared the feed entirely when the sheet closed. The plan's assumption that "the query is shared" did not hold. Separately, a live price in the chain's query key would drop the selected contract on every tick, so the delta band is anchored on a one-shot price.
- An interim version polled on a 30 s stale / 60 s refetch. It was reduced to a one-shot snapshot because the band only needs a rough anchor.

## Alternatives considered

- **Reuse `services/candidate-chains.ts`.** Rejected: it is watchlist-shaped and put-only.
- **Single-contract re-quotes via `usePromotedQuote`.** Rejected here as the wrong shape for browsing; it is the right tool for US-122's promote.
- **`useStockQuotes([ticker])` for the underlying.** Rejected for the subscription hazard above.

## Consequences

- `useStockQuotes` is single-subscriber by design. A second concurrent live consumer would need a reference-counted subscription in the main process; this is tracked as tech debt. This ADR narrows [underlying-via-stockquotes](./underlying-via-stockquotes.md), which still holds for the list and cockpit.
- The picker stays usable with no market data. Every notice leaves manual entry open, so the app remains a journal without a live feed.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
