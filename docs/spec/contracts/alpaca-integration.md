# Alpaca Integration

<!-- generated:from us-31,us-32,us-33 -->

## Overview

Alpaca is the upstream broker and market-data vendor for Wheelbase. The integration boundary is the **`MarketDataProvider` interface** — a provider-agnostic contract that downstream code consumes. The Alpaca-specific implementation (`AlpacaMarketDataProvider`) lives behind that interface and is constructed only by a factory; no service, IPC handler, or renderer module imports the concrete class or the `@alpacahq/typescript-sdk` package directly.

The provider exposes both transports the application needs:

- **REST** — request/response, used for snapshots (`getStockQuotes`, `getOptionSnapshots`), broker activity polling (`getActivities`), account info (`getAccountInfo`), and the market clock (`getMarketStatus`). Returns plain `Promise`s.
- **Stream** — long-lived WebSocket multiplexing per-symbol subscriptions, exposed as an RxJS `Observable<StreamEvent<T>>` via `provider.stream(feed, symbols)`. Two independent sockets — one for stock quotes (JSON frames), one for option quotes/trades (MessagePack frames).

Adapter responses use the project's domain types (`StockQuote`, `OptionSnapshot`, `MarketStatus`, `AccountInfo`, `BrokerActivity`) — never the raw SDK shapes. Errors are normalised into the typed `MarketDataError` family before they cross the boundary, with discriminating `code` fields that IPC handlers map to error envelopes — see [contracts/ipc-handlers.md](./ipc-handlers.md#market-datastock-quotes).

