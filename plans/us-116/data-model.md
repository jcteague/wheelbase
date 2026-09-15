# Data Model: US-116

**No schema change.** `trading_session` (US-98, migration `019`) is unchanged — this story changes _who fetches it_, not what it holds. `ivr_snapshot` is untouched. No migration is written.

## Types that relocate

All three move verbatim from `src/main/integrations/broker-provider.ts` to `src/main/integrations/market-data-provider.ts`. No field changes.

```typescript
export type MarketStatus = {
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}

/** One day the exchange published a session for, as the venue states it: an Eastern
 *  wall-clock close ('16:00', or '13:00' on an early-close day). Days the exchange was
 *  shut are simply absent from a calendar response. */
export type MarketCalendarDay = {
  date: string // 'YYYY-MM-DD'
  close: string // 'HH:MM' Eastern wall clock
}

/** Inclusive day bounds for a calendar request. */
export type MarketCalendarRange = {
  start: string // 'YYYY-MM-DD'
  end: string // 'YYYY-MM-DD'
}
```

## Ports, after the move

```typescript
// src/main/integrations/broker-provider.ts — facts about YOUR ACCOUNT
export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
}

// src/main/integrations/market-data-provider.ts — facts about THE MARKET
export type MarketDataProvider = {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]>
  getMarketStatus(): Promise<MarketStatus> // new
  getMarketCalendar(range: MarketCalendarRange): Promise<MarketCalendarDay[]> // new
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(feeds?: MarketDataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}

/** The one method the polling scheduler needs. Keeps `polling-scheduler.ts` from
 *  importing a port that can also stream quotes. */
export type MarketStatusSource = Pick<MarketDataProvider, 'getMarketStatus'>
```

`BrokerErrorCode` keeps `'environment_mismatch'` — `getAccountInfo` / `getActivities` still produce it. Calendar and clock failures are `MarketDataError` with the codes `apiFetch` already maps (`auth_failed`, `network_error`, `rate_limited`, `not_found`, `unknown`).

## Alpaca upstream shapes

Both endpoints are on `ALPACA_TRADING_BASE_URLS[environment]`, authenticated with the same `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` header pair `apiFetch` already sends.

```typescript
// GET {tradingBase}/v2/clock
type AlpacaClock = {
  timestamp: string // ISO-8601 with an offset, e.g. '2026-09-11T10:04:00-04:00'
  is_open: boolean
  next_open: string
  next_close: string
}

// GET {tradingBase}/v2/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
type AlpacaCalendarDay = {
  date: string // 'YYYY-MM-DD'
  open: string // 'HH:MM' ET — not mapped
  close: string // 'HH:MM' ET
}
```

Mapping rules, carried over unchanged from `alpaca-broker.ts`:

- `session` is derived, not reported: `is_open` → `'regular'`; otherwise the ET hour parsed off `timestamp`'s own offset (falling back to `-04:00`) picks `'pre'` (04:00–09:30), `'post'` (16:00–20:00) or `'closed'`.
- Alpaca lists only days the exchange traded, so **absence is a closure**. `close` already reflects early closes, so none are derived.
- Rows whose `date` or `close` is not a string are dropped.

## Calendar-cache state machine (unchanged from US-98, restated because the ACs turn on it)

`refreshTradingCalendar` writes **every calendar day** in its range, closures included as `close_at = NULL`, so coverage is derivable from the rows and "closed" is never confused with "never fetched".

| Stored coverage               | `readTradingCalendar` returns                            | IV rank renders               |
| ----------------------------- | -------------------------------------------------------- | ----------------------------- |
| no rows                       | `EMPTY_TRADING_CALENDAR` + `warn` "never been fetched"   | `n/a`                         |
| rows, but none covering today | `EMPTY_TRADING_CALENDAR` + `warn` "does not cover today" | `n/a`                         |
| rows covering today           | window clipped to stored coverage                        | assessed, with freshness ring |

`needsRefresh` is true when `last_day < now + (400 − 7) days` — i.e. at most weekly after a success. A **failed** refresh leaves `needsRefresh` true, so the next bench open retries; there is no backoff and none is added (the retry is user-paced, one per page open).

## `ensureTradingCalendar` contract

```typescript
/** Refreshes the cached exchange calendar if it is due, then resolves. Never throws
 *  and never rejects: an unconfigured provider, a provider error and an up-to-date
 *  cache are all "nothing more to do". Concurrent callers share one in-flight fetch. */
export function ensureTradingCalendar(
  db: Database.Database,
  getProvider: () => MarketDataProvider,
  now: Date
): Promise<void>
```

| Input state                                    | Behaviour                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| cache is current (`needsRefresh` false)        | resolves after one `MIN/MAX` query; no network call                                                                            |
| cache is stale or empty                        | one `getMarketCalendar` call, rows persisted, resolves                                                                         |
| `getProvider()` throws                         | `logger.warn` `trading_calendar_provider_unavailable`, resolves                                                                |
| `getMarketCalendar` rejects                    | `refreshTradingCalendar` already logs `trading_calendar_refresh_failed` at `warn` and returns `{ status: 'failed' }`; resolves |
| a second caller arrives while one is in flight | awaits the same promise; no second fetch                                                                                       |
