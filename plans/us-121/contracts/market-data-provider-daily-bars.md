# Contract: MarketDataProvider daily bars (`getOptionDailyBars`, `getStockDailyBars`)

## Purpose

Two new capabilities on the `MarketDataProvider` port that return completed daily bars — the only
input the IV30 engine consumes. Market facts; never on `BrokerProvider`.

## Request

```typescript
// src/main/integrations/market-data-provider.ts
export type DailyBar = {
  date: string // 'YYYY-MM-DD' — the Eastern session day, derived with etDateOf(bar.t)
  vwap: string // 4 dp decimal string
  close: string // 4 dp
  volume: number
  tradeCount: number // Alpaca `n`
}

export type DailyBarRange = {
  start: string // 'YYYY-MM-DD' inclusive
  end?: string // 'YYYY-MM-DD' inclusive; OMITTED means "through the present". The caller
  // guarantees this is never the current calendar day (see iv-history service).
}

export type MarketDataProvider = {
  // …existing members…
  /** Daily bars for up to any number of OCC symbols. The adapter batches 100 per request and
   *  follows pagination. A symbol with no bars is absent from the map — a miss, not an error. */
  getOptionDailyBars(input: { symbols: string[] } & DailyBarRange): Promise<Map<string, DailyBar[]>>
  /** The underlying's daily bars from the consolidated (SIP) feed, ascending by date. */
  getStockDailyBars(input: { symbol: string } & DailyBarRange): Promise<DailyBar[]>
}

/** The slice the IV-history service takes. */
export type IvHistoryBarSource = Pick<
  MarketDataProvider,
  'getOptionDailyBars' | 'getStockDailyBars'
>
```

## Response (success)

- `getOptionDailyBars` → `Map<occSymbol, DailyBar[]>`, each array ascending by `date`; only
  symbols that returned at least one bar are present. `symbols: []` → empty map with no request.
- `getStockDailyBars` → `DailyBar[]` ascending by `date`; `[]` when the vendor returned none.

## Alpaca adapter (`alpaca-market-data.ts`, `alpaca-market-data-mappers.ts`)

| Item       | Value                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Option URL | `${DATA_BASE_URL}/v1beta1/options/bars?symbols=<≤100 comma-joined>&timeframe=1Day&start=…[&end=…]&limit=10000[&page_token=…]`                            |
| Stock URL  | `${DATA_BASE_URL}/v2/stocks/bars?symbols=<ticker>&timeframe=1Day&feed=sip&adjustment=raw&start=…[&end=…]&limit=10000[&page_token=…]`                     |
| Raw shape  | `{ bars: Record<symbol, Array<{ t, o, h, l, c, v, n, vw }>> \| null, next_page_token: string \| null }`                                                  |
| Builders   | `buildOptionBarsUrl(symbols, range, pageToken?)`, `buildStockBarsUrl(symbol, range, pageToken?)` — `end` appended only when defined                      |
| Mapper     | `mapDailyBar(raw): DailyBar \| null` — drops a bar whose `vw`/`c` is non-finite or whose `t` is unparseable; `date = etDateOf(new Date(t))`              |
| Batching   | `chunk(symbols, 100)`; batches issued sequentially; pages merged per symbol                                                                              |
| Errors     | `MarketDataError` with the codes `apiFetch` already produces (`auth_failed`, `network_error`, `rate_limited`, `not_found`, `unknown`)                    |
| Logging    | DEBUG per request (symbols count, start, end, page) — `apiFetch` already logs the URL; INFO `alpaca_daily_bars_mapped` with symbol/bar counts per ticker |

## Fake adapter (`fake-market-data.ts`)

Serves bars synthesised from a programmed IV series (see `test-iv-history.md`). Records every call
as `{ kind: 'option' | 'stock', start, end }` and increments a counter that dev-only channels
expose. `FAKE_MARKET_DATA_ERROR` applies to both methods as it does to every other call.

## Error codes

| field | code                                      | message                                                                                              |
| ----- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| —     | `auth_failed`                             | `Alpaca credentials not configured` (thrown by `credentials()` before any request) or `HTTP 401/403` |
| —     | `rate_limited`                            | `rate limit exceeded` after two 429 retries                                                          |
| —     | `network_error` / `not_found` / `unknown` | as `apiFetch` today                                                                                  |

Not an IPC handler, so no `{ ok, errors }` envelope: these are thrown `MarketDataError`s that the
IV-history service classifies (auth → run-level skip; everything else → per-ticker `failed`).

## Source

- Port: `src/main/integrations/market-data-provider.ts`
- Adapter: `src/main/integrations/alpaca-market-data.ts`, `src/main/integrations/alpaca-market-data-mappers.ts`
- Fake: `src/main/integrations/fake-market-data.ts`
- Consumer: `src/main/services/iv-history.ts`
