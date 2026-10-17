# US-107 — Data model and type design

Requirements: [OPT-15](https://linear.app/optionswheel/issue/OPT-15). Decisions:
[research.md](./research.md). Builds on US-106's planned names (research § Starting point).

No migration, table or settings field. One response field is added to `alerts:list`
(see [contracts/alerts-list.md](./contracts/alerts-list.md)).

## Entities touched

| Entity                 | Change                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AlertEvaluationInput` | `+ leapsDte: number \| null`, `+ leapsStrike: string \| null`. `dte`/`strike`/`expiration`/`instrumentType` stay short-leg. |
| `RuleDefinition`       | `+ leg: RuleLeg` (required).                                                                                                |
| `RuleCode`             | `+ 'PMCC_LEAPS_ROLL_WINDOW'`.                                                                                               |
| `EvaluableRow`         | `+ leaps_strike: string \| null`, `+ leaps_expiration: string \| null`. Short-leg columns may all be null for a PMCC.       |
| `ManagementQueueItem`  | `+ ruleCode: RuleCode`.                                                                                                     |
| `alerts` table         | Unchanged; `rule_code` is TEXT.                                                                                             |

## Rule: PMCC_LEAPS_ROLL_WINDOW

| Property | Value                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------- |
| leg      | `leaps`, present iff `phase === 'PMCC_OPEN'`                                                          |
| urgency  | `medium`                                                                                              |
| constant | `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60`                                                                 |
| missing  | `leapsDte === null` → `missing_leaps_dte`; `leapsStrike` not numeric → `missing_strike`               |
| test     | `leapsDte >= 0 && leapsDte <= 60`                                                                     |
| summary  | `LEAPS expires ${inDays(leapsDte)} at ${formatStrike(leapsStrike)} strike — review for roll or close` |
| action   | `Review position` (registry default)                                                                  |

The `missing_strike` guard exists so `formatStrike` never renders a fake `$0.00` from a
null strike. In practice a LEAPS leg always has a strike.

### Applicability (evaluated before skips and matches)

| Position state                     | short-leg rules        | LEAPS rule                      |
| ---------------------------------- | ---------------------- | ------------------------------- |
| Wheel, CSP_OPEN / CC_OPEN          | apply (unchanged)      | inapplicable: no match, no skip |
| PMCC, LEAPS + short open           | apply to short only    | applies to LEAPS                |
| PMCC, LEAPS only                   | inapplicable           | applies                         |
| PMCC, LEAPS expiration unreadable  | apply to short if open | skips `missing_leaps_dte`       |
| PMCC, no LEAPS / position inactive | not evaluated          | not evaluated                   |

Inapplicable rules contribute no key, so their prior alerts resolve (the S4 expired short's
EXPIRATION_IMMINENT). Skipped rules contribute a keep-open key (S7).

### Worked examples (issue calendar, LEAPS 2027-09-17 @ $80, short 2027-08-20 @ $112)

| valuation                              | leapsDte | short dte | LEAPS rule                   | short-leg rows                             |
| -------------------------------------- | -------- | --------- | ---------------------------- | ------------------------------------------ |
| 2027-07-09                             | 70       | 42        | —                            | none (42 > 21)                             |
| 2027-07-18                             | 61       | 33        | —                            | none                                       |
| 2027-07-19                             | 60       | 32        | MED "…in 60 days at $80.00…" | none                                       |
| 2027-07-20                             | 59       | 31        | MED "…in 59 days…"           | none                                       |
| 2027-08-18                             | 30       | 2         | MED "…in 30 days…"           | HIGH "Expires in 2 days at $112.00 strike" |
| 2027-09-15                             | 2        | (expired) | MED "…in 2 days…"            | inapplicable → stale rows resolve          |
| 2027-07-20, rolled to 2028-01-21 @ $85 | 185      | 31        | — (resolves)                 | none                                       |

## Selection (service)

1. Wheel rows: existing `EVALUABLE_QUERY` + `NULL AS leaps_strike, NULL AS leaps_expiration`.
2. PMCC candidates (US-106 query, ACTIVE + `PMCC_OPEN`); bulk legs via `readLegsByPosition`.
3. Per candidate, in its own try/catch: `pmccOpenLegs(legs)`.
   - `null` → skip the candidate (no LEAPS; not evaluable).
   - `{ long, short }` → `EvaluableRow` with short columns from `short ?? null-fields`,
     `instrument_type: short ? 'CALL' : null`, `leaps_strike: long.strike`,
     `leaps_expiration: long.expiration`.
   - throw → US-106 failed-id path (log `alert_evaluation_failed`, keep existing keys).
4. `occSymbolForRow` already returns `null` for a null instrument type, so a LEAPS-only
   PMCC requests no option snapshot. The LEAPS OCC is never built.

## Lifecycle (all existing US-50/US-59 behaviour)

| Event                        | Result                                               |
| ---------------------------- | ---------------------------------------------------- |
| First evaluation at ≤ 60 DTE | Insert open MED row.                                 |
| Next day, still in window    | Update summary in place; same id and `triggered_at`. |
| Dismissed, still in window   | Stays dismissed; summary not reopened.               |
| LEAPS rolled to > 60 DTE     | No match → resolve; no new row.                      |
| LEAPS expiration unreadable  | Skip → key kept → row unchanged (previous summary).  |
| Position closed              | Not evaluated → resolve.                             |

## Type Design

Applied `/typescript-advanced-types`. Two small constructs earn their place; everything
else is a plain field addition.

| Type                            | File                                   | Construct                                                                        | What it buys                                                                                                                                                                 |
| ------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RuleCode`                      | `src/main/core/alerts.ts`              | String-literal union member `'PMCC_LEAPS_ROLL_WINDOW'`                           | Registry, persisted codes and the queue item stay checked against one list.                                                                                                  |
| `RuleLeg`                       | `src/main/core/alerts.ts`              | `type RuleLeg = 'short' \| 'leaps'`; required `leg: RuleLeg` on `RuleDefinition` | Every rule must say which leg it reads; forgetting is a compile error, which is the guard against the LEAPS-only hazard reappearing on the next rule.                        |
| `LEG_PRESENT`                   | `src/main/core/alerts.ts`              | `Record<RuleLeg, (input: AlertEvaluationInput) => boolean>`                      | Exhaustive: adding a leg kind without a presence test fails to compile.                                                                                                      |
| `PmccLeapsRollWindowInput`      | `src/main/core/alerts.ts`              | `Pick<AlertEvaluationInput, 'leapsDte' \| 'leapsStrike'>`                        | The summary helper takes exactly the slice it reads (project convention, like `EarningsProximityInput`); can't drift from the engine input.                                  |
| `AlertEvaluationInput`          | `src/main/core/alerts.ts`              | Two plain nullable fields                                                        | Plain types. A nested `short: {...} \| null` object would make "short absent" unrepresentable-with-fields, but would rewrite every rule and fixture; out of proportion here. |
| `EvaluableRow`                  | `src/main/services/evaluate-alerts.ts` | Two plain nullable columns                                                       | Plain types — no advanced constructs needed.                                                                                                                                 |
| `ManagementQueueItem`           | `src/main/schemas.ts`                  | `ruleCode: RuleCode` (imported type from core)                                   | Renderer branches on the same union the engine emits; no string compare against an unchecked literal.                                                                        |
| `ManagementQueueItem` (preload) | `src/preload/index.d.ts`               | Hand-copied global interface gains `ruleCode: string`                            | The preload d.ts is a duplicate today (it cannot import main types). Match that existing pattern and note the duplication; don't widen scope to fix it.                      |

Renderer label map, in `ManagementQueueRow.tsx`:

```ts
const PMCC_LEG_LABEL = { short: 'PMCC · short call', leaps: 'PMCC · LEAPS' } as const
const pmccBadgeLabel = (ruleCode: string): string =>
  PMCC_LEG_LABEL[ruleCode === 'PMCC_LEAPS_ROLL_WINDOW' ? 'leaps' : 'short']
```

Plain types; the rule→leg decision mirrors `RULES` but the renderer cannot import core.
One literal compare is enough.