For the higher-level cache/lifecycle model (REST seed + stream tick bridge, market-status polling, stale-data detection), see [domain/market-data.md](../domain/market-data.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Abstraction layer

US-31 introduced a provider-agnostic abstraction so the rest of the application never depends on Alpaca specifically. There are three pieces:

### `MarketDataProvider` interface

The single contract every market-data provider must satisfy. Defined in `src/main/integrations/market-data-provider.ts`:

```typescript
interface MarketDataProvider {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getAccountInfo(): Promise<AccountInfo>
  getMarketStatus(): Promise<MarketStatus>
  supportsStreaming(feed: DataFeed): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
```

### `AlpacaMarketDataProvider` implementation

The Alpaca-backed concrete class. Lives alongside the interface (current tree exposes it via a sibling file under `src/main/integrations/`). It is the only module in the repo permitted to import `@alpacahq/typescript-sdk`, the only module permitted to import `ws`, and the only module permitted to import `@msgpack/msgpack`.

### `createMarketDataProvider` factory

The single entrypoint downstream code uses. Defined in `src/main/integrations/market-data-factory.ts`:

```typescript
interface MarketDataConfig {
  provider: 'alpaca' // extensible union for future providers
  keyId: string
  secretKey: string
  paper: boolean
  dataFeed?: 'sip' | 'iex' | 'delayed_sip' // stock feed, default 'sip'
  optionFeed?: 'opra' | 'indicative' // option feed, default 'opra'
}

function createMarketDataProvider(config: MarketDataConfig): MarketDataProvider
```

The factory switches on `config.provider`, returns `AlpacaMarketDataProvider` for `'alpaca'`, and throws for unknown providers. Services and IPC handlers import this function and the interface — never the concrete class. `src/main/index.ts` constructs the provider once at app startup and threads it through to handler registration.

A `FakeMarketDataProvider` sibling exists for e2e and dev (`src/main/integrations/fake-market-data.ts`) — same interface, env-driven canned responses (`WHEELBASE_MARKET_MOCK`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Boundary rules

- **Single import site for the SDK.** Only the Alpaca adapter file may `import { ... } from '@alpacahq/typescript-sdk'`. IPC handlers (`src/main/ipc/market-data.ts`), services, the renderer, and the pure-core engines never touch the SDK type or runtime.
- **Single import site for `ws` and `@msgpack/msgpack`.** Streaming transport packages are similarly confined to the adapter.
- **Domain types out, SDK types in.** The adapter accepts plain values (ticker arrays, OCC symbols, activity filters) and returns the project's domain types. SDK raw shapes (`latest_quote`, `prev_daily_bar`, etc.) and module-scoped local types for fields the SDK omits stay inside the adapter file; casts never leak outward.
- **Errors are typed before they leave.** Every thrown SDK error or socket failure is caught inside the adapter and re-thrown as `MarketDataError` with a discriminant `code`. IPC handlers map those codes 1:1 to error-envelope codes without re-inspecting the underlying SDK error.
- **Services consume the factory, not the class.** `src/main/services/market-data.ts` (`fetchStockQuotes`, `fetchOptionSnapshots`) takes a `MarketDataProvider` parameter — never an `AlpacaMarketDataProvider`.
- **Pure-core engines never see the adapter.** `src/main/core/` (lifecycle, cost basis, option-symbol, profit-target) has no I/O imports. Alpaca data only enters the system via IPC handlers calling the provider, then flows into the renderer's TanStack Query cache.
<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## What the SDK is used for vs bypassed

The provider uses `@alpacahq/typescript-sdk` (v0.0.32-preview) selectively — keeping SDK calls where they work, bypassing where they don't.

**Use the SDK for these REST calls:**

| SDK method                     | Used to implement                                    |
| ------------------------------ | ---------------------------------------------------- |
| `client.getAccount`            | `getAccountInfo()`                                   |
| `client.getClock`              | `getMarketStatus()` (clock half)                     |
| `client.getStocksQuotesLatest` | `getStockQuotes()` bid/ask (mid computed locally)    |
| `client.getActivity`           | `getActivities()` (with manual query-param handling) |

**Bypass the SDK for:**

| What                                  | Why bypassed                                         | What replaces it                                                                                                |
| ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Streaming entirely                    | SDK marks streaming "todo" — zero WebSocket support  | Raw `ws` package, two dedicated sockets                                                                         |
| `client.getStocksSnapshots`           | Hits the wrong API path                              | `getStocksQuotesLatest` (US-32 path) — `prevClose` carried via a separate request that returns `prev_daily_bar` |
| `client.getOptionsSnapshots`          | Response type omits `greeks` and `impliedVolatility` | Raw `fetch` against `/v1beta1/options/snapshots` with adapter-local types                                       |
| Option streaming MessagePack decoding | SDK doesn't decode option frames                     | `@msgpack/msgpack` `decodeMulti()` (handles Alpaca's batching)                                                  |

**Why not replace the SDK entirely?** It is a Deno-to-Node transpile (via `dnt`), marked no-longer-maintained, but the working REST endpoints work reliably. Rewriting them with raw `fetch` is unnecessary churn. **Why not `alpaca-trade-api-js`?** Older, callback-based, worse TypeScript support.

### Deprecated `src/main/integrations/alpaca.ts`

The pre-existing `src/main/integrations/alpaca.ts` (`client`, `resetClient`) is marked `@deprecated` by US-31. It remains in the tree to avoid breaking any in-flight branch that imports it, but no new code uses it — new code goes through `createMarketDataProvider`. Removal happens once downstream callers have migrated.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## REST surface

Each REST method is wrapped in a `try` / `wrapError(err, opLabel)` block that normalises HTTP 401 → `auth_failed`, 429 → `rate_limited`, network failures → `network_error`, and unknown failures → `unknown` (IPC handlers default that to `internal_error`).

### `getStockQuotes(tickers): Promise<Map<string, StockQuote>>`

- **SDK method:** `client.getStocksQuotesLatest({ symbols: tickers })` — plus a separate previous-close request to populate `prevClose`.
- **Used by:** `market-data:stock-quotes` IPC handler, called as the TanStack Query `queryFn` to **seed** the renderer cache with full quote data (including `prevClose`) before stream ticks start arriving.
- **Mapping per entry:**
  - `bid = Decimal(bp).toFixed(2)`
  - `ask = Decimal(ap).toFixed(2)`
  - `price = ((bid + ask) / 2).toFixed(2)` (mid)
  - `prevClose = Decimal(prev_daily_bar.c).toFixed(2)` (US-32 addition)
  - `change` / `changePercent` — see the data gaps section below
  - `volume = latest_quote.v ?? 0`
  - `timestamp = latest_quote.t` (ISO-8601)
- **Unknown ticker handling (AC-15):** unknown symbols are simply absent from the returned `Map`; no error is thrown.

### `getOptionSnapshots(contractIds): Promise<Map<string, OptionSnapshot>>`

- **HTTP path:** `/v1beta1/options/snapshots` (raw `fetch` — SDK type is incomplete).
- **Input:** OCC-formatted symbols (e.g. `AAPL260516P00180000`) built renderer-side via `buildOccSymbol` from `src/main/core/option-symbol.ts`.
- **Used by:** `market-data:option-snapshots` IPC handler (US-33). The renderer's `useOptionSnapshots(legs, { session })` hook builds OCC symbols from active option legs and polls this every 60 s when the market session is not `closed`.
- **Mapping per entry:**
  - `bid`, `ask`, `lastTrade` — 2dp decimal strings
  - `mid = ((bid + ask) / 2).toFixed(2)` — **computed by the provider**, not the renderer. The renderer reads `snapshot.mid` directly and never recomputes.
  - `openInterest`, `volume` — both typed `number | null`, both always `null` from Alpaca (see data gaps below)
  - `greeks.{delta, gamma, theta, vega}` — 4dp decimal strings
  - `greeks.iv` — implied volatility, 4dp decimal string
  - `timestamp` — ISO-8601
- **Unknown symbol handling:** absent from the returned `Map`; the renderer renders `—`.

### `getActivities(filter): Promise<BrokerActivity[]>`

- **SDK method:** `client.getActivity` (with manual query-param construction — the SDK ignores some params on this endpoint).
- **Filter shape:** `{ type: string; since?: string /* YYYY-MM-DD */ }`. `type` is an Alpaca activity code (e.g. `'OPASN'` for option assignment, `'OPEXP'` for expiration, `'OPXRC'` for exercise).
- **Returns:** array sorted by `transactionTime` descending. Each entry carries `activityId`, `activityType`, `symbol`, `qty`, `price`, `transactionTime`.

### `getAccountInfo(): Promise<AccountInfo>`

- **SDK method:** `client.getAccount`.
- **Returns:** `{ buyingPower, portfolioValue, cash, environment: 'paper' | 'live' }`. `environment` is derived from the provider's `paper` config flag — Alpaca's `getAccount()` carries no paper/live indicator.

### `getMarketStatus(): Promise<MarketStatus>`

- **SDK method:** `client.getClock`.
- **Used by:** `market-data:market-status` IPC handler, polled by the renderer's `useMarketStatus()` hook every 60 s. Drives the `MarketStatusPill` (`LIVE` / `EXT` / `CLOSED` / `DELAYED`).
- **Returns:** `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`. Alpaca's `/v2/clock` only returns `is_open`, `next_open`, `next_close` — `session` is **derived client-side** by comparing the clock timestamp against calendar windows (pre: 4:00–9:30 AM ET, regular: 9:30 AM–4:00 PM ET when `is_open`, post: 4:00–8:00 PM ET, closed: otherwise).
- **Why poll instead of stream?** Alpaca offers no streaming option for clock/session changes; transitions are predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, weekends/holidays) so a 60 s poll catches them within a minute.
<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Streaming surface

