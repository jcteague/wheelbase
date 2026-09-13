# Contract: watchlist:snapshot

## Purpose

Returns one row per watchlist entry with its underlying quote, freshness-assessed IV rank,
earnings display, and the pure gate verdict — all computed at one request clock — so the
Watchlist page can build the Meets criteria / Stocks of interest bench without pulling
option chains.

## Request

```typescript
// No payload. Like `screener:results`, there is nothing to validate, so no Zod request
// schema is added. The handler reads the watchlist from SQLite and the clock from the
// shared fake-IVR collaborators (`getCurrentDate`), the same source `screener:results` uses.
```

## Response (success)

```typescript
type IpcSnapshotQuote = {
  price: string // 2dp decimal string from the provider
  prevClose: string | null
  timestamp: string // ISO
}

type IpcGate = {
  verdict: 'met' | 'unmet' | 'unknown' | 'none'
  label: string | null // reason text for unmet/unknown; null otherwise
}

type IpcEntryVerdict = {
  price: IpcGate
  iv: IpcGate
  earnings: IpcGate
}

type IpcEarningsDisplay =
  | { kind: 'date'; date: string; daysUntil: number; withinWindow: boolean } // 'YYYY-MM-DD'
  | { kind: 'unknown' }

interface IpcWatchlistSnapshotRow {
  entry: IpcWatchlistEntry // existing shape from watchlist:list
  quote: IpcSnapshotQuote | null // null → the quote fetch failed for this ticker
  ivRank: IpcIvRank | null // IpcIvRank.state now includes 'expired'
  earnings: IpcEarningsDisplay
  verdict: IpcEntryVerdict
}

// { ok: true, rows: IpcWatchlistSnapshotRow[], asOf: string }
type IpcWatchlistSnapshotResult = IpcResult<{
  rows: IpcWatchlistSnapshotRow[] // watchlist order (added_at DESC)
  asOf: string // ISO request clock the verdicts were computed at
}>
```

Preload: `window.api.watchlist.snapshot(): Promise<IpcWatchlistSnapshotResult>`.

## Error codes

| field      | code             | message                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__root__` | `internal_error` | Only the standard envelope error applies. Every expected failure (provider unconfigured or unreachable, a single quote failing, an IVR or earnings read failing) is modelled inside the success payload as `quote: null`, `ivRank: null`, or `earnings: { kind: 'unknown' }` with an `unknown` gate — never as an `ok: false` envelope. |

## Degradation guarantees (asserted by service tests)

- `getProvider()` throws → every row `quote: null`, price gates `unknown`, IVR and earnings
  still populated, `ok: true`.
- One ticker's `getStockQuotes` rejects → only that row's `quote` is `null`.
- `getEarningsCalendar` rejects → every row `earnings: { kind: 'unknown' }`, earnings gates
  `unknown` where `postEarningsOnly` is set; IVR assessment falls back to time tiers alone
  (`lastEarnings` undefined).
- IVR snapshot read fails → every row `ivRank: null`, IV gates `unknown` "IV unavailable".
- Empty watchlist → `{ rows: [], asOf }`; no provider call is made.

## Source

- Handler: `src/main/ipc/watchlist.ts` (`registerWatchlistIpc({ db, getProvider, getCurrentDate })`)
- Service: `src/main/services/watchlist-snapshot.ts` (`buildWatchlistSnapshot`)
- Engine: `src/main/core/watchlist-signal.ts` (`evaluateEntry`, `reasonsFor`, `allGatesPass`, `earningsDisplay`)
- Shared quote helper: `src/main/services/underlying-quotes.ts` (`fetchIsolatedStockQuotes`)
- Preload: `src/preload/index.ts`, `src/preload/index.d.ts`
- Renderer adapter: `src/renderer/src/api/watchlist.ts` (`getWatchlistSnapshot`), hook `src/renderer/src/hooks/useWatchlistSnapshot.ts`, key `watchlistQueryKeys.snapshot = ['watchlist', 'snapshot']`
