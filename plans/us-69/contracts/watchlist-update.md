# Contract: watchlist:update

## Purpose

Replace the thesis and entry conditions of an existing watchlist entry, identified by its
immutable ticker, and return the updated record.

## Request

```typescript
// src/main/schemas.ts — parsed by the handler before the service call.
// Full replacement: every editable field is written; an omitted or null optional clears it.
export const WatchlistUpdatePayloadSchema = WatchlistEntryFieldsSchema.extend({
  ticker: WatchlistTickerSchema // trimmed, uppercased, /^[A-Z]{1,5}$/ — the row key, never changed
})

// Expanded:
interface WatchlistUpdatePayload {
  ticker: string
  notes?: string | null // trimmed; ≤ 500 chars; undefined | null | '' all store NULL
  ownBelowPrice?: number | null // > 0; stored at 4dp
  ivrTrigger?: number | null // integer 0–100
  postEarningsOnly?: boolean // default false
  coreHolding?: boolean // default false
}
```

Preload: `window.api.watchlist.update(payload: IpcWatchlistUpdatePayload): Promise<IpcWatchlistUpdateResult>`
(`src/preload/index.ts`, typed in `src/preload/index.d.ts`).

Renderer adapter: `updateWatchlistEntry(payload: UpdateWatchlistPayload): Promise<WatchlistEntry>`
in `src/renderer/src/api/watchlist.ts`, where `UpdateWatchlistPayload` makes every field
required (`notes: string | null`, `ownBelowPrice: number | null`, …) so the form cannot patch.

## Response (success)

```typescript
// { ok: true, entry }
type IpcWatchlistUpdateResult = IpcResult<{ entry: IpcWatchlistEntry }>

interface IpcWatchlistEntry {
  ticker: string
  notes: string | null
  ownBelowPrice: string | null // 4dp TEXT, e.g. '165.0000'
  ivrTrigger: number | null
  postEarningsOnly: boolean
  coreHolding: boolean
  addedAt: string // unchanged by the update
}
```

## Error codes

| field           | code                                       | message                                   | Raised by                                      |
| --------------- | ------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| `ticker`        | `not_found`                                | `<TICKER> is not on the watchlist`        | service `ValidationError` when `changes === 0` |
| `ticker`        | `invalid_format`\*                         | `Enter a valid ticker symbol`             | Zod `WatchlistTickerSchema`                    |
| `notes`         | `too_big`\*                                | `Note must be 500 characters or fewer`    | Zod `.max(500, …)`                             |
| `ownBelowPrice` | `too_small`\*                              | Zod default for `.positive()`             | Zod                                            |
| `ivrTrigger`    | `too_small` / `too_big` / `invalid_type`\* | Zod defaults for `.int().min(0).max(100)` | Zod                                            |
| `__root__`      | `internal_error`                           | Zod/DB failure message                    | `handleIpcCall` catch-all                      |

\* Zod issue codes are emitted verbatim by `handleIpcCall` (`field: String(issue.path[0])`,
`code: issue.code`); the renderer form validates first with the same bounds, so these reach the
renderer only from a non-form caller. The `not_found` row is the only story-specific service
error. Duplicate-ticker (`duplicate`) does **not** apply — the ticker is the row being updated.

Renderer mapping: `throwMappedIpcErrors` → `ApiError { status: 400, body: { detail: errors } }`.
In edit mode the form has no ticker input, so a `ticker`-field error is surfaced through
`setError('root', …)` as the form-level `ErrorAlert`; every other field error binds to its input
as today. Fallback copy when no field error is present:
`Could not save the changes — please try again.`

## Side effects

- One `UPDATE watchlist SET notes, own_below_price, ivr_trigger, post_earnings_only,
core_holding WHERE ticker = ?`. `added_at` is not touched.
- Logging: `logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_update_input')`
  before the write; `logger.info({ ticker }, 'watchlist_entry_updated')` after.
- Renderer: `useUpdateWatchlistEntry` invalidates `['watchlist']`, `['watchlist','snapshot']`
  and `['screener','results']` on success so the bench re-judges the entry.

## Source

- Handler: `src/main/ipc/watchlist.ts` — `ipcMain.handle('watchlist:update', …)` via
  `handleIpcCall('watchlist_update_error', …)`
- Schema: `src/main/schemas.ts` — `WatchlistEntryFieldsSchema`, `WatchlistUpdatePayloadSchema`
- Service: `src/main/services/watchlist.ts` — `updateWatchlistEntry(db, payload)`
- Preload: `src/preload/index.ts`, `src/preload/index.d.ts`
- Renderer: `src/renderer/src/api/watchlist.ts`, `src/renderer/src/hooks/useUpdateWatchlistEntry.ts`