The provider exposes streaming as a typed Observable, never as raw SDK callbacks. Internally it owns two independent WebSocket lifecycles and multiplexes per-symbol subscriptions over each.

### `provider.stream(feed, symbols): Observable<StreamEvent<T>>`

```typescript
type DataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'

interface StreamEvent<T> {
  feed: DataFeed
  symbol: string
  data: T // StockQuote or OptionSnapshot depending on feed
  timestamp: string // ISO-8601
}
```

- **`stockQuotes`** — JSON frames; each event's `data` is a `StockQuote`.
- **`optionQuotes` / `optionTrades`** — MessagePack binary frames decoded via `decodeMulti()`; each event's `data` is an `OptionSnapshot` (quote-only — Greeks/IV are not in stream frames; see data gaps).

The renderer's `market-data:set-stock-quote-tickers` IPC handler holds one subscription per active-ticker change and emits per-tick `webContents.send('market-data:stock-quote', ...)` push events. Unsubscribing the prior Observable (via `subscription.unsubscribe()`) triggers an Alpaca `unsubscribe` frame for those symbols via Observable teardown.

### Transport (raw `ws` + two sockets)

| Feed    | URL                                                                      | Encoding                  |
| ------- | ------------------------------------------------------------------------ | ------------------------- |
| Stocks  | `wss://stream.data.alpaca.markets/v2/{dataFeed}` (default `sip`)         | JSON text frames          |
| Options | `wss://stream.data.alpaca.markets/v1beta1/{optionFeed}` (default `opra`) | MessagePack binary frames |

