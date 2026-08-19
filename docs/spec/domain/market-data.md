# Market Data

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-56,us-70 -->

## Overview

**Market data** is the real-time view of what underlyings and option contracts
are doing right now: live equity prices, option mid-prices, greeks/IV, and the
trading session the market is currently in. Quotes and snapshots are fully
transient — no SQLite rows, no migrations, no persistent state: every such value
is fetched from a `MarketDataProvider`, held in renderer memory via TanStack
Query, and discarded on app close. Two auxiliary feeds persist deliberately
because what they carry is not a quote — `ivr_snapshot` (a daily IV-rank time
series) and `earnings_date` (one current earnings date per ticker). See
"Architectural invariant: market data is transient" below for where the line sits.

Alongside the primary quote/option feed, the domain carries **auxiliary
vendor feeds** — standalone integration modules for data the primary vendor
cannot serve on the current plan. The Barchart IVR scraper (US-43) set the
precedent; the Finnhub earnings-calendar feed
([US-56](../features/us-56-earnings-proximity-alert.md)) follows it. Neither
is a `MarketDataProvider` method (see "Auxiliary feed: Finnhub earnings
calendar" below).

The primary feed has four moving parts:

- A **provider type** (`MarketDataProvider`, declared as a TypeScript `type`)
  that abstracts every vendor-specific quote/option call.
  `MassiveMarketDataProvider` is the concrete adapter; a factory
  (`marketDataFactory`) decides which adapter is instantiated.
- A **REST request/response surface** for snapshots — stock quotes and option
  snapshots (with greeks/IV), single-contract and full-chain. Promise-returning.
  (The market clock, broker activities, and account info are **not** on this
  type — they moved to a separate `BrokerProvider` on the `broker:*` IPC
  namespace.)
- A **WebSocket streaming surface** for push updates — stock quotes over a
  single JSON socket (options are REST-only) — exposed as RxJS
  `Observable<StreamEvent<T>>`.
- A **renderer cache** (TanStack Query) that merges both transports under a
  single freshness clock and feeds the UI (price cells, P&L cells, market-status
  pill, position cockpit).

The contract details for the IPC channels that surface this data
(`market-data:stock-quotes`, `market-data:option-snapshots` /
`-option-snapshot` / `-option-chain`, plus the `stock-quote` / `stream-error`
push events) live in [`contracts/ipc-handlers.md`](../contracts/ipc-handlers.md).
Market session/clock is served separately by `broker:market-status`. The
vendor-specific field-by-field translation lives in
[`contracts/alpaca-integration.md`](../contracts/alpaca-integration.md).
(Alpaca remains the broker for account, activities, and clock data; the live
quote/option feed is now the **Massive** provider described below.)

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-56,us-64 -->

## Provider interface

`MarketDataProvider` is the single seam between the rest of the app and any
specific quote/option vendor. It is declared as a TypeScript `type` (not an
`interface`) and is intentionally minimal — stock quotes, option snapshot,
option chain, and streaming — so adding a second provider (Polygon, IBKR, a
recorded fixture for tests) requires no changes to the IPC layer, the hooks, or
the UI. Account, market clock/session, and broker activities are **not** on
this type; they live on a separate `BrokerProvider` (`broker:*` IPC).

```typescript
type MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'

type MarketDataProvider = {
  // REST — request/response
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]>

  // Streaming — Observables
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(feeds?: MarketDataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
```

`getOptionChainSnapshot(filter)` takes a single `OptionChainFilter` object
(the `underlying` lives inside it, alongside optional `expirationFrom/To`,
`type: 'put' | 'call'`, `strikeFrom/To`, `limit`, `cursor`) and follows
Massive's `next_url` cursor pagination until exhausted (or `filter.limit`).
It returns `OptionChainQuote[]` — a strict superset of `OptionSnapshot` (see
[Option chain quotes](#option-chain-quotes) below) — while the single-contract
`getOptionSnapshot` returns a plain `OptionSnapshot`.

### Adapter rules

- **Every vendor call lives behind the adapter.** The concrete adapter is
  `MassiveMarketDataProvider` in
  `src/main/integrations/massive-market-data.ts` — a REST + WebSocket client
  against Massive. `src/main/integrations/market-data-provider.ts` holds only
  the `MarketDataProvider` type, the shared data types, and the
  `MarketDataError` class. The IPC handlers (`src/main/ipc/market-data.ts`)
  consume the type, never the vendor client.
- **Errors normalise to `MarketDataError`.** The adapter wraps any vendor-
  specific exception in a `MarketDataError` whose `code` (`MarketDataErrorCode`)
  is drawn from a fixed set of six: `auth_failed`, `network_error`,
  `not_found`, `rate_limited`, `streaming_unsupported`, `unknown`. Codes are
  mapped from Massive's HTTP status: `401/403 → auth_failed`, `404 →
not_found`, `429 → rate_limited` (after `MAX_RETRIES` honouring `Retry-After`),
  other non-ok / unexpected → `unknown`. IPC handlers catch and convert to the
  `{ ok: false, errors: [...] }` envelope; the stream-error push channel uses
  the same codes. Services can pattern-match on `error.code` without parsing
  message strings.
- **The factory is the only place that picks an adapter.** The factory is the
  object `marketDataFactory` in
  `src/main/integrations/market-data-factory.ts`, with `.configure(...)`,
  `.create()`, `.recreate()`, and `.disconnect()` methods. `src/main/index.ts`
  calls `marketDataFactory.configure(...)` once at startup and
  `marketDataFactory.create()` to obtain the cached provider. No other file
  knows which adapter is in use. Services import the factory and the
  `MarketDataProvider` interface only — never the concrete provider class.
  (When `FAKE_MARKET_DATA=true`, the factory returns a
  `FakeMarketDataProvider` instead.)
- **The provider is REST-first with raw WebSocket streaming.** Massive's REST
  endpoints supply stock snapshots and option snapshots (greeks/IV); streaming
  stock quotes use a raw `ws` WebSocket client. There is no vendor SDK — the
  adapter talks to Massive's HTTP and WS APIs directly.
- **The type stays scoped to what the primary vendor serves.** Data Massive
  cannot supply on the current plan (IVR, earnings dates) is deliberately
  **not** added to `MarketDataProvider` — doing so would force every provider
  (including the fake) to implement a capability the primary vendor lacks.
  Such data lives in standalone auxiliary integration modules instead: the
  Barchart IVR scraper
  ([us-43](../features/us-43-barchart-ivr-scraper.md)) and the Finnhub
  earnings-calendar feed
  ([us-56](../features/us-56-earnings-proximity-alert.md); see "Auxiliary
  feed: Finnhub earnings calendar" below).

### Configuration

The factory takes a small config that supplies the Massive API key lazily; the
provider itself takes just the resolved key:

```typescript
// market-data-factory.ts
type MarketDataFactoryConfig = {
  loadMassiveApiKey: () => string
}

// massive-market-data.ts
type MassiveMarketDataConfig = { apiKey: string }
```

`src/main/index.ts` calls `marketDataFactory.configure({ loadMassiveApiKey })`
at startup; the key is resolved lazily on first `marketDataFactory.create()`.
With no key (and `FAKE_MARKET_DATA` unset) `create()` throws — the provider is
not constructed until live data is actually requested.

For the full extracted contract (US-31 scope and per-method semantics) see
[`features/us-31-market-data-provider-adapter.md`](../features/us-31-market-data-provider-adapter.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## REST surface

REST is request/response and returns `Promise`s. Every money field is a
`decimal.js`-formatted string (2dp for prices, 4dp for greeks/IV) — never a
float. The base URL is `https://api.massive.com`; the key travels as an
`apiKey` query param (no Bearer header, no SDK). Stock reads use the v2
snapshot endpoint; option reads use v3 snapshot/chain endpoints.

### Stock quote snapshot

`getStockQuotes(tickers)` returns a `Map<ticker, StockQuote>`:

```typescript
{
  price: string // 2dp
  bid: string // 2dp
  ask: string // 2dp
  prevClose: string // prior day close (2dp) — US-32 addition
  change: string // daily change, 2dp
  changePercent: string // daily change %, 4dp
  volume: number
  timestamp: string // ISO-8601
}
```

Massive's stock snapshot is an **aggregate bar**, not a live quote — there is
no real bid/ask. The adapter therefore sets `price`, `bid`, and `ask` all to
the last-minute close (`min.c`). `prevClose` is sourced from Massive's
`prevDay.c` and is the per-day baseline used to compute the signed change
displayed in `PriceCell`. `change` / `changePercent` are filled on the REST
path from Massive's `todaysChange` / `todaysChangePerc`; the renderer
recomputes the displayed change per render from `(price, prevClose)`. Unknown
tickers are simply absent from the returned map — never an error.

### Option snapshot

The provider exposes two option reads: `getOptionSnapshot(contractId)` for a
single OCC contract, and `getOptionChainSnapshot(filter)` for a full chain
(see the provider type above). The single-contract read returns the
`OptionSnapshot` shape below, keyed in the renderer by OCC symbol; chain
results return the `OptionChainQuote` superset described in the next section:

```typescript
{
  bid: string // 2dp
  ask: string // 2dp
  mid: string // (bid + ask) / 2, 2dp — computed by adapter
  lastTrade: string // 2dp
  openInterest: number | null // null on the single-contract snapshot
  volume: number | null // null on the single-contract snapshot
  greeks?: {
    delta: string // 4dp
    gamma: string // 4dp
    theta: string // 4dp
    vega: string // 4dp
  }
  impliedVolatility?: string // 4dp — top-level, NOT nested under greeks
  timestamp: string // ISO-8601
}
```

`mid` is computed by the adapter (`Decimal(bid + ask) / 2`) — never read from
the API directly. Greeks and IV come from the REST snapshot **only**; there is
no option streaming feed. That is the practical reason option data is
polled (60 s) rather than streamed. `greeks` and `impliedVolatility` are each
optional and omitted entirely when the snapshot has no greeks (e.g. illiquid
contracts). The bulk `market-data:option-snapshots` IPC channel (and a
service-level batch over `getOptionSnapshot`) is what the renderer's
`useOptionSnapshots` hook polls; singular `market-data:option-snapshot` and
`market-data:option-chain` channels exist alongside it.

### Option chain quotes

Chain results carry per-strike identity and real liquidity that the
single-contract snapshot cannot supply, so they use a dedicated superset type
(added by [US-64](../features/us-64-pull-option-chains-for-watchlist.md), the
first consumer that needs to screen across strikes):

```typescript
type OptionChainQuote = OptionSnapshot & {
  contractId: string // OCC symbol, `O:` prefix stripped
  strike: string // 4dp decimal string
  expiration: string // "YYYY-MM-DD"
  contractType: 'put' | 'call'
}
```

Identity fields are **required** rather than optional-everywhere, so screening
consumers never null-check a field that is always present on a chain entry. For
chain results `openInterest` and `volume` are populated from Massive's
`open_interest` / `day.volume`; `strike` is 4 dp to match the codebase-wide TEXT
money convention (`legs.strike`, `watchlist.own_below_price`). The money and
Greeks mapping is shared with the single-contract path, so `mid` rounding lives
in exactly one place.

Every optional block in the vendor payload is guarded. A strike that has never
traded (or is never quoted) omits `last_trade`, `last_quote`, or `greeks`
entirely, and a zero-match chain response omits `results` altogether — these
map to a zeroed quote and an empty chain respectively, never an error. One
illiquid strike must not discard an entire underlying's chain.

The renderer-facing `market-data:option-chain` channel widens to match
(`IpcOptionChainQuote`); the singular snapshot channels are unaffected.

### Market clock, account, and activities (broker, not market-data)

The market clock/session, account info, and broker activities are **not** part
of `MarketDataProvider`. They moved onto a separate `BrokerProvider`
(`AlpacaBrokerProvider`) served by the `broker:market-status`,
`broker:account`, and `broker:activities` IPC channels — there is no
`market-data:market-status` channel. `MarketStatus` (`{ isOpen, nextOpen,
nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`) is still derived
client-side by the broker adapter from the broker clock + extended-hours
windows (pre-market 4:00–9:30 AM ET, regular 9:30 AM–4:00 PM ET when open,
post-market 4:00–8:00 PM ET, otherwise `closed`). The broker remains Alpaca;
only the quote/option vendor changed to Massive. See
[`contracts/ipc-handlers.md`](../contracts/ipc-handlers.md) for the broker
channel contracts.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## OCC option symbols

Option snapshots are keyed by the **OCC option symbol** — the industry-standard
string format encoding ticker, expiration, type, and strike:

```
{TICKER}{YYMMDD}{P|C}{STRIKE_8}
```

`STRIKE_8` is the strike price multiplied by 1000 and zero-padded to 8 digits;
supports up to four decimal places. Example: AAPL 2026-05-16 $180.00 PUT →
`AAPL260516P00180000`.

The symbol is constructed by `buildOccSymbol({ ticker, expiration, strike,
instrumentType })`, defined in `src/shared/option-symbol.ts` — a pure leaf
module that imports only `decimal.js`. `src/main/core/option-symbol.ts`
re-exports it for main-process callers. Because it is pure with no DB/Electron
imports, the renderer imports it directly (from the shared module).

Validation rules: non-empty ticker, ISO date `YYYY-MM-DD`, strike strictly
positive and finite, `instrumentType ∈ {'PUT', 'CALL'}`. Each invariant violation
throws.

**No `contract_id` column on legs.** The OCC symbol is derived on demand from
the fields the leg already carries. Storing it would duplicate state and create
a drift surface.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Streaming surface

Streaming covers stock quotes over a single Massive WebSocket connection.
Options are **REST-only** (greeks/IV are not streamed), so there is no option
WebSocket feed.

| Feed          | URL                                | Frame format |
| ------------- | ---------------------------------- | ------------ |
| `stockQuotes` | `wss://delayed.massive.com/stocks` | JSON text    |

REST base URL is `https://api.massive.com`. The adapter uses the `ws` npm
package directly (there is no vendor SDK). Massive's WebSocket messages are
Polygon-compatible JSON (`status` and `AM` aggregate-bar frames); options
tickers are prefixed with `O:` (e.g. `O:SPY260604P00750000`) at the REST
boundary.

### Wire protocol

```
1. Client connects                          → WS open
2. Client: {"action":"auth","params":"<apiKey>"}
3. Server: {"ev":"status","status":"auth_success"}
4. Client: {"action":"subscribe","params":"AM.*"}
5. Server: {"ev":"status","status":"success"}
6. Server pushes aggregate-bar frames        → {"ev":"AM","sym":"AAPL","c":...,"v":...}
```

Auth failure surfaces as `{"ev":"status","status":"auth_failed"}`, mapped to a
`MarketDataError('auth_failed', ...)`.

### Observable model

`stream(feed, symbols)` returns `Observable<StreamEvent<T>>` — not a callback
registry. RxJS gives the layer above:

- First-class unsubscription via `Subscription.unsubscribe()` — teardown sends
  the WebSocket unsubscribe frame and removes the per-symbol filter.
- Built-in error/completion channels — disconnects flow through `error`
  callbacks as `StreamError`, not a separate `onStreamError` callback.
- Operators downstream stories need: `retry`/`retryWhen` for reconnection,
  `share`/`shareReplay` for multicasting, `distinctUntilChanged` and
  `debounceTime` for throttling.

Each socket exposes one `Subject<StreamEvent>` that bridges raw WebSocket
events to subscribers; each `stream()` call filters by symbol from the shared
Subject. `disconnect()` closes both sockets, completes all subscribers, and
nulls internal references so closed resources cannot be reused.

```typescript
interface StreamEvent<T> {
  feed: MarketDataFeed
  symbol: string
  data: T
  timestamp: string
}

interface StreamError {
  feed: MarketDataFeed
  code: string // e.g. 'stream_disconnected'
  message: string
  reconnectable: boolean
}
```

**Reconnection is the consumer's responsibility.** `StreamError.reconnectable`
is a hint, not a behavior — `retry`/`retryWhen` is composed by callers (or by
a future reconnection story).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Polling cadence

Two REST surfaces are on a fixed-interval poll, both at **60 s**:

| Channel                        | Interval                                    | Notes                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `broker:market-status`         | 60 s                                        | Session boundaries shift ~6 times per day; 60 s catches every transition within a minute. No streaming option exists for the clock. (Broker channel, not `market-data:*`.) |
| `market-data:option-snapshots` | 60 s (disabled when `session === 'closed'`) | Greeks/IV only available via REST snapshot — there is no option streaming feed at all.                                                                                     |

Stock quotes are **not** on a fixed poll — a one-shot REST snapshot seeds the
cache and every subsequent update arrives over the WebSocket stream (see
"Stream-first transport for stocks" below).

`useOptionSnapshots(legs, { session })` uses TanStack Query with
`refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`,
and `refetchOnWindowFocus: true`. The hook builds OCC symbols inside a
`useMemo` (sorting for stable cache keys) and tolerates per-leg
`buildOccSymbol` throws by skipping them.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Stream-first transport for stocks

Live equity quotes use a **stream-first** transport: a one-shot REST snapshot
seeds the cache, and every subsequent update arrives over WebSocket. Both
paths terminate in the same TanStack Query cache so there is a single
freshness clock and a single source of truth for any consumer.

```
Renderer                            Main process                       Provider
--------                            ------------                       --------
useStockQuotes(tickers)
  │
  ├── queryFn → IPC invoke ────────► getStockQuotes()        ────────► REST  Massive v2 snapshot
  │                                  (snapshot, with                   (min.c + prevDay.c)
  │   ◄────────── snapshot ──────── prevClose computed)
  │
  ├── effect → IPC invoke ─────────► setStockQuoteTickers()  ────────► stream('stockQuotes', tickers)
  │                                  (tear down prev sub,             (Observable<StreamEvent>)
  │                                  subscribe new)
  │
  │   ◄─── push: stock-quote ─────── tick (prevClose: null)
  │   ◄─── push: stream-error ────── on Observable error
  │
  └── merge ticks into cache
      via queryClient.setQueryData
```

### Why both paths

Massive's stream frames are aggregate bars (`AM`) carrying only the latest
bar fields (`c` / `v` / timestamps) — **no previous-close field**. Without a
REST seed, the price column would be empty until the first tick arrived (which
during low-liquidity hours can be a long wait), and the daily `change` value
could not be computed at all. The REST snapshot gives a per-day baseline
(`prevDay.c`) and an initial price; the stream takes over from there.

The seed fires whenever the active-ticker list changes (positions added,
closed, or initial mount). The stream subscription is then torn down and
re-established with the new ticker set in the same `setStockQuoteTickers`
call.

### Provider lifecycle

The provider is created via `marketDataFactory.create()` (cached) once at app
startup in `src/main/index.ts`. `provider.connect(['stockQuotes'])` is **not**
called at startup — it
fires on the **first non-empty** `setStockQuoteTickers` invocation, from inside
the `subscribeToStockQuotes` service (`src/main/services/market-data.ts`). A
`connected` flag on the handler's `StreamState` (created by `newStreamState()`
in `registerMarketDataHandlers` and flipped inside that service) guards the call
so the WebSocket is opened exactly once per app session. On `before-quit`,
`marketDataFactory.disconnect()` closes it cleanly.

This connect-on-demand pattern matches user intent: the WebSocket only opens
when the renderer has decided it wants live data, not when the user is on the
New Wheel page with no active positions.

### Renderer-initiated subscription updates

The renderer is the source of truth for "which tickers do we care about?" —
it derives that list from `usePositions()` and calls
`window.api.setStockQuoteTickers(tickers)` whenever it changes. The handler:

1. Tears down the previous Observable subscription (`prevSubscription?.unsubscribe()`).
2. Returns `{ ok: true, subscribedTickers: [] }` early if the new list is empty.
3. Calls `provider.connect()` if `connected === false`, then flips the flag.
4. Subscribes to `provider.stream('stockQuotes', tickers)`.
5. For each `StreamEvent<StockQuote>`, emits `market-data:stock-quote` via
   `webContents.send(...)`.
6. On Observable error, emits `market-data:stream-error` and lets the renderer
   surface the banner immediately.

Tickers are memoized via `sortedTickers = tickers.slice().sort()` so the
useMemo identity is stable when nothing meaningful has changed — re-renders
that produce the same ticker set do not retrigger the subscription churn.

### Daily change split: adapter vs renderer

`change` and `changePercent` are split across two compute sites because the
stream frame does not carry a previous-close field:

- **REST snapshot path** — the adapter fills `change` / `changePercent` from
  Massive's `todaysChange` / `todaysChangePerc` inside `getStockQuotes()`, and
  sets `prevClose` to `Decimal(prevDay.c).toFixed(2)`; all three travel in the
  snapshot.
- **Stream tick path** — the adapter cannot compute change (no prev_close in
  the frame). The IPC layer forwards the tick with `prevClose: null`. The
  renderer carries `prevClose` forward from the cached snapshot value:
  `prevClose: event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null`.

`IpcStockQuote.prevClose` is therefore `string | null` — set on seed, null on
tick. `change` and `changePercent` are **not** carried on the IPC payload at
all; the renderer recomputes them per render from `(price, prevClose)`. This
avoids two divergent values when prevClose drifts and keeps the math in one
place.

A missing quote (provider returned no entry, or `prevClose` is still null
after a stream-only update) renders as `—` with a `title="Price unavailable"`
tooltip; the rest of the position row is unaffected.

For the full live-prices feature (column, animations, banner copy), see
[`features/us-32-live-position-prices.md`](../features/us-32-live-position-prices.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Session model

Market status is a four-state enum surfaced by `MarketStatusPill` in the
positions-list header and on the position-detail header.

| State     | Meaning                                                                                                            | Visual          |
| --------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| `LIVE`    | Regular session — prices are flowing from the stream.                                                              | Green, pulsing  |
| `EXT`     | Pre-market or after-hours session — prices are flowing but less liquid.                                            | Amber           |
| `CLOSED`  | Market is closed (weekend, holiday, or outside extended hours). Last close prices shown.                           | Gray            |
| `DELAYED` | Stream has stalled or errored — last update is >5 min ago, or a `market-data:stream-error` event has been emitted. | Amber, no pulse |

The session enum has four values — `'regular' | 'pre' | 'post' | 'closed'` —
derived client-side by the broker adapter (see "Market clock, account, and
activities" above) and fetched via `broker:market-status` on a 60 s
`refetchInterval`. There is no `market-data:market-status` channel.

### Display derivation

`MarketStatusDisplay` is computed by `deriveMarketStatusDisplay` in
`src/renderer/src/lib/market-status.ts`. Precedence order matters — a stuck
stream must always surface visually, so the staleness checks win over the
session enum:

```
streamError != null                          → DELAYED
Date.now() - dataUpdatedAt > 300_000         → DELAYED
session === 'regular'                        → LIVE
session === 'pre' | 'post'                   → EXT
session === 'closed' (or session unknown)    → CLOSED
```

`STALE_THRESHOLD_MS = 5 * 60 * 1000` (300 000 ms) is the staleness tunable; it
lives in `src/renderer/src/hooks/useStockQuotes.ts` (with a sibling
`SNAPSHOT_STALE_THRESHOLD_MS` in `PositionDetailPage.tsx`). The
`deriveMarketStatusDisplay` helper itself takes a precomputed `stale` boolean.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Consumers: how the UI uses market data

### `useStockQuotes(tickers)` — REST seed + stream bridge

```typescript
useQuery({
  queryKey: marketDataQueryKeys.stockQuotes(tickers),
  queryFn: () => getStockQuotes({ tickers }),
  enabled: sortedTickers.length > 0,
  staleTime: Infinity, // stream ticks are the only live signal
  refetchOnWindowFocus: true // refresh prevClose on focus
})
```

In a side effect the hook calls `window.api.setStockQuoteTickers(tickers)`,
then subscribes to `onStockQuote` and `onStreamError` and merges each tick into
the cached data via `queryClient.setQueryData(queryKey, prev => mergeTick(prev,
event))`. Return shape: `UseQueryResult<StockQuotesByTicker> & { streamError:
IpcStreamErrorEvent | null }`. Empty ticker arrays are a no-op — the hook is
safe to call unconditionally before data has loaded.

### `useMarketStatus()` — polling

Polls the broker clock via `window.api.broker.marketStatus()` (the
`broker:market-status` channel) on a 60 s `refetchInterval`, with
`staleTime: 30_000` and `refetchOnWindowFocus: true`. Its query key is
broker-prefixed (`['broker', ...]`) so a broker-environment switch refreshes it
without churning the stock/option quote caches (see "Shared market data vs
broker state" below).

### `useOptionSnapshots(legs, { session })` — option polling

Builds OCC symbols from active option legs, then polls
`getOptionSnapshots(symbols)`. Disabled when `session === 'closed'`. The
position list passes its derived `legs` from `usePositions()`; the position
detail page passes a single-leg array.

### Position-list P&L

For every active option leg the list shows:

- **Opt Mid** — `snapshot.mid` formatted as money. Adorned with an amber `⚠`
  when `isWideSpread({ bid, ask, mid })` (i.e. `mid > 0 && (ask − bid) / mid >
0.10`), or a `no bid` caption when `Decimal(bid).isZero()`. When `mid === 0`
  the wide-spread predicate returns `false` and the no-bid indicator owns the
  cell.
- **P&L** — `computeUnrealizedPnl({ entryPremium, currentMid, contracts })`
  from `src/main/core/costbasis.ts`. Returns 4dp decimal strings:
  - `pnl = (entryPremium − currentMid) × contracts × 100` (positive when the
    option has decayed below entry premium)
  - `maxProfit = entryPremium × contracts × 100`
  - `pnlPercent = (pnl / maxProfit) × 100` on a 0–100 scale
- **TARGET badge** — gold pill rendered when `pnlPercent >=
resolveProfitTarget(profitTargetPercent)`. The default profit target is `50`
  (`DEFAULT_PROFIT_TARGET_PERCENT` in `src/main/core/profit-target.ts`);
  positions can override it via the nullable `profit_target_percent` column.
  `resolveProfitTarget(0)` returns `0` (explicit override; not falsy-coalesced).
  The target check runs in the renderer — no IPC round-trip per price update.

HOLDING_SHARES and closed positions pass `snapshot={undefined}` so both cells
render `—`. Missing snapshots (unknown symbol, `null` greeks during initial
fetch) render `—` without breaking the row.

For the full feature behaviour table, see
[`features/us-33-option-mid-pnl.md`](../features/us-33-option-mid-pnl.md).

### Position cockpit — verdict-driven detail page

The position detail page renders a deterministic **Position Cockpit** that
consumes both market-data sources:

- **Underlying price** comes from `useStockQuotes([position.ticker])` — the
  option-snapshot endpoint does not include the underlying price, so the
  cockpit reads it from the stock-quote stream. `OptionSnapshot` is **not**
  extended to carry it.
- **Greeks and IV** come from `useOptionSnapshots([leg]).data?.[occSymbol]`.
  IV is a top-level `snapshot.impliedVolatility` field; the four greeks
  (`delta`, `gamma`, `theta`, `vega`) live under `snapshot.greeks`. All are
  decimal strings and the cockpit `parseFloat`s each.

`computeVerdict(input)` in `src/renderer/src/lib/verdict.ts` is a pure function
that routes to one of six labels using a first-match-wins precedence chain:

1. `dte ≤ 3 && |delta| > 0.50` → **ACT NOW** (red)
2. `pnl.pct ≥ 50` → **TARGET HIT** (green)
3. `deltaSeverity === 'danger' || dist.isITM` → **CONSIDER ROLL** (red)
4. `deltaSeverity === 'warning'` → **WATCH** (gold)
5. `dte ≤ 21 && dte > 7` → **WATCH** (gold)
6. otherwise → **HOLD** (green)

No active leg → `SHARES_VERDICT` ("NO ACTIVE LEG", sky). Greeks absent → HOLD
with sub "Awaiting market data".

#### Delta severity is DTE-aware

When `dte ≤ 7`, every delta-severity threshold drops by 0.05 — gamma rises
sharply near expiry, so the same nominal delta represents materially higher
assignment risk:

|                | base warning | base danger | tight (dte ≤ 7) warning | tight (dte ≤ 7) danger |
| -------------- | ------------ | ----------- | ----------------------- | ---------------------- |
| Sell PUT (CSP) | ≥ 0.30       | > 0.45      | ≥ 0.25                  | > 0.40                 |
| Sell CALL (CC) | ≥ 0.35       | > 0.50      | ≥ 0.30                  | > 0.45                 |

The `DeltaGauge` label flips from `DELTA` to `DELTA · TIGHT` when `dte ≤ 7`.

#### Theta yield and gamma elevation

The cockpit's context strip surfaces three more greek-derived signals:

- **Theta yield** — `(|theta| × 100 × contracts × dte) / maxPremium × 100`.
  The theta cell goes green when yield ≥ 50% — i.e. enough time decay to hit
  the profit target before expiry at current rates.
- **Gamma elevation** — gamma cell goes amber with sub "elevated near expiry"
  when `dte ≤ 7 && |gamma| ≥ 0.04`.
- **IV display** — `(iv × 100).toFixed(1) + '%'`. The optional `rank N` sub-line
  is forward-compat for an IV rank source that isn't wired yet.

For the full cockpit layout, severity bands, and acceptance criteria, see
[`features/us-34-position-cockpit.md`](../features/us-34-position-cockpit.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Staleness detection

Freshness is tracked through TanStack Query's `dataUpdatedAt`, which is bumped
automatically by both `queryFn` resolution (REST seeds and polls) and
`setQueryData` calls (stream ticks). With one freshness clock covering both
paths, the staleness check is a single timestamp comparison rather than a
per-path bag of "last seen" values.

Two conditions trip the `DELAYED` state and the `StaleDataBanner`:

- `Date.now() - dataUpdatedAt > 300_000` — no events of any kind for >5 min.
- `streamError != null` — a `market-data:stream-error` push event was received.
  Surfaces immediately, without waiting for the 5-min threshold.

The banner copy is `⚠ Prices may be delayed — last updated {minutesAgo}m ago`.
On a successful re-subscribe the `useStockQuotes` hook resets its internal
`streamError` so a transient network blip clears as soon as the stream
recovers. The position cockpit additionally dims its P&L panel by 50% when the
option snapshot is older than 5 min; the in-page `MarketStatusPill` is the
single source of stale-status truth — the cockpit does not show its own badge.

A known limitation: the staleness display only re-renders when `dataUpdatedAt`
changes. If quotes stop arriving entirely, `minutesAgo` will not tick forward
until the next data update. A 30 s interval that forces a re-render would
fix this; it is deferred tech debt.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## One cache, two transports

The renderer never owns a parallel state store for market data. Everything
lives in TanStack Query, including the stream merges.

A custom `useSyncExternalStore` for stream updates would duplicate the cache
machinery and require bespoke tests for staleness and dedupe. Mixing TanStack
Query for REST with an external store for ticks introduces a race where React
19 can render with a stale view in the brief gap before a merged hook
re-syncs. `setQueryData` is TanStack Query's intended escape hatch for
push-based mutations — using it keeps `dataUpdatedAt` as the canonical
freshness clock and gives cache-level deduping for free when multiple
components subscribe to the same ticker list.

<!-- /generated -->

<!-- generated:from us-56,us-70 -->

## Auxiliary feed: Finnhub earnings calendar

Next-earnings dates power the `EARNINGS_PROXIMITY` alert rule
([US-56](../features/us-56-earnings-proximity-alert.md)). Neither Massive
(earnings is a $99/mo Benzinga add-on) nor Alpaca serves earnings data, so the
feed comes from **Finnhub's free tier** — an official, keyed, JSON-over-HTTPS
calendar endpoint whose query-param auth matches the Massive adapter
conventions.

### Standalone integration module, not a provider method

The feed lives in `src/main/integrations/finnhub-earnings.ts` and is **not**
a `MarketDataProvider` method (see the adapter rules above). It follows the
Barchart IVR scraper ([us-43](../features/us-43-barchart-ivr-scraper.md))
precedent for vendor-specific auxiliary feeds: one integration module, one
consumer, no generic multi-vendor abstraction.

### HTTP contract

`GET https://finnhub.io/api/v1/calendar/earnings?symbol={ticker}&from={date}&to={date}&token={key}`
— one request per ticker, auth via `token` query param. The response's
`earningsCalendar` array carries per-event objects; `date` (`YYYY-MM-DD`) is
the only field consumed. An empty array means no events in the window — a
valid result, cached as null so the rule skips.

The batch wrapper is
`fetchNextEarnings(tickers, { lookaheadDays }) → Promise<Record<ticker, EarningsLookup>>`.
Every requested ticker gets an entry — a missing key is never a valid outcome. Each entry
is one of `{ status: 'found', date }`, `{ status: 'none' }` (read successfully, no event in
the window), or `{ status: 'unavailable' }` (could not read). Never an error to the caller.

US-70 replaced the earlier `fetchNextEarningsDates(tickers) → Record<ticker, isoDate>`,
which omitted the ticker for **both** an eventless calendar and a caught error — collapsing
two states that have to be distinguishable. See
[earnings-four-state-lookup](../architecture/02-adrs/earnings-four-state-lookup.md).

### Query window and event selection

The query spans `from = now − 7d` (`EARNINGS_LOOKBACK_DAYS`) to
`to = now + lookaheadDays`, **supplied by the caller** — the earnings-proximity alert
passes 30, the screener passes `criteria.dteMax + 45` (~90 on the defaults, sized to a full
quarterly cycle so a `clear` verdict means "we found the next print" rather than "we did not
look far enough"). Per ticker the module
drops calendar rows whose `date` is not a `YYYY-MM-DD` string (the payload is
unvalidated vendor JSON — a null/`TBD` row must not displace a valid event),
then selects the **earliest event with `date >= today`**, falling back to the
most recent past event when no upcoming event exists in the window. The 7-day lookback
exists purely for **alert resolution** — a recent-past event yields negative
`daysToEarnings`, the predicate returns false, and an open alert resolves on
the next run instead of freezing open on a skip.

That past-date fallback is also why the store never serves a `found` date that has since
passed: it says nothing about the _next_ print, and the screener's engine would read it as
`clear`. See
[unknown-earnings-never-excludes](../architecture/02-adrs/unknown-earnings-never-excludes.md).

### Caching: the `earnings_date` table, not the module

**US-70 moved the cache into SQLite.** The
[`earnings_date`](../schema/tables.md#earnings_date) table (migration 013) holds one
current row per ticker and is now the cache; the module's former 12 h in-memory success
`Map` is gone. Reads go through `src/main/services/earnings-dates.ts`, which fetches only
when no row exists, when a NULL row is shallower than the caller's horizon, or when the
row's answer has stood longer than its refresh interval (short for a passed or near-term
date, weekly for a distant one).

This is the one auxiliary market-data feed that **does** persist, and it is a deliberate
exception to the transient-market-data invariant below — a scheduled earnings date is a
durable fact about a calendar event, not a decaying quote, and the alert scheduler and the
screener need to share it across restarts. It persists differently from `ivr_snapshot`,
though: IVR is a time series because its history _is_ the product, while earnings is a
point-in-time lookup where a stale value is simply wrong. See
[earnings-persisted-per-ticker](../architecture/02-adrs/earnings-persisted-per-ticker.md).

Per-ticker **failures are still held in memory only, negatively cached for 5 minutes**
(`EARNINGS_FAILURE_TTL_MS`), so a rate-limited or failing ticker backs off instead of
refiring against an exhausted quota — and a restart correctly retries it. A failure is not
knowledge about the ticker, so it is never written to the table.

### Failure isolation

Per-ticker failures are isolated and mapped to WARN codes, never thrown to
the batch caller:

| Condition       | Behavior                                                   |
| --------------- | ---------------------------------------------------------- |
| Missing API key | `{}` + WARN `earnings_fetch_no_api_key` (once per process) |
| HTTP 401/403    | WARN `earnings_fetch_failed`, code `auth_failed`           |
| HTTP 429        | code `rate_limited` (failure cached 5 min before retry)    |
| Network/other   | code `network_error` / `unknown`                           |
| Empty calendar  | DEBUG `earnings_no_event_in_window`, null cached           |

A whole-feed outage degrades to an empty record. `evaluateAlerts` consumes
the batch as a **third concurrent `fetchOrDegrade`** alongside stock quotes
and option snapshots (WARN `alert_evaluation_earnings_unavailable`), via an
injectable `FetchEarnings` seam in `src/main/services/evaluate-alerts.ts` —
per the alert-evaluation failure-isolation ADR, missing data skips the rule
and never suppresses other rules' results.

### Credentials

`loadFinnhubApiKey()` in `src/main/integrations/finnhub-credentials.ts`
mirrors the `massive-credentials.ts` pattern: it reads
`import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with a
`process.env.FINNHUB_API_KEY` runtime fallback. No settings UI, no encrypted
storage, no migration — the app remains fully functional without the key
(the rule skips everywhere; every other rule is unaffected).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-56,us-70 -->

## Architectural invariant: market data is transient

**Quotes and snapshots** have no migrations, no SQLite tables, and no persistent state.
Every such value:

- Originates from the `MarketDataProvider` (REST snapshot or WebSocket frame)
  or an auxiliary integration module.
- Crosses the IPC boundary as a flat shape (`IpcStockQuote`, `IpcOptionSnapshot`,
  `IpcMarketStatus`).
- Lives in renderer memory inside TanStack Query.
- Is discarded on app close.

**Two auxiliary feeds are deliberate exceptions**, because what they carry is not a quote:
`ivr_snapshot` (migration 007) keeps a daily IV-rank time series because IVR's _history_ is
the product, and `earnings_date` (migration 013) keeps one current row per ticker because a
scheduled earnings date is a durable calendar fact that two consumers share across restarts.
Neither stores a price.

This is enforced by convention:

- **No leg, position, or snapshot row depends on a market price.** Cost basis
  uses fill prices that were typed in or pulled from the broker's trade
  record, never from a live quote.
- **The provider is the only source of `price`, `bid`, `ask`, `prevClose`,
  `mid`, `greeks`, and session state.** UI computations (the signed change in
  `PriceCell`, the pill state in `MarketStatusPill`, the verdict in
  `computeVerdict`) derive from those values per render.
- **The IPC handlers never throw to the renderer.** Failures come back as
  `{ ok: false, errors: [{ field: '__root__', code, message }] }`; the
  renderer adapter converts `!ok` into `apiError(502, ...)` so TanStack Query
  sets `isError` and consumers handle the empty/dash state cleanly.
- **No `contract_id` is persisted on legs.** OCC symbols are derived on demand
  from the fields the leg already carries; storing them would duplicate state
  and create a drift surface.
- **The one persisted market-data-adjacent value is the profit-target override**
  (`positions.profit_target_percent`). It is a trader preference, not a market
  observation, and defaults to `NULL` (use the global 50% constant).

For the story-level acceptance criteria and the UI behaviour tables, see
[`features/us-31-market-data-provider-adapter.md`](../features/us-31-market-data-provider-adapter.md),
[`features/us-32-live-position-prices.md`](../features/us-32-live-position-prices.md),
[`features/us-33-option-mid-pnl.md`](../features/us-33-option-mid-pnl.md),
[`features/us-34-position-cockpit.md`](../features/us-34-position-cockpit.md),
and [`features/us-56-earnings-proximity-alert.md`](../features/us-56-earnings-proximity-alert.md).

<!-- /generated -->

<!-- generated:from us-37,market-data-massive-migration -->

## Shared market data vs broker state

US-37 makes an explicit product distinction that matters to the live-data domain:

- **Market data is shared app infrastructure.** Massive status and market-data degraded states are tied to shared application configuration, not to user-managed broker credentials.
- **Broker state is user-specific.** Alpaca paper/live credentials and the active broker environment are stored per user in settings and affect account/activity/buying-power surfaces only.
- **Settings actions do not restart quote flows.** Switching broker environments or saving/removing Alpaca credentials refreshes broker-prefixed queries only; `['market', ...]` queries continue running.
- **UI status indicators are intentionally split.**
  - `EnvironmentBadge` reflects broker environment only: `PAPER`, `LIVE`, `NO BROKER`
  - `MarketDataStatusDot` reflects Massive market-data state only

### Degraded-state consequences

- Massive auth/config failures keep cached quotes briefly, surface a stale-data banner, then fall back to unavailable quote cells.
- Missing or failed Alpaca credentials do not prevent shared market data from rendering; instead broker-only surfaces prompt the user to connect Alpaca in Settings.

This split is why US-37 belongs partly in the market-data spec even though the story is primarily a settings/broker workflow: the user-facing quote domain now stays healthy or degraded independently from the broker environment toggle.

<!-- /generated -->
