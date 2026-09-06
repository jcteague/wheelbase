# Data Model: US-97 — Collect IVR snapshots for watchlist underlyings

No schema change. No migration. This page records the tables the collector now reads and the
selection rule that changes.

## Tables read

### `positions` (existing)

| column   | type | used as                                            |
| -------- | ---- | -------------------------------------------------- |
| `ticker` | TEXT | collection target when `status != 'CLOSED'`        |
| `status` | TEXT | `'CLOSED'` excludes the row from the positions arm |

### `watchlist` (existing, `migrations/012_create_watchlist.sql`)

| column   | type             | used as                            |
| -------- | ---------------- | ---------------------------------- |
| `ticker` | TEXT PRIMARY KEY | collection target, unconditionally |

Every other watchlist column (`notes`, `own_below_price`, `ivr_trigger`, `post_earnings_only`,
`core_holding`, `added_at`) is ignored by the collector — being on the list is the only
criterion.

## Table written

### `ivr_snapshot` (existing, unchanged)

`(underlying, observed_at)` primary key; `ivr`, `ivp`, `iv30` decimal TEXT; `source`.
Same-UTC-day overwrite semantics from US-44 apply to watchlist-sourced rows identically.

## Selection logic

```sql
SELECT ticker FROM positions WHERE status != 'CLOSED'
UNION
SELECT ticker FROM watchlist
```

Post-processing (unchanged): `toUpperCase()` → `new Set(...)` → `sort(localeCompare)`.

Resulting target set = `{ open-position tickers } ∪ { watchlist tickers }`, upper-cased,
distinct, alphabetical.

### Truth table

| on watchlist | open position | closed position only | collected? | via       |
| ------------ | ------------- | -------------------- | ---------- | --------- |
| yes          | no            | —                    | yes        | watchlist |
| yes          | yes           | —                    | yes, once  | both arms |
| yes          | no            | yes                  | yes        | watchlist |
| no           | yes           | —                    | yes        | positions |
| no           | no            | yes                  | no         | —         |
| no           | no            | no                   | no         | —         |

### Lifecycle consequences

- **Removed from watchlist, no open position** → drops out of the next run. Prior
  `ivr_snapshot` rows are retained and remain readable via `getLatestIvrByUnderlying`
  (staleness labelling is US-98).
- **Added to watchlist** → picked up by the next scheduled or manual run. No backfill.

## Validation rules

None new. Ticker casing is normalised by both the watchlist service on insert and the collector
on read.

## Result type (unchanged)

`CollectIVRSnapshotsResult = { successCount, errorCount, skippedCount, skippedReason }` —
counts now span watchlist and position tickers together; there is no per-source breakdown.
