# Data Model: US-69 — Edit a watchlist entry

No schema migration. The `watchlist` table (`migrations/012_create_watchlist.sql`) already
holds every field this story edits; US-69 adds a write path over the existing columns.

## Entities

### `watchlist` row (existing, unchanged)

| Column               | Type      | Editable by US-69 | Notes                                                             |
| -------------------- | --------- | ----------------- | ----------------------------------------------------------------- |
| `ticker`             | `TEXT` PK | **No**            | The entry's identity. Renaming = remove + re-add (US-63).         |
| `notes`              | `TEXT`    | Yes               | Free-text thesis, ≤ 500 chars, `NULL` when cleared.               |
| `own_below_price`    | `TEXT`    | Yes               | 4dp money via `decimal.js`; `NULL` when the condition is removed. |
| `ivr_trigger`        | `INTEGER` | Yes               | 0–100 whole number; `NULL` when the condition is removed.         |
| `post_earnings_only` | `INTEGER` | Yes               | 0/1.                                                              |
| `core_holding`       | `INTEGER` | Yes               | 0/1.                                                              |
| `added_at`           | `TEXT`    | **No**            | Preserved across edits — the bench's `added_at DESC` order holds. |

### `WatchlistEntryRecord` (existing result shape, `src/main/schemas.ts`)

```typescript
interface WatchlistEntryRecord {
  ticker: string
  notes: string | null
  ownBelowPrice: string | null // 4dp TEXT, e.g. '165.0000'
  ivrTrigger: number | null
  postEarningsOnly: boolean
  coreHolding: boolean
  addedAt: string // ISO — unchanged by an update
}
```

Returned unchanged by `watchlist:update`; the renderer mirror is `WatchlistEntry` in
`src/renderer/src/api/watchlist.ts` and the preload mirror is `IpcWatchlistEntry`.

### `WatchlistUpdatePayload` (new, `src/main/schemas.ts`)

Full replacement of every editable field, keyed by the immutable ticker.

```typescript
// Shared editable field set — extracted from WatchlistAddPayloadSchema so the bounds
// live once. Both payload schemas are `.extend({ ticker: WatchlistTickerSchema })`.
const WatchlistEntryFieldsSchema = z.object({
  notes: z.string().trim().max(500, 'Note must be 500 characters or fewer').nullable().optional(),
  ownBelowPrice: z.number().positive().nullable().optional(),
  ivrTrigger: z.number().int().min(0).max(100).nullable().optional(),
  postEarningsOnly: z.boolean().optional().default(false),
  coreHolding: z.boolean().optional().default(false)
})

export const WatchlistAddPayloadSchema = WatchlistEntryFieldsSchema.extend({
  ticker: WatchlistTickerSchema
})
export const WatchlistUpdatePayloadSchema = WatchlistEntryFieldsSchema.extend({
  ticker: WatchlistTickerSchema
})
export type WatchlistUpdatePayload = z.infer<typeof WatchlistUpdatePayloadSchema>
```

`WatchlistAddPayload`'s inferred type widens `notes` to `string | null | undefined`;
`addWatchlistEntry` already maps `?? null`, so no behaviour change on the add path.

### `UpdateWatchlistPayload` (new, renderer, `src/renderer/src/api/watchlist.ts`)

What the form submits. Every field is present so a caller cannot accidentally patch.

```typescript
export type UpdateWatchlistPayload = {
  ticker: string
  notes: string | null
  ownBelowPrice: number | null
  ivrTrigger: number | null
  postEarningsOnly: boolean
  coreHolding: boolean
}
```

## Storage mapping (service boundary, `src/main/services/watchlist.ts`)

Identical to `addWatchlistEntry` — extracted into a shared `toStoredFields(payload)` helper
during Refactor so the two writes cannot diverge:

| Payload field      | Stored as                                                      |
| ------------------ | -------------------------------------------------------------- |
| `notes`            | `payload.notes ?? null`; `''` after `.trim()` → `''`… see note |
| `ownBelowPrice`    | `null` → `NULL`; number → `new Decimal(n).toFixed(4)`          |
| `ivrTrigger`       | `payload.ivrTrigger ?? null`                                   |
| `postEarningsOnly` | `1` / `0`                                                      |
| `coreHolding`      | `1` / `0`                                                      |

**Empty-thesis note.** The renderer form maps an empty textarea to `notes: null` before
submitting (an empty or whitespace-only thesis becomes `null`), matching the add path, which sends `undefined`.
The service additionally normalises `''` to `null` so a direct IPC caller cannot store an
empty string that the detail panel would render as a blank line instead of `No thesis yet.`

