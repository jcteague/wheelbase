# Contract: watchlist:add (amended)

## Purpose

Add a ticker to the watchlist and, after the row commits, collect its IV rank on demand without
making the add wait on the network.

## Request

```typescript
// WatchlistAddPayloadSchema — unchanged
{
  ticker: string              // trimmed, upper-cased, /^[A-Z]{1,5}$/
  notes?: string | null
  ownBelowPrice?: number | null
  ivrTrigger?: number | null  // int 0..100
  postEarningsOnly?: boolean  // default false
  coreHolding?: boolean       // default false
}
```

## Response (success)

```typescript
{
  ok: true,
  entry: WatchlistEntryRecord   // unchanged: { ticker, notes, ownBelowPrice, ivrTrigger,
                                //              postEarningsOnly, coreHolding, addedAt }
}
```

The response is returned **before** any IVR request is made. The reading, when it lands, is
announced by the `ivr:snapshot-updated` push event (see `ivr-snapshot-updated.md`).

## Error codes

| field    | code        | message                                |
| -------- | ----------- | -------------------------------------- |
| `ticker` | `duplicate` | `<TICKER> is already on the watchlist` |

Standard Zod field errors for a malformed payload; `__root__` / `internal_error` for anything
unexpected. **An IVR fetch failure is never an error on this channel** — it is logged at warn in
the main process and the add has already succeeded.

## Side effect (US-100)

After the INSERT commits, `addWatchlistEntry` calls `void ivrOnDemand?.collect(ticker)`:

- exactly one `fetchIvr(ticker)` — never the batch targets query
- skipped when `ivr_snapshot` already holds a reading attributed to the current trading day
- `not_available` writes no row (bench shows `n/a`)
- the duplicate `ValidationError` is thrown before the INSERT, so a rejected add never collects

## Source

- Handler: `src/main/ipc/watchlist.ts` (`registerWatchlistIpc({ …, ivrOnDemand })`)
- Service: `src/main/services/watchlist.ts` (`addWatchlistEntry(db, payload, ivrOnDemand?)`)
- Port: `src/main/services/ivr-on-demand.ts` (`createIvrOnDemand`, `IvrOnDemand`)
