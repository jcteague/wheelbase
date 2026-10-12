# Data Model: US-105 — Roll the PMCC LEAPS

## 1. Entities

### `legs` (existing table, no migration)

A LEAPS roll appends two rows sharing one fresh `roll_chain_id`. The directions are the **inverse**
of the wheel's and of US-104's roll: the close is a SELL, the open is a BUY. `fees` is written as
`'0.0000'`.

| Row           | `leg_role`  | `action` | `instrument_type` | `strike`          | `expiration`    | `contracts`  | `premium_per_contract` = `fill_price` | `fill_date`                | `roll_chain_id` |
| ------------- | ----------- | -------- | ----------------- | ----------------- | --------------- | ------------ | ------------------------------------- | -------------------------- | --------------- |
| sell-to-close | `ROLL_FROM` | `SELL`   | `CALL`            | open LEAPS strike | open LEAPS exp. | open LEAPS's | `proceedsPerContract` (4 dp)          | `fillDate` (default today) | new UUID        |
| buy-to-open   | `ROLL_TO`   | `BUY`    | `CALL`            | `newStrike`       | `newExpiration` | open LEAPS's | `replacementDebitPerContract` (4 dp)  | same                       | same            |

US-103's `groupRollChains` reads the pair as one chain with `netCreditPerShare = Σ SELL − Σ BUY`
(`26.00 − 23.50 = +2.5000`); `buildPmccContributions` classifies it `LONG` because
`rollFrom.action === 'SELL'`, contributing `−2.5000` per share to the LEAPS cost; `newestLongBuy`
picks the `ROLL_TO` as the current LEAPS, so `effectiveShareCost` re-anchors to `85 + 19.30`.

### `cost_basis_snapshots` (existing table, no migration)

Written **only** by US-103's `appendPmccSnapshot`, inside this service's transaction:

| Column                    | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `basis_per_share`         | `ledger.basisPerShare` after the roll (`19.3000` in the AC)        |
| `total_premium_collected` | `ledger.shortCreditsTotal` (`320.0000`, unchanged by a LEAPS roll) |
| `final_pnl`               | `NULL`                                                             |
| `trigger_event`           | `'PMCC_LEAPS_ROLL'` (already in US-103's `PmccTriggerEvent`)       |
| `snapshot_at`             | `makeSnapshotAt(fillDate)`                                         |

### `positions` (existing table)

Untouched. `phase` stays `PMCC_OPEN`; `updated_at` is not bumped (parity with `rollCcPosition` and
US-104). The open short call, if any, is untouched.

### `PmccOpenLegs` (US-104, in-memory, carried on `positions:get`)

Consumed as-is: `long` is the open LEAPS (after this roll, the `ROLL_TO`); `short` is the open short or
`null`. `null` at the top level means "no LEAPS" → the service's `no_active_leg`.

### `RollPmccLeapsInput` (engine input) and the rule table

See research.md § ADR "`rollPmccLeaps`". Seven rules, fixed order, first failure throws; rules 5–6
skipped when `openShort` is null.

### `RollPmccLeapsResult` (service result, IPC success body)

| Field               | Type                                                                            | Source                                                               |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `position`          | `{ id; ticker; phase: 'PMCC_OPEN'; status: 'ACTIVE' }`                          | detail                                                               |
| `rollFromLeg`       | `LegRecord & { legRole: 'ROLL_FROM'; action: 'SELL' }`                          | inserted row                                                         |
| `rollToLeg`         | `LegRecord & { legRole: 'ROLL_TO'; action: 'BUY' }`                             | inserted row                                                         |
| `rollChainId`       | `string`                                                                        | new UUID                                                             |
| `costBasisSnapshot` | `CostBasisSnapshotRecord & { triggerEvent: 'PMCC_LEAPS_ROLL'; finalPnl: null }` | `appendPmccSnapshot(...).snapshot`                                   |
| `ledger`            | `PmccLedgerResult`                                                              | `appendPmccSnapshot(...).ledger`                                     |
| `leapsRollNumber`   | `number` (≥ 1)                                                                  | long-side chains (`rollFrom.action === 'SELL'`) in `detail.legs` + 1 |

## 2. Validation rules from the acceptance criteria

| AC                                                              | Where the rule lives                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form shows LEAPS, short as read-only coverage, basis, eff. cost | `pmccOpenLegs` + `pmccLedger` (`basisPerShare`, `leapsCostPerShare`, `effectiveShareCost`) on `positions:get`; renderer formats only                          |
| Net credit / debit preview, label, 196 DTE                      | renderer `pmccRollNet({ received, paid })`, `pmccRollLabel(current, next, 'MMM yyyy')`; `computeDteFromInput`                                                 |
| Cost basis after / effective share cost after, "up from"        | renderer `pmccPostRollEffectiveCost({ basisPerShare, leapsStrike: newStrike, net })`; delta vs `pmccLedger.effectiveShareCost`                                |
| Confirm enabled on a debit                                      | the form schema has no "must be a credit" rule; `isValid` is true                                                                                             |
| Linked pair + one net line, basis $19.30, LEAPS cost $22.50     | service transaction; `appendPmccSnapshot('PMCC_LEAPS_ROLL')`; chain nets by action and the long side re-anchors in US-103                                     |
| Warning: effective cost after roll above the open short strike  | renderer `pmccStrikeShortfall(openShort.strike, effectiveAfter)`; `AlertBox warning`; never disables confirm                                                  |
| Reject replacement strike ≥ open short strike                   | `shortStrikeAboveLeaps` + `leapsStrikeNotBelowShortMessage` — in the form schema (path `newStrike`) **and** engine rule 6; both skipped with no short         |
| Reject replacement expiration ≤ open short expiration (US-102)  | `shortExpiresBeforeLeaps(short, replacement)` + `LONG_NOT_AFTER_SHORT` — form schema (path `newExpiration`) **and** engine rule 5; both skipped with no short |
| Allow a replacement earlier than the current LEAPS, with a note | **no** on-or-after-current rule anywhere; renderer `leapsCoverageChange` drives the `AlertBox info`                                                           |
| Reject no change                                                | form schema (path `__roll__`) **and** engine rule 7                                                                                                           |
| Reject $0.00 proceeds / replacement debit                       | form schema (`proceeds`, `newDebit`) **and** engine rules 2–3 (field-level messages)                                                                          |
| Roll while no short call is open                                | `openShort: null` skips rules 5–6; the sheet shows `No short call open …`; `Roll LEAPS →` is offered whenever `pmccOpenLegs` is non-null                      |
| Classic wheel unaffected                                        | no shared component or service change beyond the generalizations named in research.md; `rollCc` / `RollCcSheet` / `rolls.ts` untouched                        |

## 3. State transitions

None. `rollPmccLeaps` returns `{ phase: 'PMCC_OPEN' }` and the service does not update the position
row.

## 4. Type Design

Reviewed with `/typescript-advanced-types`. Plain types wherever a plain type encodes the rule.

| Type / value                                                                    | File                                                    | Construct                                                                                                                                                                       | What it buys                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LONG_NOT_AFTER_SHORT`                                                          | `src/main/core/pmcc-rules.ts`                           | `{ code: 'long_not_after_short', message } as const satisfies Pick<PmccIssue, 'code' \| 'message'>`                                                                             | **Derivation**: one literal object is the inverse message's single home; the engine and the renderer schema spread it, so US-102's text cannot drift.                                      |
| `shortStrikeAboveLeaps(short, long): boolean`                                   | `src/main/core/pmcc-rules.ts`                           | Plain predicate                                                                                                                                                                 | Plain — one `Decimal` comparison used by `pmccCrossLegIssues` (entry side) and `rollPmccLeaps` (roll side) with swapped arguments.                                                         |
| `STRIKE_NOT_BELOW_SHORT_CODE` / `leapsStrikeNotBelowShortMessage(shortStrike)`  | `src/main/core/pmcc-rules.ts`                           | `const` literal + plain pure formatter                                                                                                                                          | **Derivation**: the engine rule and the form schema format `($112.00)` through one function.                                                                                               |
| `RollPmccLeapsInput`                                                            | `src/main/core/lifecycle.ts`                            | Plain interface; `openShort: { strike; expiration } \| null`; `currentLeaps` non-nullable                                                                                       | Plain — `null` short is the "nothing to cover" state that skips two rules; the LEAPS is required by type, so "has an open LEAPS" is not a runtime rule in the engine.                      |
| `RollPmccLeapsResult` (engine)                                                  | `src/main/core/lifecycle.ts`                            | `{ phase: 'PMCC_OPEN' }` literal                                                                                                                                                | Plain — matches `RollPmccShortCallResult`.                                                                                                                                                 |
| `RollPayloadBaseSchema` (unchanged) / `RollPmccLeapsPayloadSchema`              | `src/main/schemas.ts`                                   | New `z.object` with `proceedsPerContract`, `replacementDebitPerContract`; `RollPmccLeapsPayload = z.infer<…>`                                                                   | Plain — the wire names say what the money is; `z.infer` keeps the TS type derived.                                                                                                         |
| `RollResultBase<From extends LegAction = 'BUY', To extends LegAction = 'SELL'>` | `src/main/schemas.ts`                                   | Generic interface with defaults: `rollFromLeg: LegRecord & { legRole: 'ROLL_FROM'; action: From }`, `rollToLeg: … action: To`                                                   | **Derivation**: the inverted pair is derived from the shipped shape instead of hand-copied; `RollCspResult`, `RollCcResult`, `RollPmccShortCallResult` compile unchanged via the defaults. |
| `RollPmccLeapsResult` (service)                                                 | `src/main/schemas.ts`                                   | `extends RollResultBase<'SELL', 'BUY'>` with `position.phase: 'PMCC_OPEN'`, `costBasisSnapshot` narrowed to `triggerEvent: 'PMCC_LEAPS_ROLL'`, plus `ledger`, `leapsRollNumber` | **Narrowing**: a consumer that switches on `triggerEvent` or `rollFromLeg.action` needs no cast.                                                                                           |
| `RollPmccLeapsPayload` / `RollPmccLeapsResponse` (renderer)                     | `src/renderer/src/api/positions.ts`                     | `IpcPayload<'rollPmccLeaps'>` / `IpcSuccess<'rollPmccLeaps'>`                                                                                                                   | **Derivation**: the renderer types are the preload's wire types (US-101 pattern); no adapter mapping.                                                                                      |
| `RollPmccLeapsFormValues`                                                       | `src/renderer/src/schemas/roll-pmcc-leaps.ts`           | `z.infer` of the object schema (`proceeds`, `newStrike`, `newDebit`, `newExpiration`, `fillDate`, `__roll__?: string`)                                                          | **Removes a cast**: the never-rendered `__roll__` key types `errors.__roll__` / `setError('__roll__')`, as `__pair__` does in `pmcc-entry.ts`.                                             |
| `RollPmccLeapsContext`                                                          | `src/renderer/src/schemas/roll-pmcc-leaps.ts`           | `{ currentStrike: string; currentExpiration: string; openShort: { strike: string; expiration: string } \| null }`                                                               | Plain — the facts the schema factory, the ruler and the label helper read; `null` short switches off two refinements.                                                                      |
| `PmccRollCash`                                                                  | `src/renderer/src/lib/pmcc-roll.ts`                     | `{ received: string; paid: string; contracts: number }` (US-104's `{ premium, costToClose }` renamed)                                                                           | Plain — direction-neutral names let one helper serve both rolls.                                                                                                                           |
| `RollLabelMonthFormat`                                                          | `src/renderer/src/lib/pmcc-roll.ts`                     | `'MMM' \| 'MMM yyyy'` literal union, default `'MMM'`                                                                                                                            | Plain — the only two `date-fns` formats the two labels use; a free string would admit typos.                                                                                               |
| `PmccRulerMark`                                                                 | `src/renderer/src/components/PmccCoverageRuler.tsx`     | `{ key: string; date: string \| null; label: string; value: string; tone: 'muted' \| 'secondary' \| 'green' \| 'accent' }`                                                      | Plain — the consolidated mockup's `marks[]`; `date: null` renders the legend row without a tick (`Open short call · none`).                                                                |
| `PmccRollRecorded`                                                              | `src/renderer/src/pages/usePositionDetailSheets.ts`     | `{ kind: 'short'; result: RollPmccShortCallResponse } \| { kind: 'leaps'; result: RollPmccLeapsResponse } \| null`                                                              | **Illegal state unrepresentable**: one banner slot, so two roll confirmations can never show at once; the page switches on `kind` without a cast.                                          |
| `PositionDetailActionsProps`                                                    | `src/renderer/src/components/PositionDetailActions.tsx` | adds `hasOpenLeaps: boolean; onRollPmccLeaps: () => void`                                                                                                                       | Plain — a boolean the page already derives; US-118 replaces this component.                                                                                                                |

No new Zod enum, no new `LegRole` or `TriggerEvent` value (US-103 defined `'PMCC_LEAPS_ROLL'`), no
migration.

## 5. Fixtures used by every test layer

Dates are relative to the run day in e2e (`localDate(n)`); fixed (`FIXED_DAY`) in Vitest. Money is
the AC's.

| Name            | Content                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKGROUND`    | US-103 `OPEN` (LEAPS $80 @ 25.00 exp +368d; short $110 @ 2.00 exp +32d) + `EXPIRE_1` (+32d) + `SHORT_2` ($108 @ 1.80 exp +67d) + `SHORT_ROLL` (BUY $108 @ 3.00 / SELL **$112 @ 2.40 exp +95d**) → basis 21.80, LEAPS cost 25.00, eff 101.80 |
| `UP_OUT`        | proceeds 26.00, strike 85, debit 23.50, expiration +494d → net +2.50, basis 19.30, LEAPS cost 22.50, eff 104.30 (= US-103's `LEAPS_ROLL` fixture)                                                                                           |
| `OUT_DEBIT`     | proceeds 26.00, strike 80, debit 29.20, expiration +494d → net −3.20, basis 25.00, eff 105.00                                                                                                                                               |
| `TOO_MUCH_TIME` | proceeds 26.00, strike 80, debit 37.00, expiration +860d → net −11.00, basis 32.80, eff 112.80, shortfall 0.80 vs $112                                                                                                                      |
| `STRIKE_ABOVE`  | strike 112 and 115 (rest as `UP_OUT`) → `LEAPS strike must be below the short-call strike ($112.00).`                                                                                                                                       |
| `UNCOVERS`      | expiration +95d (= short) and +81d (< short) (rest as `UP_OUT`) → `LEAPS call must expire after the short call.`                                                                                                                            |
| `SHORTENS`      | proceeds 26.00, strike 80, debit 26.60, expiration +340d → net −0.60; info note `… 340 DTE, 28 days shorter …` (AC's 42 / 28 on its fixed calendar)                                                                                         |
| `NO_CHANGE`     | strike 80, expiration +368d                                                                                                                                                                                                                 |
| `ZERO_PROCEEDS` | proceeds 0.00 (rest as `UP_OUT`); `ZERO_DEBIT`: debit 0.00                                                                                                                                                                                  |
| `NO_SHORT`      | `BACKGROUND` + **new `EXPIRE_2`** (`SHORT_CALL_EXPIRED` EXPIRE $112 exp +95d, fill +95d, trigger `PMCC_SHORT_EXPIRED`) → basis still 21.80, no open short; `UP_OUT` then lands 19.30                                                        |
| `WHEEL_CC`      | `reachCcOpenState(page, '185', '2.50', localDate(30))` — the US-14 fixture                                                                                                                                                                  |

Vitest service fixtures reuse `src/main/services/test-fixtures/pmcc-legs.ts` (`EXPIRE_1`, `SHORT_2`,
`SHORT_ROLL`, plus the new `EXPIRE_2`) over a position created by `createPmccPosition` in a
`makeTestDb()`, with snapshots landed through `appendPmccSnapshot` so the chain is realistic.