- **Connection limit:** Alpaca allows 1 concurrent connection per endpoint. The adapter therefore multiplexes all symbol subscriptions over each socket. Paper and live accounts share the same data-stream URLs — the paper/live distinction only affects the trading API base URL.
- **One `Subject` per socket** bridges WebSocket events to Observable subscribers. Each `stream()` call returns a new Observable that filters from the per-socket `Subject<StreamEvent>` by symbol; teardown sends `unsubscribe` and removes the symbol filter.

### Auth and subscribe protocol

Both sockets follow the same handshake:

```
1. Client connects to WebSocket
2. Server: [{"T":"success","msg":"connected"}]
3. Client: {"action":"auth","key":"...","secret":"..."}
4. Server: [{"T":"success","msg":"authenticated"}]
5. Client: {"action":"subscribe","quotes":["AAPL","MSFT"]}
6. Server pushes frames: [{"T":"q","S":"AAPL","bp":172.60,"ap":172.70,...}]
7. On Observable teardown:
   Client: {"action":"unsubscribe","quotes":["AAPL","MSFT"]}
```

For the option socket, frames 5–7 are MessagePack-encoded; the auth frame (step 3) is still JSON.

### Connection lifecycle

- **Constructor is lazy.** `new AlpacaMarketDataProvider({ keyId, secretKey, paper, dataFeed?, optionFeed? })` does **not** open any socket. It creates the SDK client internally via `createClient({ key, secret, paper })` and captures config; environments without credentials (e2e, renderer-only tooling) can still instantiate it.
- **`connect()` on first use.** Sockets open on the first subscription request — never at app startup. The IPC handler's module-scoped `connected` flag invokes `provider.connect()` on the first non-empty `setStockQuoteTickers` call. This avoids opening sockets the user may never need.
- **One socket per feed per app session.** Subsequent subscribe/unsubscribe requests reuse the existing socket; the adapter multiplexes internally.
- **`disconnect()` on app quit.** The main process registers `app.on('before-quit', () => provider.disconnect())`. `disconnect()` closes both sockets, completes the per-socket `Subject`s so all active subscribers receive `complete`, and **nulls out internal socket and Subject references** to prevent accidental use of closed/completed resources.

### Stream events and errors

`StreamError` is emitted through the Observable error channel:

```typescript
interface StreamError {
  feed: DataFeed
  code: string // 'stream_disconnected' | 'auth_failed' | ...
  message: string
  reconnectable: boolean
}
```

