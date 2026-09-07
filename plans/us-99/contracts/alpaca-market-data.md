# Contract: `AlpacaMarketDataProvider` (external vendor contract — Alpaca Market Data + Trading API)

> US-99 adds **no new IPC handler**. Every `market-data:*`, `screener:*` and `broker:*` channel
> keeps its request/response shape. This file documents the vendor seam that replaces
> `MassiveMarketDataProvider` behind the unchanged `MarketDataProvider` interface.

## Purpose

Serve every `MarketDataProvider` method from Alpaca's free data plan: batched IEX stock
snapshots, an IEX websocket for live minute bars, indicative option chain and single-contract
snapshots, and open interest from the trading API.

## Request

```typescript
// src/main/integrations/alpaca-market-data.ts
import type { AlpacaCredentials } from '../services/settings'

export type AlpacaMarketDataConfig = {
  loadCredentials: () => AlpacaCredentials | null // resolved on EVERY REST call and in connect()
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  constructor(config: AlpacaMarketDataConfig)
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]>
  supportsStreaming(feed: MarketDataFeed): boolean // true for 'stockQuotes', false otherwise
  connect(feeds?: MarketDataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
```

### Outbound HTTP

All REST requests carry `APCA-API-KEY-ID: <keyId>` and `APCA-API-SECRET-KEY: <secret>`.
Headers are never logged.

| Purpose                | Request                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock snapshots        | `GET https://data.alpaca.markets/v2/stocks/snapshots?symbols={A,B,…}&feed=iex` — one request for the whole ticker list; empty list ⇒ no request, empty `Map`                                                   |
| Option chain           | `GET https://data.alpaca.markets/v1beta1/options/snapshots/{underlying}?feed=indicative[&type=][&expiration_date_gte=][&expiration_date_lte=][&strike_price_gte=][&strike_price_lte=]&limit={n}[&page_token=]` |
| Single option snapshot | `GET https://data.alpaca.markets/v1beta1/options/snapshots?symbols={contractId}&feed=indicative`                                                                                                               |
| Open interest          | `GET {tradingHost}/v2/options/contracts?underlying_symbols={underlying}[&type=][&expiration_date_gte=][&expiration_date_lte=][&strike_price_gte=][&strike_price_lte=]&limit=10000[&page_token=]`               |

`tradingHost` = `https://paper-api.alpaca.markets` when `credentials.environment === 'paper'`,
else `https://api.alpaca.markets`.

Chain pagination: no `filter.limit` → `limit=1000`, follow `next_page_token` until `null`.
With `filter.limit` → `min(limit, 1000)` plus `filter.cursor` as `page_token`, first page only.
Contracts always paginate to exhaustion. Ordering: chain first; empty chain ⇒ return `[]`
without a contracts request.

### Outbound websocket

| Step                                                        | Client sends                                                                                                                                   | Server frame that advances                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `connect()` opens `wss://stream.data.alpaca.markets/v2/iex` | —                                                                                                                                              | `[{"T":"success","msg":"connected"}]`                                             |
| authenticate                                                | `{"action":"auth","key":<keyId>,"secret":<secret>}`                                                                                            | `[{"T":"success","msg":"authenticated"}]` ⇒ `connect()` resolves                  |
| `stream('stockQuotes', s)`                                  | `{"action":"unsubscribe","bars":[removed]}` then `{"action":"subscribe","bars":[added]}` (only non-empty arrays, only when the socket is open) | `[{"T":"subscription","bars":[…]}]` (logged, not awaited)                         |
| tick                                                        | —                                                                                                                                              | `{"T":"b","S":…,"o","h","l","c","v","t","n","vw"}` ⇒ `StreamEvent` on the subject |
| `disconnect()`                                              | socket close                                                                                                                                   | `close` ⇒ `ws = null`, `subscribed.clear()`                                       |

`connect(feeds)` ignores `feeds` other than logging; only `'stockQuotes'` is streamable.

## Response (success)

- `getStockQuotes` → `Map<ticker, StockQuote>` per `data-model.md` "Mapping onto `StockQuote`
  (REST seed)". Tickers absent from Alpaca's map, or without `latestTrade`, are omitted.
- `getOptionChainSnapshot` → `OptionChainQuote[]` per `data-model.md`; every entry parsed as
  OCC; `[]` for an empty `snapshots` map.
- `getOptionSnapshot` → `OptionSnapshot` with `openInterest: null`.
- `stream` → `Observable<StreamEvent<StockQuote>>` filtered to `symbols` (empty `symbols` ⇒
  everything the socket delivers), ticks mapped per "Mapping onto `StockQuote` (stream tick)".
