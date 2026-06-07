# Market Data

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Overview

**Market data** is the real-time view of what underlyings and option contracts
are doing right now: live equity prices, option mid-prices, greeks/IV, and the
trading session the market is currently in. It is the only domain in Wheelbase
that is fully transient — no SQLite rows, no migrations, no persistent state.
Every value is fetched from a `MarketDataProvider`, held in renderer memory via
TanStack Query, and discarded on app close.

The domain has four moving parts:

- A **provider interface** (`MarketDataProvider`) that abstracts every
  vendor-specific SDK call. Alpaca is the first concrete adapter; a factory
  decides which adapter is instantiated.
- A **REST request/response surface** for snapshots — stock quotes, option
  snapshots (with greeks/IV), the market clock, broker activities, and account
  info. Promise-returning.
- A **dual-socket WebSocket streaming surface** for push updates — stocks over
  JSON, options over MessagePack — exposed as RxJS `Observable<StreamEvent<T>>`.
- A **renderer cache** (TanStack Query) that merges both transports under a
  single freshness clock and feeds the UI (price cells, P&L cells, market-status
  pill, position cockpit).

The contract details for the IPC channels that surface this data
(`market-data:stock-quotes`, `market-data:option-snapshots`,
`market-data:market-status`, plus the `stock-quote` / `stream-error` push
events) live in [`contracts/ipc-handlers.md`](../contracts/ipc-handlers.md). The
vendor-specific field-by-field translation lives in
[`contracts/alpaca-integration.md`](../contracts/alpaca-integration.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Provider interface

`MarketDataProvider` is the single seam between the rest of the app and any
specific vendor. The interface is intentionally minimal — snapshot, stream,
clock, account, activities — so adding a second provider (Polygon, IBKR, a
recorded fixture for tests) requires no changes to the IPC layer, the hooks, or
the UI.

```typescript
interface MarketDataProvider {
  // REST — request/response
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getAccountInfo(): Promise<AccountInfo>
  getMarketStatus(): Promise<MarketStatus>

  // Streaming — Observables
  supportsStreaming(feed: DataFeed): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}

type DataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'
```

### Adapter rules

- **Every vendor SDK call lives behind the adapter.** Alpaca's
  `@alpacahq/typescript-sdk` is touched only inside
  `src/main/integrations/market-data-provider.ts` and its companion streaming
  module. The IPC handlers (`src/main/ipc/market-data.ts`) consume the
  interface, never the SDK.
- **Errors normalise to `MarketDataError`.** The adapter wraps any vendor-
  specific exception in a `MarketDataError` whose `code` field is drawn from a
  fixed set: `auth_failed`, `network_error`, `rate_limited`,
  `stream_disconnected`, `streaming_unsupported`, `subscription_failed`,
  `unknown`. IPC handlers catch and convert to the `{ ok: false, errors: [...] }`
  envelope; the stream-error push channel uses the same codes. Services can
  pattern-match on `error.code` without parsing message strings.
- **The factory is the only place that picks an adapter.**
  `createMarketDataProvider(config)` in
  `src/main/integrations/market-data-factory.ts` is consumed by
  `src/main/index.ts` once at startup. No other file knows which adapter is in
  use. Services import the factory and the `MarketDataProvider` interface
  only — never the concrete provider class.
- **The adapter's client is lazy.** The Alpaca adapter's SDK `client` is a
  getter that calls `createClient()` on first access, not in the constructor —
  instantiating the provider with missing credentials must not throw (e2e tests
  rely on this).
- **REST stays on the SDK; streaming bypasses it.** Where the
  `@alpacahq/typescript-sdk` works (`getAccount`, `getClock`,
  `getStocksSnapshots`, `getActivity`, options snapshots), the adapter uses it.
  Streaming is not implemented in the SDK, so the adapter uses raw `ws`
  WebSocket clients.

### Configuration

```typescript
interface MarketDataConfig {
  provider: 'alpaca' // extensible union for future providers
  keyId: string
  secretKey: string
  paper: boolean
  dataFeed?: 'sip' | 'iex' | 'delayed_sip' // stock feed, default 'sip'
  optionFeed?: 'opra' | 'indicative' // option feed, default 'opra'
}
```

`environment: 'paper' | 'live'` on `AccountInfo` is derived from the
constructor's `paper` flag, not from any API response — Alpaca's `getAccount()`
has no paper/live indicator.

For the full extracted contract (US-31 scope and per-method semantics) see
[`features/us-31-market-data-provider-adapter.md`](../features/us-31-market-data-provider-adapter.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

## REST surface

REST is request/response and returns `Promise`s. Every money field is a
`decimal.js`-formatted string (2dp for prices, 4dp for greeks) — never a float.

### Stock quote snapshot

`getStockQuotes(tickers)` returns a `Map<ticker, StockQuote>`:

```typescript
{
  price: string // last trade or mid, 2dp
  bid: string // best bid, 2dp
  ask: string // best ask, 2dp
  prevClose: string // prior day close (2dp) — US-32 addition
  change: string // daily change, 2dp — derived in renderer per render
  changePercent: string // daily change %, 4dp — derived in renderer per render
  volume: number
  timestamp: string // ISO-8601
}
```

`prevClose` is sourced from Alpaca's `prev_daily_bar.c` and is the per-day
baseline used to compute the signed change displayed in `PriceCell`. Unknown
tickers are simply absent from the returned map — never an error.

### Option snapshot

`getOptionSnapshots(contractIds)` returns a `Map<OCC symbol, OptionSnapshot>`:

```typescript
{
  bid: string // 2dp
  ask: string // 2dp
  mid: string // (bid + ask) / 2, 2dp — computed by adapter
  lastTrade: string // 2dp
  openInterest: number | null // null for Alpaca (not exposed)
  volume: number | null // null for Alpaca (not exposed)
  greeks: {
    delta: string // 4dp
    gamma: string // 4dp
    theta: string // 4dp
    vega: string // 4dp
    iv: string // 4dp — implied volatility
  }
  timestamp: string // ISO-8601
}
```

`mid` is computed by the adapter (`Decimal(bid + ask) / 2`) — never read from
the API directly. Greeks and IV come from the REST snapshot **only**; the
option streaming feeds (`optionQuotes`, `optionTrades`) carry quote/trade data
but never greeks. That asymmetry is the practical reason option data is
polled (60 s) rather than streamed.

### Market clock

`getMarketStatus()` returns:

```typescript
{
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

`session` is derived client-side by the adapter — Alpaca's `/v2/clock` returns
only `is_open`, `next_open`, `next_close`. The adapter compares the clock
timestamp against known extended-hours windows: pre-market 4:00–9:30 AM ET,
regular 9:30 AM–4:00 PM ET (when `is_open`), post-market 4:00–8:00 PM ET,
otherwise `closed`.

### Account and activities

`getAccountInfo()` returns `{ buyingPower, portfolioValue, cash, environment }`.
`getActivities({ type, since? })` returns `BrokerActivity[]` sorted by
`transactionTime` descending — used by activity-driven detection (assignment
polling, expiration confirmation) elsewhere in the app.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

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
instrumentType })` in `src/main/core/option-symbol.ts` — a pure leaf module
that imports only `decimal.js`. Because it is pure with no DB/Electron imports,
the renderer imports it directly (the architecture rule against importing from
`src/main/` is relaxed for `src/main/core/` leaves).

Validation rules: non-empty ticker, ISO date `YYYY-MM-DD`, strike strictly
positive and finite, `instrumentType ∈ {'PUT', 'CALL'}`. Each invariant violation
throws.

**No `contract_id` column on legs.** The OCC symbol is derived on demand from
the fields the leg already carries. Storing it would duplicate state and create
a drift surface.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Streaming surface

Streaming uses two independent WebSocket connections opened on demand, each
multiplexing all symbol subscriptions for its feed:

| Feed                                        | URL                                                     | Frame format       |
| ------------------------------------------- | ------------------------------------------------------- | ------------------ |
| `stockQuotes`                               | `wss://stream.data.alpaca.markets/v2/{dataFeed}`        | JSON text          |
| `optionQuotes` &nbsp;/&nbsp; `optionTrades` | `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}` | MessagePack binary |

The Alpaca SDK has no WebSocket support, so the adapter uses the `ws` npm
package directly. Option frames are decoded with `@msgpack/msgpack`'s
`decodeMulti()` (not `decode()`) because Alpaca batches messages as arrays per
frame. Paper and live accounts share the same data stream URLs — the
paper/live distinction only affects the trading API base URL.

### Wire protocol

```
1. Client connects                          → WS open
2. Server: [{"T":"success","msg":"connected"}]
3. Client: {"action":"auth","key":"...","secret":"..."}
4. Server: [{"T":"success","msg":"authenticated"}]
5. Client: {"action":"subscribe","quotes":["AAPL","MSFT"]}
6. Server pushes quote frames               → [{"T":"q","S":"AAPL","bp":...,"ap":...}]
7. Client: {"action":"unsubscribe","quotes":[...]}   (on teardown)
```

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
  feed: DataFeed
  symbol: string
  data: T
  timestamp: string
}

interface StreamError {
  feed: DataFeed
  code: string // e.g. 'stream_disconnected'
  message: string
  reconnectable: boolean
}
```

**Reconnection is the consumer's responsibility.** `StreamError.reconnectable`
is a hint, not a behavior — `retry`/`retryWhen` is composed by callers (or by
a future reconnection story).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Polling cadence

Two REST surfaces are on a fixed-interval poll, both at **60 s**:

| Channel                        | Interval                                    | Notes                                                                                                                               |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `market-data:market-status`    | 60 s                                        | Session boundaries shift ~6 times per day; 60 s catches every transition within a minute. No streaming option exists for the clock. |
| `market-data:option-snapshots` | 60 s (disabled when `session === 'closed'`) | Greeks/IV only available via REST snapshot — streaming option-quote frames carry only bid/ask/last.                                 |

Stock quotes are **not** on a fixed poll — a one-shot REST snapshot seeds the
cache and every subsequent update arrives over the WebSocket stream (see
"Stream-first transport for stocks" below).

`useOptionSnapshots(legs, { session })` uses TanStack Query with
`refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`,
and `refetchOnWindowFocus: true`. The hook builds OCC symbols inside a
`useMemo` (sorting for stable cache keys) and tolerates per-leg
`buildOccSymbol` throws by skipping them.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

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
  ├── queryFn → IPC invoke ────────► getStockQuotes()        ────────► REST  getStocksSnapshots()
  │                                  (snapshot, with                   (latest_quote + prev_daily_bar)
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

Alpaca's quote stream frames carry only `bp` / `ap` / `bs` / `as` / `t` —
**no previous-close field**. Without a REST seed, the price column would be
empty until the first tick arrived (which during low-liquidity hours can be a
long wait), and the daily `change` value could not be computed at all. The
REST snapshot gives a per-day baseline (`prev_daily_bar.c`) and an initial
price; the stream takes over from there.

The seed fires whenever the active-ticker list changes (positions added,
closed, or initial mount). The stream subscription is then torn down and
re-established with the new ticker set in the same `setStockQuoteTickers`
call.

### Provider lifecycle

`createMarketDataProvider(...)` is instantiated once at app startup in
`src/main/index.ts`. `provider.connect()` is **not** called at startup — it
fires on the **first non-empty** `setStockQuoteTickers` invocation. A
module-scoped `let connected = false` inside `registerMarketDataHandlers`
guards the call so the WebSocket is opened exactly once per app session.
`app.on('before-quit', () => provider.disconnect())` closes it cleanly.

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
stream frame does not carry `prev_daily_bar.c`:

- **REST snapshot path** — the adapter computes `change = mid − prevClose`
  and `changePercent = change / prevClose` (4 dp) inside `getStockQuotes()`.
  `prevClose` is set to `Decimal(prev_daily_bar.c).toFixed(2)` and travels in
  the snapshot.
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

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Session model

Market status is a four-state enum surfaced by `MarketStatusPill` in the
positions-list header and on the position-detail header.

| State     | Meaning                                                                                                            | Visual          |
| --------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| `LIVE`    | Regular session — prices are flowing from the stream.                                                              | Green, pulsing  |
| `EXT`     | Pre-market or after-hours session — prices are flowing but less liquid.                                            | Amber           |
| `CLOSED`  | Market is closed (weekend, holiday, or outside extended hours). Last close prices shown.                           | Gray            |
| `DELAYED` | Stream has stalled or errored — last update is >5 min ago, or a `market-data:stream-error` event has been emitted. | Amber, no pulse |

The provider's session enum has four values — `'regular' | 'pre' | 'post' |
'closed'` — derived client-side by the adapter (see "Market clock" above) and
fetched via `market-data:market-status` on a 60 s `refetchInterval`.

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

`STALE_THRESHOLD_MS = 5 * 60 * 1000` (300 000 ms) is the only tunable.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34 -->

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

```typescript
useQuery({
  queryKey: marketDataQueryKeys.marketStatus,
  queryFn: () => getMarketStatus(),
  refetchInterval: 60_000,
  staleTime: 30_000,
  refetchOnWindowFocus: true
})
```

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

- **Underlying price** comes from `useStockQuotes([position.ticker])` — Alpaca's
  option-snapshot endpoint does not include the underlying price, so the
  cockpit reads it from the stock-quote stream. `OptionSnapshot` is **not**
  extended to carry it.
- **Greeks and IV** come from `useOptionSnapshots([leg]).data?.[occSymbol]`.
  The cockpit reads `snapshot.greeks.iv` (not a `snapshot.impliedVolatility`
  field — that doesn't exist on `OptionSnapshot`); all five greek fields are
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

<!-- generated:from us-31,us-32,us-33,us-34 -->

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

<!-- generated:from us-31,us-32,us-33,us-34 -->

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

<!-- generated:from us-31,us-32,us-33,us-34 -->

## Architectural invariant: market data is transient

There are no migrations, no SQLite tables, and no persistent state for market
data. Every value:

- Originates from the `MarketDataProvider` (REST snapshot or WebSocket frame).
- Crosses the IPC boundary as a flat shape (`IpcStockQuote`, `IpcOptionSnapshot`,
  `IpcMarketStatus`).
- Lives in renderer memory inside TanStack Query.
- Is discarded on app close.

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
and [`features/us-34-position-cockpit.md`](../features/us-34-position-cockpit.md).

<!-- /generated -->

<!-- generated:from us-37 -->

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
