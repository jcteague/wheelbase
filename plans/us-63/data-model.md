# Data Model: US-63 — Watchlist Entry

## Entity: `watchlist` (one row per curated ticker)

Migration: `migrations/012_create_watchlist.sql`

```sql
CREATE TABLE watchlist (
  ticker             TEXT PRIMARY KEY,             -- normalized uppercase symbol, 1-5 A-Z
  notes              TEXT,                          -- nullable thesis, ≤ 500 chars (bound from newWheelSchema.thesis)
  own_below_price    TEXT,                          -- nullable "would own below" price; money, 4dp via decimal.js
  ivr_trigger        INTEGER,                       -- nullable "wait for high IV" IV-rank threshold, 0-100
  post_earnings_only INTEGER NOT NULL DEFAULT 0,    -- boolean 0/1
  core_holding       INTEGER NOT NULL DEFAULT 0,    -- boolean 0/1
  added_at           TEXT NOT NULL                  -- ISO-8601 timestamp; drives newest-first ordering
);

CREATE INDEX idx_watchlist_added_at_desc ON watchlist (added_at DESC);
```

### Column notes

| Column               | Type    | Nullable | Purpose                                                                        |
| -------------------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `ticker`             | TEXT    | no (PK)  | Normalized uppercase symbol; natural unique key                                |
| `notes`              | TEXT    | yes      | Free-text thesis; stored trimmed, ≤ 500 chars                                  |
| `own_below_price`    | TEXT    | yes      | "Would own below" target price; 4dp money string (`new Decimal(v).toFixed(4)`) |
| `ivr_trigger`        | INTEGER | yes      | "Wait for high IV" IV-rank threshold (whole number 0-100)                      |
| `post_earnings_only` | INTEGER | no       | 0/1; whether entry gates on a post-earnings window                             |
| `core_holding`       | INTEGER | no       | 0/1; a name the trader is always willing to own                                |
| `added_at`           | TEXT    | no       | ISO-8601; new entries sort to the top (`ORDER BY added_at DESC`)               |

### How rows change

- **Create** (`watchlist:add`): one INSERT with `added_at = new Date().toISOString()`. Rejected up
  front with a `ticker` `duplicate` `ValidationError` if a row with the normalized ticker exists.
- **Remove** (`watchlist:remove`): one DELETE by ticker. Idempotent — removing an absent ticker is
  not an error (nothing to remove). Does not touch `positions` or trade history.
- **No update in US-63** — editing thesis/conditions is US-69 (adds `updated_at` later).

## Row shape (DB → service)

```typescript
interface WatchlistRow {
  ticker: string
  notes: string | null
  own_below_price: string | null // money 4dp TEXT
  ivr_trigger: number | null
  post_earnings_only: number // 0 | 1
  core_holding: number // 0 | 1
  added_at: string // ISO-8601
}
```

## Result shape (service → IPC → renderer), camelCase

```typescript
// exported from src/main/schemas.ts
interface WatchlistEntryRecord {
  ticker: string
  notes: string | null
  ownBelowPrice: string | null // money 4dp TEXT; null when unset
  ivrTrigger: number | null // 0-100; null when unset
  postEarningsOnly: boolean // mapped from 0/1
  coreHolding: boolean // mapped from 0/1
  addedAt: string // ISO-8601
}
```

## Validation rules (from acceptance criteria)

| Rule                           | Where enforced                                                                      | Message                                |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------- |
| Ticker required                | renderer schema (`watchlist.ts`), Zod `min(1)`                                      | `Enter a ticker symbol`                |
| Ticker 1-5 A-Z letters         | renderer schema regex `^[A-Z]{1,5}$`                                                | `Enter a valid ticker symbol`          |
| Ticker normalized to uppercase | renderer schema `.toUpperCase()` + service `toUpperCase()`                          | —                                      |
| No duplicate ticker            | `addWatchlistEntry` service pre-check → `ValidationError('ticker','duplicate',...)` | `<TICKER> is already on the watchlist` |
| Thesis ≤ 500 chars             | renderer schema `max(500)` + main `WatchlistAddPayloadSchema`                       | (Zod length message)                   |
| `own_below_price` > 0          | renderer schema (when condition active) + main schema `positive()`                  | (Zod message)                          |
| `ivr_trigger` int 0-100        | renderer schema + main schema `int().min(0).max(100)`                               | (Zod message)                          |
| Thesis + conditions optional   | all condition/thesis fields `.optional()`                                           | —                                      |

## Ordering / selection logic

- **List:** `SELECT ... FROM watchlist ORDER BY added_at DESC`. Newest entry first (satisfies
  "A newly added ticker appears at the top of the list").
- **Condition tags** (derived in renderer from the record, mirroring mockup `conditionTags()`):
  - `ownBelowPrice != null` → tag `≤ $<ownBelowPrice>` (trimmed of trailing zeros for display)
  - `ivrTrigger != null` → tag `IVR ≥ <ivrTrigger>`
  - `postEarningsOnly` → tag `post-earnings`
  - `coreHolding` → tag `core`
