# US-67 Data Model — Screening criteria

No migration. The criteria live in one row of the existing `app_settings` key/value table.

---

## Storage

| Table          | Key                  | Value                                                  |
| -------------- | -------------------- | ------------------------------------------------------ |
| `app_settings` | `screening_criteria` | JSON document of the `ScreeningCriteria` shape (below) |

Written with `appSettings.set` and read with `appSettings.get` (`src/main/services/app-settings.ts`), which stamps `updated_at` on write.

---

## Entity: `ScreeningCriteria`

Extends the existing type in `src/main/core/screener.ts:18` with one new field. Decimal quantities are strings (the codebase-wide `decimal.js` convention); counts and day windows are numbers.

| Field                | Type                  | Default     | Editable in sheet | Notes                                                     |
| -------------------- | --------------------- | ----------- | ----------------- | --------------------------------------------------------- |
| `deltaMin`           | `string`              | `'0.20'`    | yes               | Absolute delta                                            |
| `deltaMax`           | `string`              | `'0.30'`    | yes               | Absolute delta                                            |
| `dteMin`             | `number`              | `30`        | yes               | Calendar days, inclusive                                  |
| `dteMax`             | `number`              | `45`        | yes               | Calendar days, inclusive                                  |
| `minOpenInterest`    | `number`              | `500`       | yes               | Inclusive floor                                           |
| `maxSpreadPercent`   | `string`              | `'10'`      | yes               | Percent of mark                                           |
| `maxSpreadAbsolute`  | `string`              | `'0.10'`    | **no**            | Persisted, never edited — see the `maxSpreadAbsolute` ADR |
| `maxUnderlyingPrice` | `string \| null`      | `null`      | yes (Off/On)      | `null` = ceiling disabled                                 |
| `minIvRank`          | `string \| null`      | `null`      | yes (Off/On)      | **New in US-67.** `null` = floor disabled                 |
| `earningsHandling`   | `'exclude' \| 'flag'` | `'exclude'` | yes               | Persisted only; applied in US-70                          |

### New field: `minIvRank`

`ScreeningCriteria` gains `minIvRank: string | null` and `DEFAULT_SCREENING_CRITERIA` gains `minIvRank: null`. `ExclusionCode` gains `'iv_rank_floor'`.

A new `FILTERS` entry sits immediately after `price_ceiling`:

```
applies: criteria.minIvRank !== null && ctx.ivRank !== null
test:    new Decimal(ctx.ivRank.value).lt(criteria.minIvRank)
reason:  `IV rank ${ivRank.value} below ${minIvRank}`
```

`FilterContext` currently carries no IV rank — `FilterInput` gains `ivRank: IvRank | null`, and `judgeStrike` passes `input.ivRank` through alongside `underlyingPrice` and `earningsDate`.

An unknown IV rank passes the floor untouched (`applies` is false). Registry order after the change:

`price_ceiling → iv_rank_floor → earnings_in_window → dte_window → delta_unavailable → delta_band → open_interest → spread`

Order is load-bearing: `FilterFailure.index` is how far a strike got through the funnel, and `representativeExclusion` picks `excluded[0]` as a ticker's headline reason.

---

## Validation rules

Bounds, messages, and predicates live in `src/main/core/screening-criteria.ts` and are imported by the IPC schema, the persistence service, and the renderer form schema.

### Per-field

| Field                  | Rule                         | Message (pinned verbatim by e2e)          |
| ---------------------- | ---------------------------- | ----------------------------------------- |
| `deltaMin`, `deltaMax` | `0.01 ≤ v ≤ 0.99`            | `Delta must be between 0.01 and 0.99`     |
| `dteMin`, `dteMax`     | integer, `≥ 1`               | `DTE must be at least 1`                  |
| `dteMin`, `dteMax`     | integer, `≤ 365`             | `DTE must be at most 365`                 |
| `minOpenInterest`      | integer, `≥ 0`               | `Open interest floor cannot be negative`  |
| `maxSpreadPercent`     | `1 ≤ v ≤ 50`                 | `Max spread must be between 1% and 50%`   |
| `maxUnderlyingPrice`   | when non-null, `v > 0`       | `Price ceiling must be greater than zero` |
| `minIvRank`            | when non-null, `0 ≤ v ≤ 100` | `IV rank floor must be between 0 and 100` |
| `earningsHandling`     | `'exclude' \| 'flag'`        | (enum — no free-text message)             |

### Cross-field

| Rule                  | Error attaches to | Message                                         |
| --------------------- | ----------------- | ----------------------------------------------- |
| `deltaMin < deltaMax` | `deltaMax`        | `Minimum delta must be less than maximum delta` |
| `dteMin < dteMax`     | `dteMax`          | `Minimum DTE must be less than maximum DTE`     |

Strictly less-than, not `≤`: an inverted band is the AC, and a collapsed band (`0.20–0.20`) is a degenerate filter that would match on exact equality only.

Both cross-field failures disable `Save & re-screen` — the footer's primary action is gated on `formState.isValid`, so the same `mode: 'onChange'` resolver that renders the inline error also disables the button.

---

## Read path: defaults merge

`getScreeningCriteria(db)` never throws and never returns a partial object:

1. `appSettings.get(db, 'screening_criteria')` — `undefined` (never saved) ⇒ return `DEFAULT_SCREENING_CRITERIA`.
2. `JSON.parse` throws (corrupt row) ⇒ log `screening_criteria_unreadable` at WARN, return `DEFAULT_SCREENING_CRITERIA`.
3. Parse through a Zod schema whose every field carries `.default()` from `DEFAULT_SCREENING_CRITERIA`. A document written before `minIvRank` existed therefore reads back with `minIvRank: null` rather than `undefined`, so an added field is never a breaking change.
4. Zod parse fails on a present-but-invalid field ⇒ log WARN, return `DEFAULT_SCREENING_CRITERIA`.
5. Both bands re-checked with `isAscending` after a successful parse ⇒ on failure, log WARN and return `DEFAULT_SCREENING_CRITERIA`. Step 3's `.default()`s are applied per field independently, so a document holding one end of a band and missing the other parses cleanly into an inverted band the write path would have rejected — this step is what stops that reaching the engine.

Falling back wholesale rather than field-by-field keeps the returned object internally consistent — a half-defaulted band is not a band the trader ever chose.

`maxSpreadAbsolute` carries a bound check like every other field even though the sheet cannot edit it: a stored value reaches the engine's `Decimal` comparison unguarded.

---

## Write path

`saveScreeningCriteria(db, input)` takes `Omit<ScreeningCriteria, 'maxSpreadAbsolute'>`:

1. Re-validate every bound and both cross-field rules, throwing `ValidationError(field, code, message)` on the first failure so the IPC envelope carries the field name the form can bind to.
2. Compose the full document: `{ ...input, maxSpreadAbsolute: DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute }`.
3. `appSettings.set(db, 'screening_criteria', JSON.stringify(document))`.
4. Log `screening_criteria_saved` at INFO with the document.
5. Return `getScreeningCriteria(db)` — the persisted truth, read back, so the renderer can never display something that was not stored.

---

## State transitions

None. The criteria are a settings record with no lifecycle; every save is a full replacement of the document.