When the underlying WebSocket fails (auth loss, network drop, server-side disconnect), the adapter re-emits a `StreamError` through the Observable's `error` callback. The IPC handler catches it, forwards it to the renderer via the `market-data:stream-error` push event, and logs it. The renderer surfaces the `StaleDataBanner` immediately on receipt without waiting for the 5-minute freshness threshold (see [contracts/ipc-handlers.md](./ipc-handlers.md#market-datastream-error)).

**Reconnection logic is intentionally NOT in the provider.** `StreamError.reconnectable: true` is a hint, not behaviour. Consumers compose `retry` / `retryWhen` operators on the Observable themselves — RxJS gives downstream stories (US-38) the operators they need without bolting them onto the integration layer.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Error model

Every SDK error path and every socket failure funnels through a single helper inside the adapter:

```ts
function wrapError(err: unknown, op: string): never {
  // inspect err.response.status, err.code, etc.
  // throw new MarketDataError({ op, code: '<code>', cause: err })
}
```

`MarketDataError` is a structured `Error` subclass with a discriminating `code` field:

```typescript
class MarketDataError extends Error {
  code:
    | 'auth_failed'
    | 'network_error'
    | 'rate_limited'
    | 'stream_disconnected'
    | 'streaming_unsupported'
    | 'subscription_failed'
    | 'unknown'
}
```

| Code                    | When                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `auth_failed`           | SDK rejects credentials (HTTP 401, `Missing credentials`, stream auth frame rejected) |
| `network_error`         | Upstream unreachable, socket dropped, DNS failure, timeout                            |
| `rate_limited`          | SDK returns HTTP 429                                                                  |
| `stream_disconnected`   | Unexpected WebSocket close during an active subscription                              |
| `streaming_unsupported` | `provider.stream(feed, ...)` called for a feed `supportsStreaming(feed)` rejects      |
| `subscription_failed`   | Subscribe frame acknowledged with error                                               |
| `unknown`               | Catch-all for unclassified failures                                                   |