- Timestamps are millisecond ISO strings; money 2dp; greeks/IV 4dp; strike 4dp.

## Error codes

REST — thrown as `MarketDataError` (converted to the `{ ok: false, errors }` envelope only by
`handleIpcCall`; classified by `classifyChainFailure` in the chain service):

| field      | code            | message                                        | Trigger                                                                                      |
| ---------- | --------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `__root__` | `auth_failed`   | `Alpaca credentials not configured`            | `loadCredentials()` returned `null`                                                          |
| `__root__` | `auth_failed`   | `HTTP 401` / `HTTP 403`                        | Data or trading API rejected the keys                                                        |
| `__root__` | `not_found`     | `HTTP 404: {url}`                              | Endpoint returned 404                                                                        |
| `__root__` | `not_found`     | `Option contract {contractId} not in snapshot` | `?symbols=` response omitted the requested symbol                                            |
| `__root__` | `rate_limited`  | `rate limit exceeded`                          | 429 persisted after `MAX_RETRIES = 2` retries honouring `Retry-After` (seconds; default 1 s) |
| `__root__` | `network_error` | fetch error message                            | `isNetworkError(err)` on the `fetch` rejection                                               |
| `__root__` | `unknown`       | `HTTP {status}`                                | Any other non-2xx, including `400 invalid symbol`                                            |
| `__root__` | `unknown`       | underlying error message                       | `fetch` rejected with a non-network error                                                    |

Websocket — `connect()` rejects with `MarketDataError`; after `connect()` resolves, server
`error` frames go to the stream's error channel as `StreamError`:

| Phase         | Server frame / event           | Result                                                                                              |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `connect()`   | `{"T":"error","code":402}`     | reject `MarketDataError('auth_failed', 'Alpaca WebSocket auth failed')`                             |
| `connect()`   | `{"T":"error","code":409}`     | reject `MarketDataError('streaming_unsupported', 'insufficient subscription')`                      |
| `connect()`   | `{"T":"error","code":406}`     | reject `MarketDataError('unknown', 'connection limit exceeded')`                                    |
| `connect()`   | any other `error` frame        | reject `MarketDataError('unknown', msg)`                                                            |
| `connect()`   | socket `error` event           | reject `MarketDataError('network_error', err.message)`                                              |
| `connect()`   | no `authenticated` within 10 s | reject `MarketDataError('network_error', 'auth timeout')`                                           |
| after connect | `{"T":"error","code":405}`     | `subject.error({ feed: 'stockQuotes', code: 'symbol_limit', message, reconnectable: false })`       |
| after connect | `{"T":"error","code":406}`     | `subject.error({ …, code: 'connection_limit', … })`                                                 |
| after connect | any other `error` frame        | `subject.error({ …, code: 'unknown', … })`                                                          |
| after connect | socket `close`                 | `info` log, `ws = null`, `subscribed.clear()`; no error emitted (Massive parity, no auto-reconnect) |

Not errors: `{"snapshots":{}}` → `[]`; a stock symbol missing from the snapshot map → omitted;
contracts endpoint failure → `openInterest: null` + `warn`.

## Rate budget

Alpaca free plan: 200 REST requests/min, one websocket connection, 30 streamed symbols.
Per screener refresh: 2 requests per watchlist ticker at `CHAIN_FETCH_CONCURRENCY = 4`. Per
alert-evaluation tick: 1 batched stock snapshot + 1 per open option leg. Per ticker-set
change: 1 batched stock snapshot. A 405 from the socket is surfaced, never truncated.

## Source

- Implementation: `src/main/integrations/alpaca-market-data.ts`
- Shared credential loader: `src/main/integrations/alpaca-credentials.ts`
- Shared parser: `src/shared/option-symbol.ts` (`parseOccSymbol`), re-exported from `src/main/core/option-symbol.ts`
- Shared error helper: `src/main/integrations/integration-errors.ts` (`isNetworkError`)
- Factory: `src/main/integrations/market-data-factory.ts` (`configure({ loadActiveAlpacaCredentials })`; fake under `FAKE_MARKET_DATA=true`, else `new AlpacaMarketDataProvider(...)`; never throws)
- Stream restart: `src/main/services/market-data.ts` (`StreamState.tickers`, `restartStockQuoteStream`), `src/main/ipc/market-data.ts` (returns `{ restartStockQuoteStream }`), `src/main/index.ts` (`onBrokerProviderChanged`)
- Vendor docs (fetched 2026-09-06): `docs.alpaca.markets/reference/optionchain`, `…/reference/optionsnapshots`, `…/reference/get-options-contracts`, `…/docs/real-time-stock-pricing-data`, `…/docs/streaming-market-data`, `alpaca.markets/data`
