# IPC Contract: `market-data:market-status`

Renderer-initiated request/response. Returns the current market session.

## Channel

`market-data:market-status`

## Handler Location

`src/main/ipc/market-data.ts` — registered alongside the stock-quote handler in `registerMarketDataHandlers(provider)`.

## Payload (renderer → main)

None. Calls `window.api.getMarketStatus()` with no arguments. The IPC handler's `payload` is ignored.

## Response Shape (main → renderer)

```ts
type IpcGetMarketStatusResult =
  | { ok: true; status: IpcMarketStatus }
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> }

type IpcMarketStatus = {
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

### Error Mapping

| Source                                | IPC Error Code   | Field      |
| ------------------------------------- | ---------------- | ---------- |
| `MarketDataError('auth_failed', …)`   | `auth_failed`    | `__root__` |
| `MarketDataError('network_error', …)` | `network_error`  | `__root__` |
| `MarketDataError('rate_limited', …)`  | `rate_limited`   | `__root__` |
| Other thrown errors                   | `internal_error` | `__root__` |

## Behavior

1. Call `await provider.getMarketStatus()`.
2. Return `{ ok: true, status: <result> }`.
3. On `MarketDataError`, return `{ ok: false, errors: [{ field: '__root__', code, message }] }`.
4. On any other error, log with `logger.error({ err }, 'market_data_market_status_unhandled_error')` and return `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }`.

The handler **never throws** to the renderer.

## Preload Bridge

`src/preload/index.ts`:

```ts
getMarketStatus: () => invoke('market-data:market-status')
```

`src/preload/index.d.ts` extends `window.api`:

```ts
getMarketStatus: () => Promise<IpcGetMarketStatusResult>
```

## Renderer Adapter (`src/renderer/src/api/market-data.ts`)

```ts
export async function getMarketStatus(): Promise<MarketStatus> {
  const result = await window.api.getMarketStatus()
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.status
}
```

## Renderer Hook (`src/renderer/src/hooks/useMarketStatus.ts`)

```ts
export function useMarketStatus(): UseQueryResult<MarketStatus, ApiError> {
  return useQuery({
    queryKey: marketDataQueryKeys.marketStatus,
    queryFn: getMarketStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })
}
```

`refetchInterval` is constant 60 s (not session-dependent, since the polling itself is what detects session boundaries).

## Examples

### Regular session

```json
{
  "ok": true,
  "status": {
    "isOpen": true,
    "nextOpen": "2026-04-28T09:30:00-04:00",
    "nextClose": "2026-04-27T16:00:00-04:00",
    "session": "regular"
  }
}
```

### After-hours

```json
{
  "ok": true,
  "status": {
    "isOpen": false,
    "nextOpen": "2026-04-28T09:30:00-04:00",
    "nextClose": "2026-04-28T16:00:00-04:00",
    "session": "post"
  }
}
```

### Network failure

```json
{
  "ok": false,
  "errors": [
    { "field": "__root__", "code": "network_error", "message": "getMarketStatus: fetch failed" }
  ]
}
```
