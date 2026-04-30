# Research: US-32 — Live Underlying Price on Position List

## Goal

Show live underlying price + daily change on every active position row, driven by the existing `MarketDataProvider` (US-31). Use the provider's WebSocket streaming (already implemented) — not REST polling — so prices update in real time as the broker pushes them.

The story's Technical Notes were written assuming polling; we're overriding that since streaming is already built. The acceptance criteria themselves are agnostic to the transport — they describe what the user sees ("price updates without page reload", "stale warning >5 min"), not how data arrives.

---

## Transport: Stream-First with REST Seed

- **Decision:** Use `provider.stream('stockQuotes', tickers)` for live updates. On every ticker-list change, also fire a one-shot `provider.getStockQuotes(tickers)` to seed the renderer with current price + `change` (which depends on `prev_daily_bar.c` and isn't carried by stream events). After the seed, all updates flow through the WebSocket Observable.
- **Rationale:** Alpaca's stock stream pushes only `bp`/`ap`/`bs`/`as`/`t` per quote frame — no previous-close field. Without a REST seed, the price column would be empty until the first tick arrives (which during low-liquidity hours could be a long wait), and `change` could never be computed at all. Combining streaming for live updates with a single REST call for the per-day baseline gives us both real-time movement and accurate daily change with one initial round-trip.
- **Alternatives considered:**
  - Pure REST polling (story's original suggestion) — works but wastes the streaming infrastructure US-31 already built; updates lag by up to 60 s.
  - Pure streaming with no seed — rows blank until first tick, no `change` value possible from stream alone.
  - Stream-only and compute change client-side from a remembered "first price seen today" — drifts when the app is opened mid-session (the first observed tick isn't the open price).

---

## Provider Lifecycle in the Main Process

- **Decision:** Instantiate `createMarketDataProvider(...)` once at app startup in `src/main/index.ts`. Call `provider.connect()` on first subscription request from the renderer, not at startup, so the WebSocket only opens when needed. Hold the provider instance and current Observable subscription at module level inside `src/main/ipc/market-data.ts`. On `app.before-quit`, call `provider.disconnect()`.
- **Rationale:** Connecting on startup wastes a WebSocket while the user is on, e.g., the New Wheel page with no active positions. Connecting on first subscribe matches user intent: the renderer has decided it wants live data. Single `connect()` per app session matches the provider's contract — multiple connect calls would be ambiguous.
- **Alternatives considered:**
  - `connect()` at startup unconditionally — opens a socket the user may never use.
  - `connect()` per ticker change — recreates the WebSocket on every position add/remove; the provider's design uses one persistent socket and multiplexes subscriptions over it.

---

## Renderer-Initiated Subscription Updates

- **Decision:** Renderer calls `window.api.setStockQuoteTickers(tickers)` whenever the active-ticker list changes (positions added, closed, or initial mount). Main-process handler:
  1. Connects the provider if not yet connected.
  2. Tears down the previous Observable subscription.
  3. Calls `provider.getStockQuotes(tickers)` (REST seed) and pushes the result to the renderer via `webContents.send('market-data:stock-quote-snapshot', { quotes })`.
  4. Subscribes to `provider.stream('stockQuotes', tickers)` and pushes each `StreamEvent<StockQuote>` via `webContents.send('market-data:stock-quote', { ticker, quote })`.
  5. Returns `{ ok: true, subscribedTickers: tickers }`.
- **Rationale:** The renderer is the source of truth for "which tickers do we care about?" — it derives that list from `usePositions()`. Keeping subscription mutation as an explicit IPC invoke (request/response) makes intent clear, lets the renderer await success before assuming the stream is live, and gives a clean error channel for `auth_failed` / `network_error`.
- **Alternatives considered:**
  - Main process queries the DB itself — couples market-data to DB; harder to test; doesn't compose with future "watch this ticker even though no position exists" UX.
  - Renderer subscribes per-ticker — multiplies IPC traffic and forces server-side bookkeeping of N subscriptions.

---

## Push Event Channels (main → renderer)

- **Decision:** Two push event channels (one-way, fire-and-forget from main):
  - `market-data:stock-quote-snapshot` — emitted once per `setStockQuoteTickers` call, carries the full REST-seeded `Record<string, IpcStockQuote>`.
  - `market-data:stock-quote` — emitted per stream tick, carries `{ ticker: string, quote: IpcStockQuote }`.
- **Rationale:** Snapshot vs delta is a meaningful distinction: snapshot replaces the renderer's whole map; delta merges one ticker. Sending both as the same channel would force the renderer to disambiguate by shape, which is fragile. Two channels = two clearly-typed listeners.
- **Alternatives considered:**
  - One unified `market-data:stock-quote-event` with a discriminated `kind: 'snapshot' | 'tick'` union — works but adds a level of indirection in every receiver; two channels are simpler.

---

## Daily Change Calculation

- **Decision:** Compute `change` and `changePercent` inside the adapter on the REST snapshot path (using `latest_quote` mid + `prev_daily_bar.c`). On stream ticks, the adapter cannot compute change (no prev_close in the frame), so it emits `change: null, changePercent: null` on stream events. The renderer carries the **last known `change`** from the snapshot and re-derives it on each tick by remembering `prevClose` per ticker (passed in via the snapshot payload as a fourth field, or — cleaner — re-derived client-side: `change = currentPrice − (snapshotPrice − snapshotChange)`).
- **Rationale:** Stream frames are intentionally minimal — they carry only the data needed for the price update. Forcing the adapter to round-trip a REST call on every tick to refresh `change` would defeat the purpose of streaming. Best to compute prev_close once per ticker (during seed) and keep applying it client-side.
- **Refined design:** Add a `prevClose` field to `IpcStockQuote` in addition to `change` / `changePercent`. On a snapshot, `prevClose` is set; on a stream tick, `prevClose` is `null` and the renderer carries it forward from the cached snapshot value. The renderer computes `change` and `changePercent` itself per render from `(price, prevClose)` so the math stays consistent.
- **Alternatives considered:**
  - Stream events that carry `prevClose` on every tick — Alpaca's frame doesn't include it; we'd have to inject it server-side from cache, which adds bookkeeping.
  - Compute change in main process and emit as part of the stream event — same problem (main has to remember prev_close per ticker, which is what we're already doing if we remember it on the renderer).
  - Skip `change` entirely on stream events — visually, the change number would freeze on the seed value while price ticks; trader sees a stale change vs live price. Worse UX than re-computing per render from the cached `prevClose`.

---

## Market Status (still REST + TanStack Query)

- **Decision:** Keep `market-data:market-status` as a request/response IPC channel called by `useMarketStatus()` with `refetchInterval: 60_000`. The provider has no streaming option for clock/session.
- **Rationale:** Market status changes ~6 times per day at predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, plus weekends/holidays). A 60 s poll catches transitions within a minute, which is well under the user's tolerance for "the dot turned green when the market opened." No need to over-engineer.
- **Alternatives considered:**
  - Compute session client-side from `Date.now()` + a hardcoded ET schedule — fragile (holidays, half-days).
  - Skip market status polling entirely — without it, the indicator dot is stuck and we can't satisfy the AC scenarios for `closed`, `pre`, `post`.

---

## Stale Data Detection (>5 min)

- **Decision:** Track `lastUpdateAt: number` per ticker in the renderer's quote store, set on every snapshot or tick received. Render the `StaleDataBanner` and override the market-status pill to `DELAYED` when `Math.min(...lastUpdateAt values) < Date.now() - 300_000`. If no quotes have ever arrived, fall back to a baseline timestamp captured at subscription start.
- **Rationale:** With streaming, the natural staleness signal is "no events arrived recently" rather than "the last poll was X seconds ago." A `lastUpdateAt` timestamp per ticker captures stream gaps (network drop, broker outage). Using `Math.min` across tickers means any one stuck ticker triggers the banner — closer to the trader's intuition ("something's wrong") than averaging.
- **Alternatives considered:**
  - Listen for the provider's `StreamError` → relay to renderer and trigger the banner directly. Better signal but requires plumbing the error channel; a timestamp-based check in the renderer covers both "explicit error" and "silent stall" with one mechanism.
  - Single global `lastUpdateAt` (any ticker) — masks the case where one ticker stops updating while others still tick.

---

## Renderer State: TanStack Query Cache + Stream Bridge

- **Decision:** Use TanStack Query as the single cache for live stock quotes. The hook `useStockQuotes(tickers)`:
  1. Defines a query with `queryKey: ['market-data', 'stock-quotes', sortedTickers]` and `queryFn` that calls the IPC REST endpoint `market-data:stock-quotes` (returns the seed snapshot).
  2. In a side effect, on every `tickers` change, calls `window.api.setStockQuoteTickers(tickers)` to update the main-process subscription.
  3. Subscribes to `window.api.onStockQuote(event)` and merges each tick into the cached data via `queryClient.setQueryData(queryKey, prev => mergeTick(prev, event))`. `setQueryData` automatically refreshes `dataUpdatedAt`, so staleness detection reuses the same TanStack Query freshness signal.
  4. Subscribes to `window.api.onStreamError(...)` and surfaces it via `queryClient.setQueryData` plus an in-hook `streamError` state for the stale banner.
  5. Cleans up listeners on unmount or ticker change; calls `setStockQuoteTickers([])` on full unmount to stop the stream.
- **Rationale:** Keeps one cache and one freshness clock — `dataUpdatedAt` covers both REST seeds and stream ticks. Cache-level deduping means multiple components on the same ticker list share the data without each component re-subscribing. `setQueryData` is TanStack Query's intended escape hatch for push-based mutations, so we're using it idiomatically. The stale-data banner reads `query.dataUpdatedAt`, exactly what TanStack Query was built to expose.
- **Alternatives considered:**
  - Custom `useSyncExternalStore` store separate from TanStack Query — duplicates state machinery, requires bespoke tests for caching/stale logic.
  - Mix: TanStack Query for REST, useSyncExternalStore for stream updates merged in a custom hook — two stores fight each other; React 19 may render with a stale view in the brief gap before the merged hook re-syncs.

---

## Hooks

- **Decision:** Two TanStack Query-backed hooks in `src/renderer/src/hooks/`:
  - `useStockQuotes(tickers: string[])` — TanStack Query hook with stream bridge effect. Returns `UseQueryResult<LiveQuotesByTicker, ApiError>` with `dataUpdatedAt` available for staleness checks. Internally:
    - `queryFn`: calls `getStockQuotes(tickers)` (IPC REST seed).
    - `enabled`: `tickers.length > 0`.
    - `staleTime: Infinity` — we don't want the query to auto-refetch via timer; stream ticks are the live signal. Refetch on window-focus stays default.
    - In an effect: calls `window.api.setStockQuoteTickers(tickers)`, registers `onStockQuote` and `onStreamError` listeners that call `queryClient.setQueryData`.
  - `useMarketStatus()` — pure TanStack Query call to `market-data:market-status` with `refetchInterval: 60_000`, `staleTime: 30_000`.
- **Rationale:** Two concerns, two hooks. Both hooks live inside the TanStack Query mental model so their consumers learn one pattern.
- **Alternatives considered:**
  - One combined hook — couples ticker-driven and time-driven concerns; harder to test.

---

## IPC Channel Summary

| Channel                               | Direction       | Pattern          | Purpose                                                      |
| ------------------------------------- | --------------- | ---------------- | ------------------------------------------------------------ |
| `market-data:stock-quotes`            | Renderer → Main | invoke (request) | REST-seed snapshot — returns `Record<string, IpcStockQuote>` |
| `market-data:set-stock-quote-tickers` | Renderer → Main | invoke (request) | Update active stream subscription set; returns ack           |
| `market-data:stock-quote`             | Main → Renderer | event (push)     | Per-ticker live tick                                         |
| `market-data:stream-error`            | Main → Renderer | event (push)     | WebSocket failure (stale banner trigger)                     |
| `market-data:market-status`           | Renderer → Main | invoke (request) | Fetch current `MarketStatus`                                 |

The seed call (`market-data:stock-quotes`) is a separate request/response so TanStack Query's `queryFn` can drive it. `set-stock-quote-tickers` is the stream-control side and has no return data beyond the ack — its job is to manage the WebSocket subscription on the main side. The two are split so the renderer can refetch the seed (e.g., on window focus) without restarting the WebSocket subscription.

---

## IPC Error Mapping

- **Decision:** Catch `MarketDataError` inside each IPC handler and return `{ ok: false, errors: [{ field: '__root__', code, message }] }`. For stream subscription errors, the provider's Observable emits a `StreamError` — the main process logs and forwards via a separate `market-data:stream-error` event so the renderer can surface a banner.
- **Rationale:** Two error pathways (request/response error from the snapshot/setTickers calls, async stream error from broken socket) need two delivery mechanisms. The main process is the seam that owns the conversion.

---

## Tickers Source

- **Decision:** `useLiveStockQuotes` is called from `PositionsListPage` with `tickers = unique(positions.filter(p => p.status === 'ACTIVE').map(p => p.ticker)).sort()`. Sorted/deduplicated before passing to the hook so ticker-array identity is stable when nothing meaningful changed.
- **Rationale:** Consistent with the existing project pattern of deriving query inputs from upstream React Query data.

---

## Component Decomposition

- **Decision:** Three new presentational components plus a row mod:
  - `MarketStatusPill` (`src/renderer/src/components/MarketStatusPill.tsx`) — pill with colored dot + label, four states: `LIVE` (green pulse), `EXT` (amber), `CLOSED` (gray), `DELAYED` (amber, no pulse).
  - `PriceCell` (`src/renderer/src/components/PriceCell.tsx`) — table cell with price (top) and signed change (bottom, green/red), or dash + tooltip for unavailable.
  - `StaleDataBanner` (`src/renderer/src/components/StaleDataBanner.tsx`) — amber banner above the table when most-recent update across all tickers is >5 min ago.
  - Modify `PositionRow` and `PositionsListPage` to add the `Price` column header and pass quote data into rows.
- **Rationale:** Mirrors the mockup's component structure. Each unit is testable in isolation.

---

## Type Sharing Across the Bridge

- **Decision:** Add IPC-flat types to `src/preload/index.d.ts` (`IpcStockQuote`, `IpcMarketStatus`, `IpcSetStockQuoteTickersPayload`, `IpcSetStockQuoteTickersResult`, `IpcGetMarketStatusResult`, `IpcStockQuoteSnapshotEvent`, `IpcStockQuoteEvent`). Renderer consumes these and re-exports renderer-side aliases from `src/renderer/src/api/market-data.ts` so renderer code never imports from `src/main/`.
- **Rationale:** Matches the existing `IpcPositionListItem` pattern. The provider's `StockQuote` type can be shared structurally, but the IPC types add `prevClose: string | null` (a US-32-only concept needed by the renderer change calculation).

---

## Test Mocking Strategy

- **Decision:** Tests mock the boundary above:
  - **IPC handler tests** mock the `MarketDataProvider` interface — including `connect`, `getStockQuotes`, `stream` (return a controllable `Subject`), and `disconnect`. Use a fake `webContents` for verifying `send()` calls.
  - **Live quote store tests** mock the `window.api.onStockQuoteSnapshot` / `window.api.onStockQuote` listener registrations and drive events synchronously.
  - **Hook tests** mock `window.api.setStockQuoteTickers` + the live store's `subscribe`/`getSnapshot`.
  - **Component tests** pass props directly.
  - **E2E tests** stub `window.api.setStockQuoteTickers`, `window.api.onStockQuoteSnapshot`, `window.api.onStockQuote`, and `window.api.getMarketStatus` from the Playwright page (no real Alpaca call).
- **Rationale:** Project pattern. Keeps CI deterministic across market sessions and credential availability.

---

## Resolved Questions

No `NEEDS CLARIFICATION` items remain. Streaming is already implemented in `AlpacaMarketDataProvider`; the pieces still missing — `change` calculation in the adapter and the REST/stream merge in the renderer — are accounted for in the data model and plan.
