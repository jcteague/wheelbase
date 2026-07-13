# Data Model — US-62: Covered-call breach alert

No new tables, columns, or migrations. This story adds one rule to the pure
engine and reuses the existing `alerts` table and `AlertEvaluationInput`.

## Entities touched (existing)

### `RuleCode` (union in `src/main/core/alerts.ts`)

Add the reserved member:

```ts
export type RuleCode =
  | 'EXPIRATION_IMMINENT'
  | 'MANAGEMENT_WINDOW'
  | 'PROFIT_TARGET'
  | 'STRIKE_PROXIMITY'
  | 'EARNINGS_PROXIMITY'
  | 'COVERED_CALL_BREACH' // US-62
```

### `CoveredCallBreachInput` (new narrow slice, `src/main/core/alerts.ts`)

```ts
/** Exactly the fields the COVERED_CALL_BREACH (US-62) helpers read. */
export type CoveredCallBreachInput = Pick<AlertEvaluationInput, 'strike' | 'currentUnderlyingPrice'>
```

`AlertEvaluationInput` is **unchanged** — `strike` and `currentUnderlyingPrice`
already exist and are populated for every phase by the service.

### `alerts` table (existing, unchanged)

`rule_code` is `TEXT NOT NULL` with no CHECK constraint; the partial-unique
index `(position_id, rule_code) WHERE status = 'open'` guarantees at most one
open `COVERED_CALL_BREACH` per position. New code value flows through with no
schema change.

## Rule definition

| Property      | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `code`        | `COVERED_CALL_BREACH`                                                                              |
| `urgency`     | `medium`                                                                                           |
| Applies to    | `CC_OPEN` only                                                                                     |
| `test`        | `phase === 'CC_OPEN' && strike !== null && currentUnderlyingPrice !== null && price ≥ strike`      |
| `missingData` | `phase === 'CC_OPEN' && currentUnderlyingPrice === null → 'missing_underlying_price'`, else `null` |
| Percent-above | `(price − strike) / strike × 100` (via existing `proximityPercent`)                                |
| Summary       | `Stock is {pct}% above the ${strike} call strike — shares may be called away`                      |
| `quickAction` | `Review position` (`QUICK_ACTION_REVIEW`)                                                          |

`{pct}` is `proximityPercent(...).toFixed(1)`; `${strike}` is
`formatStrike(strike)` (`$` + 2dp).

## Worked examples (from ACs)

| Ticker | Phase            | Strike | Price  | Result                                                                                                                   |
| ------ | ---------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| MSFT   | `CC_OPEN`        | 420.00 | 427.40 | **Fires**, medium: "Stock is 1.8% above the $420.00 call strike — shares may be called away" (7.40/420 = 1.7619% → 1.8%) |
| MSFT   | `CC_OPEN`        | 420.00 | 416.00 | No match                                                                                                                 |
| MSFT   | `CC_OPEN`        | 420.00 | 420.00 | **Fires** at 0.0% (`price ≥ strike` boundary)                                                                            |
| AAPL   | `CSP_OPEN`       | 180.00 | 185.00 | No match, no skip (rule is CC-only)                                                                                      |
| TSLA   | `HOLDING_SHARES` | —      | —      | Not evaluated (excluded by `EVALUABLE_QUERY` phase filter + active-leg join)                                             |
| MSFT   | `CC_OPEN`        | 420.00 | null   | Skipped with `missing_underlying_price` (existing open alert kept open)                                                  |

## Resolution / state transitions

Handled by the existing service mechanism — no new code:

- **Fires → open:** first evaluation with `price ≥ strike` → `upsertOpenAlert`
  inserts an open `COVERED_CALL_BREACH` row.
- **Open → resolved:** later evaluation with `price < strike` produces no match
  and no skip, so the (position, `COVERED_CALL_BREACH`) key is absent from
  `keepOpenKeys` and `resolveAlertsNotIn` marks it resolved.
- **Skip keeps open:** later evaluation with a missing price adds the key to
  `skippedKeys` → kept open, not resolved.
