# Market Data

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-56,us-70,us-99,us-116 -->

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
  `AlpacaMarketDataProvider` is the concrete adapter
  ([US-99](../features/us-99-alpaca-market-data-provider.md)); a factory
  (`marketDataFactory`) decides which adapter is instantiated.
- A **REST request/response surface** for snapshots — stock quotes and option
  snapshots (with greeks/IV), single-contract and full-chain. Promise-returning.
  (The market clock, broker activities, and account info are **not** on this
  type — they live on a separate `BrokerProvider` on the `broker:*` IPC
  namespace.)
- A **WebSocket streaming surface** for push updates — stock minute bars over a
  single JSON socket with per-symbol subscriptions (options are REST-only) —
  exposed as RxJS `Observable<StreamEvent<T>>`.
- A **renderer cache** (TanStack Query) that merges both transports under a
  single freshness clock and feeds the UI (price cells, P&L cells, market-status
  pill, position cockpit).

The contract details for the IPC channels that surface this data
(`market-data:stock-quotes`, `market-data:option-snapshots` /
`-option-snapshot` / `-option-chain`, plus the `stock-quote` / `stream-error`
push events) live in [`contracts/ipc-handlers.md`](../contracts/ipc-handlers.md).
[US-116] Market session/clock is served by `market-data:market-status`. The
vendor endpoints, websocket handshake and error tables live in
[`contracts/alpaca-integration.md`](../contracts/alpaca-integration.md).
Alpaca is both the broker (account, activities, clock) and, since US-99, the
market-data vendor (quotes, options, stream) — two interfaces, two factories,
one set of credentials. The vendor history is Alpaca (US-31/32) → Massive
(`market-data-massive-migration`, now superseded) → Alpaca's free data plan
(US-99); the interface, IPC layer, hooks and UI did not change across either
swap.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-56,us-64,us-99 -->

## Provider interface

