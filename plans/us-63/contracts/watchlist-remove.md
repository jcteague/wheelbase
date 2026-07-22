# Contract: watchlist:remove

## Purpose

Remove one watchlist entry by ticker. Only removes it from the screener universe — never touches
positions or trade history.

## Request

```typescript
// WatchlistRemovePayloadSchema in src/main/schemas.ts
{
  ticker: string // trimmed, uppercased, /^[A-Z]{1,5}$/
}
```

## Response (success)

```typescript
{
  ok: true
  ticker: string // the normalized ticker that was removed (or targeted)
}
```

## Error codes

| field      | code             | message                        |
| ---------- | ---------------- | ------------------------------ |
| `__root__` | `internal_error` | `An unexpected error occurred` |

Remove is idempotent — deleting an absent ticker returns `{ ok: true }` and is not an error. Only
the standard envelope error applies. (A malformed ticker is blocked by the schema, but the renderer
never sends one — remove is triggered from the ✕ button on an existing row.)

## Source

- Handler: `src/main/ipc/watchlist.ts` (`registerWatchlistIpc`, channel `watchlist:remove`,
  log label `watchlist_remove_error`)
- Service: `src/main/services/watchlist.ts` (`removeWatchlistEntry(db, ticker)`)
