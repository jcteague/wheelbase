# Data Model: US-56 — Earnings-Proximity Alert

No new tables, no migrations. The story extends in-memory types only; persistence reuses the US-50 `alerts` table (`rule_code` is plain TEXT — `'EARNINGS_PROXIMITY'` is just a new value under the existing partial unique index).

## Extended entity: `AlertEvaluationInput` (`src/main/core/alerts.ts`)

Two new fields, following the existing "plain values, null = unavailable" convention:

| Field            | Type             | Source                                                    | Semantics                                                                                                                                                                                                                                                                                          |
| ---------------- | ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daysToEarnings` | `number \| null` | `computeDte(nextEarningsDate, now)` in the service        | Calendar days from `now` to the ticker's next earnings event. `null` when no earnings date is available (feed failure, missing key, or no event in the query window) → rule skips. Negative when the selected event is in the recent past (lookback) → predicate is false, resolving stale alerts. |
| `expiration`     | `string \| null` | `legs.expiration` (already selected by `EVALUABLE_QUERY`) | Raw `YYYY-MM-DD` expiration of the active leg, needed verbatim by the summary template. `null` never co-occurs with a non-null `dte` (both derive from the same column).                                                                                                                           |

### New helper-input slice

```typescript
/** Exactly the fields the EARNINGS_PROXIMITY (US-56) helpers read. */
export type EarningsProximityInput = Pick<
  AlertEvaluationInput,
  'daysToEarnings' | 'expiration' | 'dte'
>
```

## Extended union: `RuleCode`

```typescript
export type RuleCode =
  | 'EXPIRATION_IMMINENT'
  | 'MANAGEMENT_WINDOW'
  | 'PROFIT_TARGET'
  | 'STRIKE_PROXIMITY'
  | 'EARNINGS_PROXIMITY' // US-56
// (future: 'COVERED_CALL_BREACH')
```

## New rule definition (registry entry)

| Property      | Value                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `code`        | `EARNINGS_PROXIMITY`                                                                                      |
| `urgency`     | `medium`                                                                                                  |
| `missingData` | `dte === null` → `'missing_dte'`; else `daysToEarnings === null` → `'missing_earnings_date'`; else `null` |
| `test`        | `daysToEarnings >= 0 && daysToEarnings <= EARNINGS_PROXIMITY_MAX_DAYS && daysToEarnings <= dte`           |
| `summary`     | `Earnings in {daysToEarnings} days before your {expiration} expiration`                                   |
| `quickAction` | `Review position` (shared `QUICK_ACTION_REVIEW`)                                                          |

Constants: `EARNINGS_PROXIMITY_MAX_DAYS = 10`, skip reason `MISSING_EARNINGS_DATE = 'missing_earnings_date'`.

### Validation rules from acceptance criteria

| Scenario (today 2026-08-08 unless noted)       | daysToEarnings | dte  | Result                                                             |
| ---------------------------------------------- | -------------- | ---- | ------------------------------------------------------------------ |
| Earnings 08-14, expiration 08-21               | 6              | 13   | **Match** — `Earnings in 6 days before your 2026-08-21 expiration` |
| Earnings 08-21, expiration 08-27               | 13             | 19   | No match (`13 > 10`)                                               |
| Earnings 08-18, expiration 08-15 (today 08-10) | 8              | 5    | No match (`8 > 5`: earnings after expiration)                      |
| No earnings date                               | null           | any  | **Skip** `missing_earnings_date` + DEBUG log                       |
| Earnings today                                 | 0              | ≥ 0  | Match (boundary: `0 >= 0`)                                         |
| Earnings exactly 10 days out, expiration ≥ 10  | 10             | ≥ 10 | Match (boundary inclusive)                                         |
| Earnings on expiration day                     | n              | n    | Match ("on or before expiration")                                  |
| Earnings passed (lookback event)               | < 0            | any  | No match → open alert resolves                                     |

### State transitions

None new — the alert row lifecycle (open → open-refresh → resolved, keep-open on skip) is entirely inherited from US-50/53-55 persistence (`upsertOpenAlert`, `resolveAlertsNotIn`, skipped-keys keep-open set).

## New in-memory type: earnings feed result (`src/main/integrations/finnhub-earnings.ts`)

```typescript
/** Next (or most recent past, within lookback) earnings date per ticker.
 *  Tickers with no known event or a per-ticker fetch failure are absent. */
type EarningsDatesByTicker = Record<string, string> // ticker → 'YYYY-MM-DD'
```

Internal (not exported) cache entry, module-level:

```typescript
type CacheEntry = { date: string | null; fetchedAt: number } // null = fetched OK, no event in window
const EARNINGS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const EARNINGS_LOOKBACK_DAYS = 7
const EARNINGS_LOOKAHEAD_DAYS = 30
```

Event-selection rule per ticker: earliest event with `date >= today`; if none, the most recent past event in the window; if the window is empty, cache `null` (skip downstream, no refetch until TTL).

## Relationships

```
Finnhub /calendar/earnings ──(integration: fetchNextEarningsDates)──► EarningsDatesByTicker
                                                                          │ service boundary
positions ⋈ legs (EVALUABLE_QUERY) ──► EvaluableRow ─┬─ computeDte(expiration)      → dte
                                                     ├─ computeDte(earningsDate)    → daysToEarnings
                                                     └─ expiration (passthrough)    → expiration
                                                          │
                                              AlertEvaluationInput ──► evaluatePosition ──► alerts table
```
