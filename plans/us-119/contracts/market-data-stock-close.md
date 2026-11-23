# Contract: market-data:stock-close

## Purpose

Returns the underlying's official close for one past trading day, so the expiration sheet can warn
when the underlying closed at or above the short call's strike (the call may have been assigned).
Advisory only: no write path depends on it, and every failure degrades to `close: null`.

## Request

```typescript
// GetStockClosePayloadSchema in src/main/schemas.ts
{
  ticker: string // 1..MAX_TICKER_LENGTH characters, as the stock-quotes payload
  date: string // YYYY-MM-DD — the short call's expiration
}
```

Registered in `registerMarketDataHandlers` (`src/main/ipc/market-data.ts`) inside
`handleIpcCall('market_data_stock_close_unhandled_error', …)`; one service call:
`fetchStockClose(getProvider(), ticker, date)`.

## Response (success)

```typescript
// StockCloseResult in src/main/schemas.ts
{
  ok: true
  close: string | null // 4-dp, e.g. '114.3000'; null when no bar, the provider is not
  //                       configured, or the provider call failed
}
```

`fetchStockClose` calls `provider.getStockDailyBars({ symbol: ticker, start: date, end: date })`
and returns the bar whose `date` equals `date`. A provider error is caught and logged at WARN
(`market_data_stock_close_failed`, with ticker and date, no payload), and the result is
`{ close: null }`. Under e2e the fake provider serves the bar from `WHEELBASE_FAKE_IV_SERIES` /
`_test:iv-series-set` (`{ price, sessions }`), so a test sets XYZ's close on 2027-07-16 to
`114.30`.

## Error codes

| field      | code             | message                                             |
| ---------- | ---------------- | --------------------------------------------------- |
| `ticker`   | `too_small`      | Zod's message for an empty ticker                   |
| `ticker`   | `too_big`        | Zod's message for a ticker over `MAX_TICKER_LENGTH` |
| `date`     | `invalid_format` | Zod's message for a non-`YYYY-MM-DD` value          |
| `__root__` | `internal_error` | `An unexpected error occurred`                      |

The renderer treats any `ok: false` as `close: null` and shows `Confirm with your broker that this
call was not assigned`.

## Source

- Handler: `src/main/ipc/market-data.ts`
- Service: `fetchStockClose` in `src/main/services/market-data.ts`
- Port: `MarketDataProvider.getStockDailyBars` (`src/main/integrations/market-data-provider.ts`)
- Preload: `marketData.stockClose` in `src/preload/index.ts` / `index.d.ts`; renderer adapter
  `getStockClose` in `src/renderer/src/api/market-data.ts`; hook `useStockClose`
  (`src/renderer/src/hooks/useStockClose.ts`)