`MarketDataProvider` is the single seam between the rest of the app and any
specific quote/option vendor. It is declared as a TypeScript `type` (not an
`interface`) and is intentionally minimal — stock quotes, option snapshot,
option chain, and streaming — so swapping the vendor (which has now happened
twice) requires no changes to the IPC layer, the hooks, or the UI. Account,
market clock/session, and broker activities are **not** on this type; they live
on a separate `BrokerProvider` (`broker:*` IPC).

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
`type: 'put' | 'call'`, `strikeFrom/To`, `limit`, `cursor`). With no `limit`
the adapter walks Alpaca's `next_page_token` pagination at `limit=1000` until
exhausted; with a `limit` it fetches one page (`min(limit, 1000)`, `cursor` as
`page_token`) — the semantics pinned by US-64's contract. It returns
`OptionChainQuote[]` — a strict superset of `OptionSnapshot` (see
[Option chain quotes](#option-chain-quotes) below) — while the single-contract
`getOptionSnapshot` returns a plain `OptionSnapshot`.

### Adapter rules

- **Every vendor call lives behind the adapter.** The concrete adapter is
  `AlpacaMarketDataProvider` in
  `src/main/integrations/alpaca-market-data.ts` (I/O: HTTP, retry, websocket,
  subscription state) with its pure mappers, URL builders and frame parsers in
  `alpaca-market-data-mappers.ts`. `src/main/integrations/market-data-provider.ts`
  holds only the `MarketDataProvider` type, the shared data types, and the
  `MarketDataError` class. The IPC handlers (`src/main/ipc/market-data.ts`)
  consume the type, never the vendor client.
- **Errors normalise to `MarketDataError`.** The adapter wraps any vendor-
  specific exception in a `MarketDataError` whose `code` (`MarketDataErrorCode`)
  is drawn from a fixed set of six: `auth_failed`, `network_error`,
  `not_found`, `rate_limited`, `streaming_unsupported`, `unknown`. Codes are
  mapped from HTTP status (`401/403 → auth_failed`, `404 → not_found`, `429 →
rate_limited` after `MAX_RETRIES` honouring `Retry-After`, other non-ok →
  `unknown`) or from websocket error codes (402 → `auth_failed`, 409 →
  `streaming_unsupported`) — never from message text. IPC handlers catch and
  convert to the `{ ok: false, errors: [...] }` envelope; the stream-error push
  channel uses `StreamError` codes (`symbol_limit`, `connection_limit`,
  `unknown`). See
  [marketdataerror-structured-codes](../architecture/02-adrs/marketdataerror-structured-codes.md).
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
- **The provider is REST-first with raw WebSocket streaming.** Alpaca's data
  REST endpoints supply stock snapshots and option snapshots (greeks/IV); the
  trading API supplies open interest; streaming stock bars use a raw `ws`
  WebSocket client. There is no vendor SDK on the market-data side — the
  `@alpacahq/typescript-sdk` is used only by the broker provider (see
  [alpaca-sdk-rest-only](../architecture/02-adrs/alpaca-sdk-rest-only.md)).
- **The type stays scoped to what the primary vendor serves.** Data the
  primary vendor cannot supply on the current plan (IVR, earnings dates) is
  deliberately **not** added to `MarketDataProvider` — doing so would force
  every provider (including the fake) to implement a capability the primary
  vendor lacks. Such data lives in standalone auxiliary integration modules
  instead: the Barchart IVR scraper
  ([us-43](../features/us-43-barchart-ivr-scraper.md)) and the Finnhub
  earnings-calendar feed
  ([us-56](../features/us-56-earnings-proximity-alert.md); see "Auxiliary
  feed: Finnhub earnings calendar" below).

### Configuration

The factory takes a credential loader; the provider takes the same loader and
calls it on **every** REST request and inside `connect()` — credentials are
never cached on the instance:

```typescript
// market-data-factory.ts
type MarketDataFactoryConfig = {
  loadActiveAlpacaCredentials: () => AlpacaCredentials | null
}

// alpaca-market-data.ts
type AlpacaMarketDataConfig = {
  loadCredentials: () => AlpacaCredentials | null
}
```

`src/main/index.ts` calls
`marketDataFactory.configure({ loadActiveAlpacaCredentials: () => settings.loadActiveAlpacaCredentials() })`
at startup — the same encrypted Alpaca credentials the broker uses. The default
loader is `loadAlpacaCredentialsFromEnv()` (`process.env` only; see
[alpaca-credentials-runtime-env-only](../architecture/02-adrs/alpaca-credentials-runtime-env-only.md)).
`create()` **never throws**: with no credentials the provider is still built and
each call fails with `MarketDataError('auth_failed', 'Alpaca credentials not
configured')`, which is what lets Positions show its "Connect Alpaca" banner and
the screener its "not connected" card instead of crashing. A credential change
does not recreate the provider — REST picks the new key up on the next request,
and the stock stream is restarted (see "Provider lifecycle" below).

For the full extracted contract (US-31 scope and per-method semantics) see
[`features/us-31-market-data-provider-adapter.md`](../features/us-31-market-data-provider-adapter.md);
for the Alpaca vendor seam see
[`features/us-99-alpaca-market-data-provider.md`](../features/us-99-alpaca-market-data-provider.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-99 -->

## REST surface

REST is request/response and returns `Promise`s. Every money field is a
`decimal.js`-formatted string (2dp for prices, 4dp for greeks/IV) — never a
float. The data base URL is `https://data.alpaca.markets`; requests
authenticate with `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers (never
logged). Stock reads use `/v2/stocks/snapshots` with `feed=iex`; option reads
use `/v1beta1/options/snapshots` with `feed=indicative`; open interest comes
from the **trading** host's `/v2/options/contracts`. `feed=sip` and
`feed=opra` are never requested (both 403 on the free plan). The exact
endpoint table lives in
[`contracts/alpaca-integration.md`](../contracts/alpaca-integration.md).

### Stock quote snapshot

`getStockQuotes(tickers)` issues **one** batched request for the whole ticker
list and returns a `Map<ticker, StockQuote>`:

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

Alpaca's stock snapshot carries a real latest trade and a real latest quote:
`price = latestTrade.p`, `bid = latestQuote.bp`, `ask = latestQuote.ap`
(falling back to `price` when the quote block is absent), `prevClose =
prevDailyBar.c`, `change = price − prevClose`, `changePercent = change /
prevClose × 100` (4dp, `ROUND_HALF_UP`; `''` when there is no previous bar),
`volume = dailyBar.v`, `timestamp = latestTrade.t` normalised to millisecond
ISO. Only `price` and `prevClose` are rendered (`PriceCell`, `useStockQuotes`);
`bid`/`ask` are carried honestly rather than faked, even though IEX's
after-hours quotes can be wide. Unknown tickers are simply absent from the
returned map — never an error — and so is a snapshot with no `latestTrade`
(there is no price to anchor on; skipped with a debug log rather than reported
as `$0.00`). The renderer recomputes the displayed change per render from
`(price, prevClose)`.

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
  volume: number | null // dailyBar.v; null when absent
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

`mid` is computed by the adapter (`Decimal(bid + ask) / 2`, `ROUND_HALF_UP`,
2dp) — never read from the API directly. Greeks and IV come from the REST
snapshot **only**; there is no option streaming feed. That is the practical
reason option data is polled (60 s) rather than streamed. `greeks` is emitted
only when `delta`, `gamma`, `theta` and `vega` are **all** numbers — Alpaca
sends `greeks: {}` on deep-OTM strikes and a `rho` the app never surfaces, and
a half-filled greek set would mislead the screener, which ranks on delta.
`impliedVolatility` is emitted only when numeric. Both are omitted entirely
otherwise. The bulk `market-data:option-snapshots` IPC channel (and a
service-level batch over `getOptionSnapshot`) is what the renderer's
`useOptionSnapshots` hook polls; singular `market-data:option-snapshot` and
`market-data:option-chain` channels exist alongside it. A `?symbols=` response
that omits the requested contract is `MarketDataError('not_found')`.

### Option chain quotes

Chain results carry per-strike identity and real liquidity that the
single-contract snapshot cannot supply, so they use a dedicated superset type
(added by [US-64](../features/us-64-pull-option-chains-for-watchlist.md), the
first consumer that needs to screen across strikes):

```typescript
type OptionChainQuote = OptionSnapshot & {
  contractId: string // bare OCC symbol
  strike: string // 4dp decimal string
  expiration: string // "YYYY-MM-DD"
  contractType: 'put' | 'call'
}
```

Identity fields are **required** rather than optional-everywhere, so screening
consumers never null-check a field that is always present on a chain entry.
Alpaca's chain snapshots carry **no** strike or expiration fields — the map is
keyed by bare OCC symbol — so identity comes from `parseOccSymbol` (see
[OCC option symbols](#occ-option-symbols)); an unparseable key is skipped with a
debug log rather than costing the whole ticker. `openInterest` is **not** in
the snapshot at all: after a non-empty chain the adapter fetches
`/v2/options/contracts` on the trading host for the same filters and joins the
string `open_interest` by symbol (`number`, or `null` when absent). That call
is isolated in its own `try/catch` — a contracts outage degrades every strike
to `openInterest: null` with a warning, never failing the chain pull — because
the screener's OI rule skips on `null` and would otherwise go silently blind
([open-interest-from-contracts-endpoint](../architecture/02-adrs/open-interest-from-contracts-endpoint.md)).
`volume` is `dailyBar.v`. `strike` is 4 dp to match the codebase-wide TEXT money
convention (`legs.strike`, `watchlist.own_below_price`). The money and Greeks
mapping is shared with the single-contract path (`mapOptionQuote`), so `mid`
rounding lives in exactly one place.

Every optional block in the vendor payload is guarded. A strike that has never
traded (or is never quoted) omits `latestTrade`, `latestQuote`, or has an empty
`greeks`, and an unknown underlying returns an empty `snapshots` map — these
map to a zeroed quote (epoch-0 timestamp = "never quoted") and an empty chain
respectively, never an error. One illiquid strike must not discard an entire
underlying's chain; a zeroed strike is dropped downstream by
`isTradeableStrike`.

The renderer-facing `market-data:option-chain` channel widens to match
(`IpcOptionChainQuote`); the singular snapshot channels are unaffected.

### Market clock and calendar (market-data); account and activities (broker)

[US-116] The market clock/session **and** the exchange calendar are part of
`MarketDataProvider` — `getMarketStatus()` and `getMarketCalendar(range)`,
served by `market-data:market-status` and consumed directly by the
trading-calendar store. Account info and broker activities stay on
`BrokerProvider` (`AlpacaBrokerProvider`), which is now exactly
`getAccountInfo` + `getActivities`, served by `broker:account` and
`broker:activities`. There is no `broker:market-status` channel.

The split is by _what the fact is about_, not by which host answers: "is the
exchange open" and "which days were sessions" are facts about the market, so
gating them on an optional broker relationship left IV rank and the
market-status pill dead on any journal-only install. Alpaca serves both from
the same trading host and key pair the market-data provider already uses for
open interest.

`MarketStatus` (`{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' |
'post' | 'closed' }`) is derived
client-side by the market-data adapter from the vendor clock + extended-hours
windows (pre-market 4:00–9:30 AM ET, regular 9:30 AM–4:00 PM ET when open,
post-market 4:00–8:00 PM ET, otherwise `closed`). Both stacks are Alpaca today,
but the split is kept: the broker side goes through the SDK and `BrokerError`,
the market-data side through raw `fetch` and `MarketDataError`. See
[`contracts/ipc-handlers.md`](../contracts/ipc-handlers.md) for the broker
channel contracts.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-99 -->

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
instrumentType })` and parsed back by `parseOccSymbol(symbol): OccIdentity |
null` (`{ underlying, contractId, strike (4dp), expiration, contractType }`),
both defined in `src/shared/option-symbol.ts` — a pure leaf module that imports
only `decimal.js`. `src/main/core/option-symbol.ts` re-exports them for
main-process callers. Because it is pure with no DB/Electron imports, the
renderer imports it directly (from the shared module). `parseOccSymbol` was
promoted out of the fake provider in US-99 so the Alpaca mapper and the fake
share one parser: Alpaca keys its chain snapshots by bare OCC symbol with no
identity fields, so parsing the key is how a chain entry learns its strike,
expiration and type.

Validation rules: non-empty ticker, ISO date `YYYY-MM-DD`, strike strictly
positive and finite, `instrumentType ∈ {'PUT', 'CALL'}`. Each invariant violation
throws. `parseOccSymbol` returns `null` (never throws) on a non-matching string.

**No `contract_id` column on legs.** The OCC symbol is derived on demand from
the fields the leg already carries. Storing it would duplicate state and create
a drift surface.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-99 -->

## Streaming surface

Streaming covers stock minute bars over a single Alpaca IEX WebSocket
connection. Options are **REST-only** (greeks/IV are not streamed), so there is
no option WebSocket feed; `supportsStreaming` is `true` only for `stockQuotes`.

| Feed          | URL                                       | Frame format                              |
| ------------- | ----------------------------------------- | ----------------------------------------- |
| `stockQuotes` | `wss://stream.data.alpaca.markets/v2/iex` | JSON — an **array** of frames per message |

The adapter uses the `ws` npm package directly (there is no vendor SDK for
streaming). The free plan allows one connection and **30 streamed symbols**;
there is no wildcard subscription, so the provider subscribes per symbol.

### Wire protocol

```
1. Client connects                                    → WS open
2. Server: [{"T":"success","msg":"connected"}]
3. Client: {"action":"auth","key":"<keyId>","secret":"<secret>"}
4. Server: [{"T":"success","msg":"authenticated"}]    → connect() resolves
5. Client: {"action":"subscribe","bars":["AAPL","NVDA"]}   (per stream() call, diff only)
6. Server: [{"T":"subscription","bars":["AAPL","NVDA"]}]
7. Server pushes minute bars                          → [{"T":"b","S":"AAPL","o":…,"h":…,"l":…,"c":…,"v":…,"t":"…"}]
```

`connect()` sends **no** subscribe. Each `stream('stockQuotes', symbols)` call
reconciles the provider's `subscribed` set against `symbols` and sends only
`{action:'unsubscribe', bars:[removed]}` then `{action:'subscribe',
bars:[added]}`; an identical set sends nothing, and an empty set unsubscribes
everything (dropping the renderer's rxjs subscription does not release Alpaca's,
and leaked symbols count against the 30 cap). Bar frames map to
`StockQuote { price = bid = ask = c, volume = v, timestamp = t, change /
changePercent / prevClose = '' }`.

Auth failure at connect surfaces as `[{"T":"error","code":402,"msg":"auth
failed"}]` → `MarketDataError('auth_failed')`; `409 insufficient subscription`
→ `streaming_unsupported`; no `authenticated` frame within 10 s →
`network_error`. `subscribeToStockQuotes` catches any connect failure, logs a
warning and continues REST-only — an entitlement problem never blocks prices.
After connect, `405 symbol limit exceeded` / `406 connection limit exceeded`
reach the Observable's error channel as `StreamError` (`symbol_limit` /
`connection_limit`), which the renderer shows as the stale banner. See
[per-symbol-ws-subscription-reconciliation](../architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md).

### Observable model

`stream(feed, symbols)` returns `Observable<StreamEvent<T>>` — not a callback
registry. RxJS gives the layer above:

- First-class unsubscription via `Subscription.unsubscribe()`. Teardown sends
  nothing to the socket; the **next** `stream()` call owns the subscription
  reconciliation, which is correct because the service always tears down the
  old subscription before calling `stream()` again.
- Built-in error/completion channels — stream faults flow through `error`
  callbacks as `StreamError`, not a separate `onStreamError` callback.
- Operators downstream stories need: `retry`/`retryWhen` for reconnection,
  `share`/`shareReplay` for multicasting, `distinctUntilChanged` and
  `debounceTime` for throttling.

The socket exposes one `Subject<StreamEvent>` that bridges raw WebSocket
frames to subscribers; each `stream()` call is wrapped in `defer()` and filters
by symbol from whichever subject is live (an empty `symbols` list receives
everything). Because an rxjs `Subject` is permanently stopped once it errors,
a stream fault swaps in a fresh subject before erroring the old one — otherwise
a single 405 would end streaming for the life of the process. `disconnect()`
closes the socket, nulls the reference and clears the subscribed set; the
`close` handler is guarded by socket identity so a closing socket cannot clear
state belonging to its replacement after a credential-change restart.

```typescript
interface StreamEvent<T> {
  feed: MarketDataFeed
  symbol: string
  data: T
  timestamp: string
}

interface StreamError {
  feed: MarketDataFeed
  code: string // 'symbol_limit' | 'connection_limit' | 'unknown'
  message: string
  reconnectable: boolean // always false today
}
```

**Reconnection is the consumer's responsibility.** `StreamError.reconnectable`
is a hint, not a behavior — the provider has no auto-reconnect; the next
`set-stock-quote-tickers` call or a credential change re-establishes the stream.
`retry`/`retryWhen` is composed by callers (or by a future reconnection story).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration -->

## Polling cadence

Two REST surfaces are on a fixed-interval poll, both at **60 s**:

| Channel                        | Interval                                    | Notes                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `market-data:market-status`    | 60 s                                        | Session boundaries shift ~6 times per day; 60 s catches every transition within a minute. No streaming option exists for the clock. [US-116] Polled only when `CredentialStatus.marketData === 'configured'`. |
| `market-data:option-snapshots` | 60 s (disabled when `session === 'closed'`) | Greeks/IV only available via REST snapshot — there is no option streaming feed at all.                                                                                                                        |

Stock quotes are **not** on a fixed poll — a one-shot REST snapshot seeds the
cache and every subsequent update arrives over the WebSocket stream (see
"Stream-first transport for stocks" below).

`useOptionSnapshots(legs, { session })` uses TanStack Query with
`refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`,
and `refetchOnWindowFocus: true`. The hook builds OCC symbols inside a
`useMemo` (sorting for stable cache keys) and tolerates per-leg
`buildOccSymbol` throws by skipping them.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-34,market-data-massive-migration,us-99 -->

## Stream-first transport for stocks

Live equity quotes use a **stream-first** transport: a one-shot REST snapshot
seeds the cache, and every subsequent update arrives over WebSocket. Both
paths terminate in the same TanStack Query cache so there is a single
freshness clock and a single source of truth for any consumer. Both paths come
from the **same feed (IEX)** so the first tick does not jump against the seed.

```
Renderer                            Main process                       Provider
--------                            ------------                       --------
useStockQuotes(tickers)
  │
  ├── queryFn → IPC invoke ────────► getStockQuotes()        ────────► REST  GET /v2/stocks/snapshots?feed=iex
  │                                  (one batched snapshot,           (latestTrade.p + prevDailyBar.c)
  │   ◄────────── snapshot ──────── prevClose computed)
  │
  ├── effect → IPC invoke ─────────► setStockQuoteTickers()  ────────► stream('stockQuotes', tickers)
  │                                  (tear down prev sub,             (reconcile per-symbol `bars` subs;
  │                                  subscribe new)                    Observable<StreamEvent>)
  │
  │   ◄─── push: stock-quote ─────── tick (prevClose: null)
  │   ◄─── push: stream-error ────── on Observable error
  │
  └── merge ticks into cache
      via queryClient.setQueryData
```

### Why both paths

The stream frames are minute bars (`T: 'b'`) carrying only the bar fields
(`o`/`h`/`l`/`c`/`v`/`t`) — **no previous-close field**. Without a REST seed,
the price column would be empty until the first bar arrived (which during
low-liquidity hours can be a long wait), and the daily `change` value could
not be computed at all. The REST snapshot gives a per-day baseline
(`prevDailyBar.c`) and an initial price (`latestTrade.p`); the stream takes over
from there.

The seed fires whenever the active-ticker list changes (positions added,
closed, or initial mount). The stream subscription is then torn down and
re-established with the new ticker set in the same `setStockQuoteTickers`
call.

### Provider lifecycle

The provider is created via `marketDataFactory.create()` (cached) once at app
startup in `src/main/index.ts`. `provider.connect(['stockQuotes'])` is **not**
called at startup — it fires on the **first non-empty** `setStockQuoteTickers`
invocation, from inside the `subscribeToStockQuotes` service
(`src/main/services/market-data.ts`). A `connected` flag on the handler's
`StreamState` (created by `newStreamState()` in `registerMarketDataHandlers`
and flipped inside that service) guards the call so the WebSocket is opened
once per app session. On `before-quit`, `marketDataFactory.disconnect()` closes
it cleanly.

**Credential changes restart the stream (US-99).** The websocket authenticates
once at connect, so when the trader saves, removes or switches Alpaca
credentials, `onBrokerProviderChanged` in `index.ts` calls
`restartStockQuoteStream()` (returned by `registerMarketDataHandlers`): the
provider disconnects, `connected` is cleared, and — only if `StreamState.tickers`
remembers a subscription — it reconnects with the new keys and replays the same
tickers. REST needs no restart because the provider resolves credentials on
every request. A connect failure during the restart logs a warning and leaves
REST working. See
[market-data-lazy-credentials-stream-restart](../architecture/02-adrs/market-data-lazy-credentials-stream-restart.md).

This connect-on-demand pattern matches user intent: the WebSocket only opens
when the renderer has decided it wants live data, not when the user is on the
New Wheel page with no active positions.

### Renderer-initiated subscription updates

The renderer is the source of truth for "which tickers do we care about?" —
it derives that list from `usePositions()` and calls
`window.api.setStockQuoteTickers(tickers)` whenever it changes. The handler:

1. Tears down the previous Observable subscription (`prevSubscription?.unsubscribe()`).
2. Records the ticker set on `StreamState.tickers`; if the new list is empty,
   asks the provider to unsubscribe everything and returns
   `{ ok: true, subscribedTickers: [] }`.
3. Calls `provider.connect()` if `connected === false`, then flips the flag
   (a connect failure is logged and the handler continues REST-only).
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

- **REST snapshot path** — the adapter computes `change = price − prevClose`
  and `changePercent = change / prevClose × 100` (4dp) inside
  `getStockQuotes()`, and sets `prevClose` to `Decimal(prevDailyBar.c).toFixed(2)`;
  all three travel in the snapshot (`''` when there is no previous bar).
- **Stream tick path** — the adapter cannot compute change (no prev close in
  the bar frame). The IPC layer forwards the tick with `prevClose: null`. The
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
derived client-side by the market-data adapter (see "Market clock and calendar"
above) and fetched via `market-data:market-status` on a 60 s
`refetchInterval`. There is no `broker:market-status` channel.

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

[US-116] Polls the exchange clock via `window.api.marketData.marketStatus()`
(the `market-data:market-status` channel) on a 60 s `refetchInterval`, with
`staleTime: 30_000` and `refetchOnWindowFocus: true`. Its query key is
market-prefixed (`['market', 'status']`), alongside the quote and snapshot
keys. `useSettings`' invalidation predicate therefore matches `'broker'` **or**
`'market'`, so a credential change still refreshes the pill — and correctly
also refreshes every other vendor-backed read.

The query is enabled only when `CredentialStatus.marketData === 'configured'`,
so a journal-only install with no broker still polls and still resolves. When
it is disabled there is no error state: `deriveMarketStatusDisplay` falls back
to `computeNYSESession()`, the renderer's own weekday/hours calendar.

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

<!-- generated:from us-56,us-70,us-99 -->

## Auxiliary feed: Finnhub earnings calendar

Next-earnings dates power the `EARNINGS_PROXIMITY` alert rule
([US-56](../features/us-56-earnings-proximity-alert.md)). Alpaca's data plans
do not serve earnings dates (nor did Massive — a $99/mo Benzinga add-on), so
the feed comes from **Finnhub's free tier** — an official, keyed, JSON-over-HTTPS
calendar endpoint.

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

`loadFinnhubApiKey()` in `src/main/integrations/finnhub-credentials.ts` reads
`import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with a
`process.env.FINNHUB_API_KEY` runtime fallback — the env-loader pattern the
retired Massive loader also used. Note that the Alpaca credential loader
deliberately does **not** read `import.meta.env` (see
[alpaca-credentials-runtime-env-only](../architecture/02-adrs/alpaca-credentials-runtime-env-only.md));
the Finnhub key predates that decision and is unchanged by US-99. No settings
UI, no encrypted storage, no migration — the app remains fully functional
without the key (the rule skips everywhere; every other rule is unaffected).

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

<!-- generated:from us-37,market-data-massive-migration,us-99 -->

## Market data and broker state share one credential

US-37 drew a product line between **shared market-data infrastructure** (then a
Massive key baked into app configuration) and **user-specific broker state**
(Alpaca paper/live credentials), and split the UI status indicators
accordingly. US-99 collapsed the vendor side of that line — market data is now
served by Alpaca using the very same saved credentials — while keeping the
surfaces distinct:

- **One credential story.** Saving Alpaca keys in Settings (or exporting
  `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` for the process in dev) enables broker
  surfaces **and** market data. `CredentialStatus.marketData` is
  `'configured'` when a broker environment is active or the env fallback is
  present, else `'missing'`; there is no separate market-data key, status or
  connection test. The Settings "Market Data — Alpaca" region explains the
  feeds and which environment is in use.
- **Settings actions restart the stock stream.** Switching broker environments
  or saving/removing the active Alpaca credentials recreates the broker
  provider **and** restarts the market-data websocket with the new keys
  (REST needs nothing). Broker-prefixed queries (`['broker', ...]`) are
  invalidated; `['market', ...]` caches are refreshed by the stream restart.
  The `LiveBrokerConfirmDialog` says so: "Market data reconnects with your live
  keys — same Alpaca feeds, same prices."
- **UI status indicators stay split.**
  - `EnvironmentBadge` reflects broker environment only: `PAPER`, `LIVE`, `NO BROKER`
  - `MarketDataStatusDot` reflects `CredentialStatus.marketData` ("Market data:
    connected via Alpaca" / "Market data: connect Alpaca in Settings")

### Degraded-state consequences

- With no credentials the app starts normally; every market-data call fails
  with `auth_failed`, Positions shows "Connect Alpaca to enable market data,
  broker activity and buying power." with an `Alpaca setup` link, price and
  opt-mid cells render `—`, and the screener shows "Market data not
  connected…" with **Open Settings** (distinct from the "Alpaca market data
  couldn't be reached on the last refresh…" outage card with **Retry
  refresh**).
- An `auth_failed` from either the stream or the broker renders one shared
  prompt — "Alpaca authentication failed — check your key in Settings" — and
  the stream error also raises the stale banner.
- A streaming entitlement problem (409 at connect, 405 symbol limit later)
  degrades to REST-only quotes plus the stale banner; it never blocks prices.

Under `FAKE_MARKET_DATA=true` the fake provider is credential-agnostic, so e2e
specs can stream fixture prices without saving credentials and separately
assert the no-credential copy.

<!-- /generated -->