## Form values (renderer, `src/renderer/src/schemas/watchlist.ts` — existing shape)

```typescript
// z.input — what RHF holds        // z.output — what onSubmit receives
ticker: string                     // trimmed, uppercased, TICKER_REGEX
thesis?: string                    // trimmed, ≤ 500 → 'Note must be 500 characters or fewer'
ownBelowPrice?: string             // '' | plain decimal > 0
ivrTrigger?: string                // '' | integer 0–100
postEarningsOnly?: boolean         // .default(false) → boolean
coreHolding?: boolean              // .default(false) → boolean
```

### Seeding defaults from a `WatchlistEntry` (edit mode)

| Entry field        | Form default                                                 | Row toggle                     |
| ------------------ | ------------------------------------------------------------ | ------------------------------ |
| `ticker`           | `entry.ticker` (not rendered as an input; carried in values) | —                              |
| `notes`            | `entry.notes ?? undefined`                                   | —                              |
| `ownBelowPrice`    | `null` → `undefined`; `'170.0000'` → `'170.00'`              | `showOwnBelow = value != null` |
| `ivrTrigger`       | `null` → `undefined`; `50` → `'50'`                          | `showHighIv = value != null`   |
| `postEarningsOnly` | as stored                                                    | chip `active`                  |
| `coreHolding`      | as stored                                                    | chip `active`                  |

### Submitting (edit mode) — form output → `UpdateWatchlistPayload`

| Form output        | Payload                                |
| ------------------ | -------------------------------------- |
| `ticker`           | as-is                                  |
| `thesis`           | the trimmed text, or `null` when empty |
| `ownBelowPrice`    | `value ? parseFloat(value) : null`     |
| `ivrTrigger`       | `value ? parseInt(value, 10) : null`   |
| `postEarningsOnly` | as-is                                  |
| `coreHolding`      | as-is                                  |

Removing a condition row (`✕`) already calls `setValue(field, '')`, which the table above
maps to `null` — that is the whole of "Remove a condition".

## Validation rules (from the acceptance criteria)

| Rule                               | Where enforced                                   | Message / outcome                                      |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Thesis ≤ 500 characters            | Renderer Zod (first), main Zod (defence)         | `Note must be 500 characters or fewer`; nothing saved  |
| Thesis may be empty                | Renderer maps `''` → `null`; service `'' → null` | Detail panel reads `No thesis yet.`; entry stays       |
| Ticker cannot change               | No ticker input in edit mode; PK in `WHERE`      | Rendered fixed with `· ticker fixed`                   |
| Entry must exist                   | Service `changes === 0`                          | `ticker` / `not_found` / `<T> is not on the watchlist` |
| Would-own price > 0, plain decimal | Existing renderer + main schemas                 | `Enter a dollar amount greater than 0`                 |
| IVR trigger whole number 0–100     | Existing renderer + main schemas                 | `IVR must be a whole number between 0 and 100`         |

## UI state (renderer page)

`WatchlistPage` gains one piece of state and four transitions. No new state elsewhere — the
form's own toggles are local, and the panel derives what to show from `editing === current.ticker`.

```
editing: string | null            // ticker being edited, or null

onEdit(ticker)        → editing = ticker; addOpen = false
onEditDone()          → editing = null                      // save or cancel
onSelect(ticker)      → selected = ticker; editing = null   // leaving the stock leaves the edit
onToggleAdd()         → addOpen = !addOpen; editing = null  // one entry form at a time
onRemove(ticker)      → mutate; if editing === ticker then editing = null
```

Bench detail panel content:

```
current === null                 → (nothing — existing behaviour)
editing === current.ticker       → <WatchlistEntryForm key={ticker} entry=… onSaved onCancel />
otherwise                        → <BenchDetail stock=… onReview onEdit />
```

## Verdict recomputation (no new logic)

A saved edit changes only stored inputs. `useUpdateWatchlistEntry` invalidates
`['watchlist']`, `['watchlist','snapshot']`, `['screener','results']`; `watchlist:snapshot`
re-runs `evaluateEntry` (`src/main/core/watchlist-signal.ts`) over the new row; `lib/bench.ts`
re-sections the cards. Example from the AC: `ivrTrigger` 50 → 30 against a fresh IVR 34
flips the IV gate `unmet('IV low')` → `met`, and a stock whose only block was that gate moves
to **Meets criteria**.
