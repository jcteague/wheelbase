# Contract: watchlist:add

## Purpose

Create one watchlist entry — a normalized ticker plus optional thesis and structured entry
conditions — rejecting duplicates and malformed symbols.

## Request

```typescript
// WatchlistAddPayloadSchema in src/main/schemas.ts
{
  ticker: string // trimmed, uppercased, /^[A-Z]{1,5}$/
  notes?: string // trimmed, ≤ 500 chars
  ownBelowPrice?: number | null // > 0 when present
  ivrTrigger?: number | null // integer 0-100 when present
  postEarningsOnly?: boolean // default false
  coreHolding?: boolean // default false
}
```

## Response (success)

```typescript
{
  ok: true
  entry: {
    ticker: string
    notes: string | null
    ownBelowPrice: string | null // 4dp TEXT
    ivrTrigger: number | null
    postEarningsOnly: boolean
    coreHolding: boolean
    addedAt: string // ISO-8601
  }
}
```

## Error codes

| field      | code             | message                                |
| ---------- | ---------------- | -------------------------------------- |
| `ticker`   | `duplicate`      | `<TICKER> is already on the watchlist` |
| `ticker`   | `invalid_string` | `Enter a valid ticker symbol`          |
| `ticker`   | `too_small`      | `Enter a ticker symbol`                |
| `notes`    | `too_big`        | (Zod max-length message)               |
| `__root__` | `internal_error` | `An unexpected error occurred`         |

`<TICKER>` is the normalized uppercase symbol (e.g. `AAPL is already on the watchlist`). The
duplicate error is a field-scoped `ValidationError('ticker','duplicate',...)` thrown by the service;
`handleIpcCall` maps it onto the `ticker` field. Empty/malformed symbol errors are produced by the
renderer add-form schema (`src/renderer/src/schemas/watchlist.ts`) before submit and re-validated by
`WatchlistAddPayloadSchema` on the main side.

## Source

- Handler: `src/main/ipc/watchlist.ts` (`registerWatchlistIpc`, channel `watchlist:add`,
  log label `watchlist_add_error`)
- Service: `src/main/services/watchlist.ts` (`addWatchlistEntry(db, payload)`)
