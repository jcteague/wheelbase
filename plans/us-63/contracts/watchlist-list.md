# Contract: watchlist:list

## Purpose

Return every watchlist entry, newest first, to hydrate the Watchlist page.

## Request

```typescript
// none (no payload)
```

## Response (success)

```typescript
{
  ok: true
  entries: Array<{
    ticker: string
    notes: string | null
    ownBelowPrice: string | null // money 4dp TEXT; null when unset
    ivrTrigger: number | null // 0-100; null when unset
    postEarningsOnly: boolean
    coreHolding: boolean
    addedAt: string // ISO-8601
  }> // ordered by addedAt DESC
}
```

## Error codes

| field      | code             | message                        |
| ---------- | ---------------- | ------------------------------ |
| `__root__` | `internal_error` | `An unexpected error occurred` |

Only the standard envelope error applies — `watchlist:list` takes no input and has no
story-specific validation.

## Source

- Handler: `src/main/ipc/watchlist.ts` (`registerWatchlistIpc`, channel `watchlist:list`)
- Service: `src/main/services/watchlist.ts` (`listWatchlist(db)`)
