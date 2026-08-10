# Data Model: US-66 — Display ranked screener results

US-66 is pure renderer work: **no new tables, no migrations, no main-process types.**
Everything below is the renderer-side model over the existing `screener:results`
payload (contract: `plans/us-65/contracts/screener-results.md`; preload mirror:
`src/preload/index.d.ts:396-451`).

## Entities (renderer types, `src/renderer/src/api/screener.ts`)

### ScreenerCandidate

Field-for-field mirror of `IpcScoredCandidate`. All money/ratio fields are strings
(decimal.js output), never parsed for arithmetic in the renderer — only formatted.

| Field                  | Type                                            | Notes                                         |
| ---------------------- | ----------------------------------------------- | --------------------------------------------- |
| `ticker`               | `string`                                        | upper-case underlying                         |
| `contractId`           | `string`                                        | OCC symbol                                    |
| `strike`               | `string`                                        | 4dp                                           |
| `expiration`           | `string`                                        | `YYYY-MM-DD`                                  |
| `dte`                  | `number`                                        | calendar days                                 |
| `bid` / `ask` / `mark` | `string`                                        | 2dp                                           |
| `spreadAbsolute`       | `string`                                        | 2dp                                           |
| `spreadPercent`        | `string`                                        | 2dp                                           |
| `delta`                | `string`                                        | 4dp, **absolute** (engine absolutizes)        |
| `openInterest`         | `number \| null`                                | null → `—`                                    |
| `volume`               | `number \| null`                                | not displayed in US-66                        |
| `ivRank`               | `{ value: string; observedAt: string } \| null` | null → `n/a`                                  |
| `capitalSecured`       | `string`                                        | 2dp; not displayed in US-66                   |
| `periodYield`          | `string`                                        | 4dp fraction                                  |
| `annualizedYield`      | `string`                                        | 4dp fraction                                  |
| `yieldPerDelta`        | `string`                                        | 4dp — the rank score                          |
| `earningsFlagged`      | `boolean`                                       | carried on the type, **not rendered** (US-70) |
| `timestamp`            | `string`                                        | ISO quote time                                |

### ScreenerExclusion

| Field    | Type                                                                                                                                                                | Notes                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `ticker` | `string`                                                                                                                                                            |                                                       |
| `code`   | union of `price_ceiling \| earnings_in_window \| dte_window \| delta_unavailable \| delta_band \| open_interest \| spread \| no_options_listed \| data_unavailable` | not branched on in US-66; reserved for future styling |
| `reason` | `string`                                                                                                                                                            | **rendered verbatim** — the engine owns the wording   |

### ScreenerResults

| Field            | Type                             | Notes                                                   |
| ---------------- | -------------------------------- | ------------------------------------------------------- |
| `status`         | `'ok' \| 'provider_unavailable'` | selects the body state                                  |
| `ranked`         | `ScreenerCandidate[]`            | already in rank order — the renderer **never re-sorts** |
| `excluded`       | `ScreenerExclusion[]`            | watchlist order; empty on outage                        |
| `quoteTimestamp` | `string \| null`                 | newest ranked quote time; feeds the stale caption       |

## Validation rules (from acceptance criteria)

- Rank position = array index + 1 of `ranked` — no renderer sorting or score math.
- Every ranked row must show: rank, ticker, strike, expiration, DTE, mark, period
  yield, annualized yield, delta, IV rank, open interest, spread.
- `ivRank === null` renders the literal `n/a` — never an empty cell (AC 3).
- Excluded rows show ticker + verbatim `reason`, and **no rank badge** (AC 4).
- `status === 'provider_unavailable'` and (`status === 'ok'` && `ranked` empty) must
  produce visually distinct states — error tone vs neutral tone (AC 5).
- Market display `CLOSED` + ranked results ⇒ stale-snapshot badge + quote time from
  `quoteTimestamp` (AC 6).

## Display derivations (pure, `src/renderer/src/lib/screener-format.ts`)

| Column        | Source field(s)                   | Formatter                                                      | Example in → out                           |
| ------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| #             | index in `ranked`                 | `index + 1` in gold badge                                      | `0` → `1`                                  |
| Ticker        | `ticker`                          | as-is, gold mono                                               | `AAPL`                                     |
| Strike        | `strike`                          | `fmtMoney` (existing, drops to 2dp)                            | `180.0000` → `$180.00`                     |
| Exp           | `expiration`                      | `fmtDate` (existing)                                           | `2026-09-15` → `Sep 15`                    |
| DTE           | `dte`                             | `` `${dte}d` ``                                                | `37` → `37d`                               |
| Mark          | `mark`                            | `fmtMoney`                                                     | `2.70` → `$2.70`                           |
| Yield         | `periodYield`                     | `fmtYieldPercent` — ×100, ≤2dp, trailing zeros trimmed         | `0.0150` → `1.5%`; `0.0158` → `1.58%`      |
| Ann.          | `annualizedYield`                 | `fmtYieldPercent` + `/yr`                                      | `0.1480` → `14.8%/yr`                      |
| Δ             | `delta`                           | `fmtDelta` — fixed 2dp                                         | `0.2800` → `0.28`                          |
| IVR           | `ivRank`                          | `fmtIvr` — trim zeros; null → `n/a`                            | `{ value: '44.0' }` → `44`; `null` → `n/a` |
| OI            | `openInterest`                    | `fmtOpenInterest` — en-US grouping; null → `—`                 | `4200` → `4,200`                           |
| Spread        | `spreadAbsolute`, `spreadPercent` | `fmtSpread` — `$abs (int%)` via `fmtMoney` + existing `fmtPct` | `0.06`, `2.22` → `$0.06 (2%)`              |
| (row attr)    | `yieldPerDelta`                   | `fmtScore` — fixed 2dp, into `data-yield-per-delta`            | `0.5286` → `0.53`                          |
| Stale caption | `quoteTimestamp`                  | `fmtQuoteTime` — local `HH:mm:ss`                              | `…T16:00:02-04:00` → `16:00:02`            |

## Page state machine (`ScreenerPage`)

```
useScreenerResults()
├─ isLoading                        → LoadingState ("Screening watchlist…")
├─ isError (envelope internal_error)→ ErrorAlert (existing component)
└─ data
   ├─ status 'provider_unavailable' → OUTAGE card (error tone, "Retry refresh" → refetch())
   └─ status 'ok'
      ├─ ranked.length > 0          → RANKED table + ScoreLegend
      │                               + stale badge/caption iff display === 'CLOSED'
      └─ ranked.length === 0        → EMPTY card (neutral tone)
      └─ excluded.length > 0        → ExcludedSection (collapsed) under either 'ok' branch
```

Excluded-section open/closed is local `useState` (default collapsed) — not form
state, so React Hook Form does not apply. No other client state exists.
