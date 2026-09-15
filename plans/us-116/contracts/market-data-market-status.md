# Contract: market-data:market-status

Replaces `broker:market-status`, which is removed. Same payload, same response shape — only the channel, the service behind it and the preload path change.

## Purpose

Reports the exchange's current session state so the renderer can render the market-status pill, without requiring a broker connection.

## Request

```typescript
// No payload. Invoked as window.api.marketData.marketStatus()
undefined
```

## Response (success)

```typescript
{
  ok: true
  status: {
    isOpen: boolean
    nextOpen: string // ISO-8601
    nextClose: string // ISO-8601
    session: 'regular' | 'pre' | 'post' | 'closed'
  }
}
```

## Error codes

Only the standard envelope errors apply. The handler adds no story-specific validation — there is no payload to validate — so every failure arrives as a `MarketDataError` translated by `handleIpcCall`.

| field      | code             | message                                                                        |
| ---------- | ---------------- | ------------------------------------------------------------------------------ |
| `__root__` | `auth_failed`    | `Alpaca credentials not configured` (or `HTTP 401` / `HTTP 403` from upstream) |
| `__root__` | `network_error`  | upstream network failure message                                               |
| `__root__` | `rate_limited`   | `rate limit exceeded`                                                          |
| `__root__` | `internal_error` | unhandled error, logged as `market_data_market_status_unhandled_error`         |

## Source

- Handler: `src/main/ipc/market-data.ts`
- Service: none — `handleIpcCall` wraps a single `getProvider().getMarketStatus()` call, matching the existing `broker:market-status` handler it replaces
- Preload: `src/preload/index.ts` → `marketData.marketStatus()`; typed in `src/preload/index.d.ts`
- Renderer: `src/renderer/src/api/market-data.ts` → `getMarketStatus()`, keyed `marketDataQueryKeys.marketStatus`

## Removed contract

`broker:market-status` is deleted from `ipc/broker.ts`, `preload/index.ts` (`broker.marketStatus`), `preload/index.d.ts` and `renderer/src/api/broker.ts`. `broker:account` and `broker:activities` are unchanged.
