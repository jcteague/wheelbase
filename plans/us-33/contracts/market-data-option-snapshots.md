# IPC Contract: `market-data:option-snapshots`

REST-style request/response. Renderer calls via `window.api.getOptionSnapshots({ symbols })`.

---

## Request

**Channel:** `market-data:option-snapshots`

**Payload:**

```ts
type IpcGetOptionSnapshotsPayload = {
  symbols: string[] // OCC symbols, e.g. ['AAPL260516P00180000']
}
```

**Validation (`GetOptionSnapshotsPayloadSchema` in `src/main/schemas.ts`):**

```ts
export const GetOptionSnapshotsPayloadSchema = z.object({
  symbols: z.array(z.string().min(1).max(25)).max(50)
})
export type GetOptionSnapshotsPayload = z.infer<typeof GetOptionSnapshotsPayloadSchema>
```

---

## Response

**Success:**

```ts
type IpcGetOptionSnapshotsResult =
  | {
      ok: true
      snapshots: Record<string, IpcOptionSnapshot>
    }
  | { ok: false; errors: IpcFieldError[] }

type IpcOptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks: {
    delta: string
    gamma: string
    theta: string
    vega: string
    iv: string
  }
  timestamp: string
}
```

The shape mirrors `OptionSnapshot` from `src/main/integrations/market-data-provider.ts` 1:1.
The IPC layer does **not** flatten or remove fields (unlike `IpcStockQuote`, which drops
`change` / `changePercent`). Reason: option snapshots are returned to the renderer as-is so
US-34 (Greeks display) can read `greeks` without an additional contract change.

---

## Error envelope

Standard `IpcFieldError[]` envelope (matches `handleIpcCall` semantics):

| `field`    | `code`           | When                                                  |
| ---------- | ---------------- | ----------------------------------------------------- |
| `symbols`  | (Zod issue code) | Payload validation failure                            |
| `__root__` | `auth_failed`    | `MarketDataError('auth_failed', ...)` from provider   |
| `__root__` | `network_error`  | `MarketDataError('network_error', ...)` from provider |
| `__root__` | `rate_limited`   | `MarketDataError('rate_limited', ...)` from provider  |
| `__root__` | `internal_error` | Unexpected throw (logged)                             |

---

## Empty-input behavior

When `symbols.length === 0`, return `{ ok: true, snapshots: {} }` without calling the provider.

---

## Unknown-symbol behavior

If the provider returns a Map without a requested symbol (Alpaca silently omits unknown contracts),
that symbol is simply absent from the `snapshots` record. No error. The renderer renders `—` for
absent entries.

---

## Logging

- `INFO market_data_option_snapshots_request` — `{ count: symbols.length }`
- `INFO market_data_option_snapshots_response` — `{ count: Object.keys(snapshots).length }`
- `ERROR market_data_option_snapshots_unhandled_error` — for the catch-all branch in `handleIpcCall`

---

## Wiring

`registerMarketDataHandlers(provider, getWindow)` in `src/main/ipc/market-data.ts`
registers this channel alongside the existing `market-data:stock-quotes`,
`:set-stock-quote-tickers`, `:market-status` handlers.

---

## Preload bridge

```ts
// src/preload/index.ts
getOptionSnapshots: (payload: IpcGetOptionSnapshotsPayload) =>
  invoke('market-data:option-snapshots', payload),

// src/preload/index.d.ts (extends Window['api'])
getOptionSnapshots: (
  payload: IpcGetOptionSnapshotsPayload
) => Promise<IpcGetOptionSnapshotsResult>
```

No event listeners — this story is REST-poll only (no streaming).
