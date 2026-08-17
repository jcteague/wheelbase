# Data Model: US-68 — Promote a screener result to the new wheel form

US-68 persists **nothing new**. No table, no migration, no service change. The recorded
trade goes through the existing `positions:create` path with whatever the trader
confirms in the form (SQLite stays the source of truth; the screener snapshot is never
written anywhere).

The story's data shapes are all renderer-side and transient.

## PromotedCandidate (renderer type, `src/renderer/src/lib/promote.ts`)

The one-shot payload carried from the screener row to the new-wheel form.

| Field        | Type                  | Source                                                         | Notes                                                         |
| ------------ | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `ticker`     | `string`              | `ScreenerCandidate.ticker`                                     | uppercase, validated by `tickerSchema` shape                  |
| `strike`     | `string`              | `ScreenerCandidate.strike` normalized via `Decimal#toString()` | `'180.0000'` → `'180'` — the AC's displayed value             |
| `expiration` | `string`              | `ScreenerCandidate.expiration`                                 | `YYYY-MM-DD`                                                  |
| `premium`    | `string`              | `ScreenerCandidate.mark`                                       | 2dp, verbatim (`'2.70'`) — editable default, never locked     |
| `quotedAt`   | `string`              | `ScreenerCandidate.timestamp`                                  | ISO instant; shown via `fmtQuoteTime` in the provenance strip |
| `thesis`     | `string \| undefined` | watchlist `notes` for the ticker, when present                 | ≤ 500 chars (watchlist schema); omitted when absent           |

Validation: a Zod schema inside `lib/promote.ts` (`ticker` non-empty; `strike` /
`premium` positive decimal strings; `expiration` ISO date; `quotedAt` parseable ISO).
`parsePromotedParams` returns `null` on any failure → the page falls back to the plain
form (existing `?ticker=` behavior preserved).

### Query-string encoding

See `contracts/promote-navigation.md` for the canonical param table.

## Mapping onto `newWheelSchema` defaults

`NewWheelForm` (promoted mode) builds `useForm` `defaultValues` as:

| Form field           | Promoted default                  |
| -------------------- | --------------------------------- |
| `ticker`             | `promoted.ticker`                 |
| `strike`             | `promoted.strike`                 |
| `expiration`         | `promoted.expiration`             |
| `contracts`          | `'1'` (AC: defaults to 1)         |
| `premiumPerContract` | `promoted.premium`                |
| `fillDate`           | `undefined` — left for the trader |
| `thesis`             | `promoted.thesis` or `undefined`  |
| `notes`              | `undefined`                       |

Every field remains editable; submission goes through the unchanged
`useCreatePosition` mutation with the form's **current** values.

## FreshQuote (hook result, `usePromotedQuote`)

| Field       | Type     | Source                                           |
| ----------- | -------- | ------------------------------------------------ |
| `mark`      | `string` | `OptionSnapshot.mid` for the promoted OCC symbol |
| `timestamp` | `string` | `OptionSnapshot.timestamp`                       |

Hook status collapses to three cases the banner derivation consumes:
`pending` (no banner yet), `fresh: FreshQuote` (success), `failed` (query rejected
**or** `unavailable: true` **or** symbol missing from the snapshot map).

## Banner state machine (`derivePromoteBanner`)

Pure function; exactly one state, first match wins:

| Order | State     | Trigger                                                          | Tone (AlertBox variant) |
| ----- | --------- | ---------------------------------------------------------------- | ----------------------- |
| 1     | `offline` | fresh-quote fetch failed                                         | `warning` (gold)        |
| 2     | `stale`   | market display is `CLOSED` or `EXT`                              | `warning` (gold)        |
| 3     | `moved`   | `markMovedMaterially(promoted.premium, fresh.mark)`              | `warning` (gold)        |
| 4     | `edited`  | current premium field value ≠ promoted premium (numeric compare) | `success` (green)       |
| 5     | `match`   | fetch succeeded, no material move, unedited                      | `success` (green)       |
| —     | `none`    | fetch still pending (and market open, unedited)                  | no banner               |

`markMovedMaterially(promoted, fresh)`:
`Decimal(fresh).minus(promoted).abs() > Decimal.max('0.05', Decimal(promoted).times('0.05'))`
— strict inequality; both the $0.05 tick-noise floor and the 5% relative test must be
exceeded (the max of the two).

No banner state ever disables submit.

## Derived display values (promoted mode only, via `useWatch`)

| Value            | Formula                                         | Format                                          |
| ---------------- | ----------------------------------------------- | ----------------------------------------------- |
| Capital required | `strike × 100 × contracts`                      | `$18,000` — `en-US` grouping, 0 fraction digits |
| Period yield     | `premium ÷ strike`                              | `fmtYieldPercent` (`1.47%`)                     |
| Annualized yield | `period × 365 ÷ DTE` (`computeDte(expiration)`) | `fmtYieldPercent` + `/yr` (`14.5%/yr`)          |
| DTE hint         | `computeDte(expiration)`                        | `37 DTE` under the expiration field             |

All money math through `decimal.js`; recomputed live as the trader edits (the mockup's
`edited` state: premium 2.65 → `1.47% period · 14.5%/yr`, capital unchanged $18,000).
When strike/contracts/premium/expiration don't parse, the affected value renders `—`.

## State transitions

None. No wheel phase, leg, or lifecycle change — promote only navigates and pre-fills.
Position creation on submit follows US-1's existing `CSP_OPEN` entry unchanged.