**Errors are thrown, not returned** (no `Result<T, E>` tuples), consistent with the rest of the codebase. The IPC handler layer maps the codes directly to envelope error codes — see the [Standard error codes](./ipc-handlers.md#standard-error-codes) table. Unclassified exceptions propagate as generic `Error` and become `internal_error` at the handler.

The adapter records **no explicit retry policy, no exponential backoff, and no per-call rate-limit tracker**. Recovery is the next user action (refresh, re-mount the positions page), the next 60 s `useMarketStatus` poll, or — for streams — whatever `retry` operator the consumer composes.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Data gaps and known limitations

A handful of fields are typed in the domain shapes but cannot be sourced from Alpaca:

- **`StockQuote.change` / `changePercent`** — Hardcoded to `'0.00'` in US-31 for both REST and streaming paths (Alpaca's `getStocksQuotesLatest` and stream frames don't carry previous-close). US-32 added `prevClose` to the REST path so the renderer can compute change client-side from `(price − prevClose)` whenever a tick arrives.
- **`OptionSnapshot.openInterest`** — Typed `number | null`, always `null` from Alpaca. Not available on any Alpaca option endpoint.
- **`OptionSnapshot.volume`** — Typed `number | null`, always `null` from Alpaca on snapshots. Could be derived from `getOptionsBars()` but that's deferred.
- **`OptionSnapshot.greeks` / `iv` on stream frames** — Only available via the REST `/v1beta1/options/snapshots` endpoint. Stream frames carry quote (bid/ask) or trade (price/size) only. US-33 polls REST every 60 s rather than bridging the stream for this reason.
- **`MarketStatus.session`** — Alpaca's `/v2/clock` carries no `session` field; the value is derived client-side inside the adapter.

These gaps shape several decisions documented in [domain/market-data.md](../domain/market-data.md) — most notably the REST-seed + stream-bridge cache pattern (so previous-close survives across stream ticks) and the 60 s REST poll for option snapshots (so Greeks stay fresh without a separate transport).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Source files

- `src/main/integrations/market-data-provider.ts` — the `MarketDataProvider` interface; `StockQuote`, `OptionSnapshot`, `MarketStatus`, `AccountInfo`, `BrokerActivity`, `ActivityFilter`, `DataFeed`, `StreamEvent`, `StreamError` types; `MarketDataError` class.
- `src/main/integrations/market-data-factory.ts` — `createMarketDataProvider(config)` factory + `MarketDataConfig` shape. Consumed once at startup by `src/main/index.ts`.
- `src/main/integrations/` (Alpaca adapter) — `AlpacaMarketDataProvider` implementation. The only file in the repo permitted to import `@alpacahq/typescript-sdk`, `ws`, or `@msgpack/msgpack`. Owns lazy SDK client construction, REST mapping, two-socket stream lifecycle, per-socket `Subject` bridging, and `wrapError` normalisation.
- `src/main/integrations/alpaca-stream-test-utils.ts` — shared `MockSocket`, `emitSocketEvent`, `simulateAuth` helpers used by adapter unit/e2e tests.
- `src/main/integrations/fake-market-data.ts` — `FakeMarketDataProvider` for e2e and dev; env-driven canned responses (`WHEELBASE_MARKET_MOCK`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`).
- `src/main/integrations/alpaca.ts` — pre-existing helper marked `@deprecated` by US-31; kept available, no new code uses it.

New dependencies introduced by US-31 (`package.json`):

- `ws` and `@types/ws` — WebSocket client for the Electron main process.
- `@msgpack/msgpack` — decode option stream MessagePack frames (`decodeMulti()`).
- `rxjs` — `Observable`, `Subject`, and a handful of utility functions for the streaming interface.

Plan-cited paths that do not exist at their named location after the "market data / broker api separation" refactor — e.g. `alpaca-market-data.ts`, `alpaca-market-data.test.ts`, `alpaca-market-data.e2e.test.ts` — moved into `market-data-provider.ts` plus a sibling Alpaca file under the same directory. Treat path references as approximate; the boundary contract (single import site, typed errors out, factory-only construction) is the load-bearing piece.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33 -->

## Driven by

- [us-31 — Market Data Provider Adapter](../features/us-31-market-data-provider-adapter.md)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
- [us-33 — Option Mid Price & Unrealized P&L](../features/us-33-option-mid-pnl.md)
<!-- /generated -->

<!-- generated:from us-37 -->

## US-37 broker settings and environment selection

US-37 extends the Alpaca boundary in a broker-specific direction without changing the shared market-data configuration model:

- **Alpaca paper/live credentials move into encrypted settings persistence.** `src/main/services/settings.ts` is now the source of truth for saved Alpaca credentials, storing them in `credential_settings` with Electron `safeStorage`.
- **Active broker environment is persisted separately from credentials.** `app_settings.active_broker_environment` stores `'paper' | 'live' | 'none'`, and broker factories resolve the effective active environment through that setting plus credential presence.
- **Runtime broker refresh is scoped.** `broker-factory.ts` is recreated when Alpaca credentials change or the active environment changes; `market-data-factory.ts` remains tied to shared Massive configuration.
- **Settings-specific Alpaca probes are intentionally separate from regular provider reads.** Candidate-key verification and stored-key re-verification use dedicated settings probe helpers so the app can test paper/live environments directly without depending on the currently active broker provider.

### Probe flows

- **Candidate credentials:** `settings:test-connection` with `{ vendor: 'alpaca', environment, keyId, secret }` calls `GET /v2/account` against paper or live and returns a masked account number on success.
- **Stored credentials:** `settings:test-stored-alpaca-connection` loads encrypted credentials for the requested environment and runs the same verification probe without returning plaintext secrets.
- **Environment mismatch handling:** entering live keys in the paper card returns `environment_mismatch` with the exact message `Environment mismatch — these are LIVE keys, not paper keys`.

This story keeps all direct Alpaca HTTP/SDK interaction inside integration or settings-probe boundaries; the renderer and IPC layers still consume typed result objects only.

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
