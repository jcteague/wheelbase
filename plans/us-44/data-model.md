# Data Model: US-44 — Persist IVR snapshots and schedule daily collection

## Entity: `ivr_snapshot`

Purpose: Persist the most recent scraped IVR observation for each actively traded underlying, while retaining the exact observation timestamp of the winning run for that day.

| Field         | Type   | Required | Notes                                                                        |
| ------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `underlying`  | `TEXT` | Yes      | Uppercase ticker symbol from `positions.ticker`.                             |
| `observed_at` | `TEXT` | Yes      | ISO-8601 timestamp returned by `fetchIVR(...).data.observedAt`.              |
| `ivr`         | `TEXT` | Yes      | Decimal string with 1 decimal place, stored from the numeric scraper result. |
| `ivp`         | `TEXT` | No       | Decimal string with 1 decimal place when Barchart returns percentile.        |
| `iv30`        | `TEXT` | No       | Decimal string for 30-day historical volatility when provided.               |
| `source`      | `TEXT` | Yes      | Constant `'barchart'`.                                                       |

Keys and indexes:

- Primary key: `(underlying, observed_at)`
- Secondary index: `(underlying, observed_at DESC)` for latest-snapshot lookups in `US-45`

Validation rules:

- `underlying` must be non-empty and normalized to uppercase before persistence.
- `ivr` must come from `fetchIVR`'s validated `IVRDataSchema`, which already constrains it to `0..100`.
- `ivp` and `iv30` are nullable because Barchart may omit them.
- `source` is persisted exactly as `'barchart'`.

Same-day overwrite rule:

- Before inserting a fresh row, delete any existing row for the same `underlying` whose `observed_at` falls on the same UTC calendar date as the new row.
- The fresh row becomes the only retained row for that underlying/date pair.

## Derived Set: Active Collection Targets

Purpose: Define the underlyings the batch collector should fetch on each run.

Source table:

- `positions`

Selection rule:

- `SELECT DISTINCT ticker FROM positions WHERE status != 'CLOSED'`

Normalization:

- Convert to uppercase in the collector before calling `fetchIVR`.
- Preserve deterministic batch order by sorting alphabetically in the service before iteration.

Exclusions:

- Positions with `status = 'CLOSED'`
- Duplicates caused by multiple open wheels on the same underlying

## Service Result: `CollectIVRSnapshotsResult`

Purpose: Report the batch outcome to scheduler callers and the manual Settings trigger.

| Field           | Type                      | Required | Notes                                                                                       |
| --------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `successCount`  | `number`                  | Yes      | Number of rows successfully inserted after overwrite handling.                              |
| `errorCount`    | `number`                  | Yes      | Number of tickers that produced parse/network/rate-limit/invalid-input failures.            |
| `skippedCount`  | `number`                  | Yes      | Number of tickers intentionally not persisted, including `not_available` outcomes.          |
| `skippedReason` | `'market_closed' \| null` | Yes      | `'market_closed'` when the entire batch exits early on a non-trading day; otherwise `null`. |

Counting rules:

- `ok` scraper result that is persisted: increments `successCount`
- `not_available`: increments `skippedCount`, logs at INFO, writes no row
- `parse_error`, `network_error`, `rate_limited`, `invalid_input`: increment `errorCount`, continue batch
- Weekend/holiday early exit before any fetch: `successCount = 0`, `errorCount = 0`, `skippedCount = 0`, `skippedReason = 'market_closed'`

## State/Workflow Model

`collectIVRSnapshots` is a main-process service with this control flow:

1. Ask `BrokerProvider.getMarketStatus()` whether today is a trading day.
2. If non-trading day, log INFO and return a skipped batch summary.
3. Query distinct active underlyings from SQLite.
4. Iterate sequentially with collector-owned 1-second spacing.
5. For each ticker:
   - call `fetchIVR`
   - persist the snapshot on `status: 'ok'`
   - skip row creation on `status: 'not_available'`
   - log and continue on recoverable failures
6. Return a batch summary for scheduler/manual callers.
