---
story: us-105
kind: feature
parent: null
topics: [wheel-lifecycle, cost-basis, ipc-handlers, zod-schemas, position-detail, pmcc]
status: planned
---

# Implementation Plan: US-105 — Roll the PMCC LEAPS to a further expiration when DTE is low

## Summary

Add the PMCC LEAPS roll: a pure `rollPmccLeaps` lifecycle rule set (phase, positive money, US-102's
coverage comparator from the long side, the strike-below-short shape rule, no-change — the two shape
rules skipped when no short call is open, and no "on or after current" rule), a service that writes
the **inverted** linked `ROLL_FROM` SELL / `ROLL_TO` BUY pair and calls US-103's `appendPmccSnapshot`
with `'PMCC_LEAPS_ROLL'` in one transaction, the `positions:roll-pmcc-leaps` channel, and the
`Roll LEAPS` sheet from the consolidated detail mockup — coverage ruler, live `Net Debit / Net
Credit` preview with the year-bearing roll label and replacement DTE, post-roll basis, LEAPS cost to
date and the **re-anchored** effective share cost, the advisory above-short-strike warning and the
advisory shortened-coverage note. Done when every Linear scenario passes end to end from the US-103
Background (XYZ, open $112 short at $2.40, basis $21.80, effective $101.80), the roll lands as one
chain and one snapshot reading $19.30 with `LEAPS cost to date` $22.50 and effective $104.30, the $112
short is untouched, and the wheel's detail page offers no `Roll LEAPS`.

Estimated at **5 points**. Areas 1–5 are main-process plus transport; 6–8 are the renderer; 9 is the
AC-driven e2e suite. **Depends on US-103 (`wb-103`) and, by preference, US-104 (`wb-104`) having
landed** — see quickstart.md. Areas marked **★** consume US-104 pieces and name what they build
themselves if US-104 has not landed.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-13](https://linear.app/optionswheel/issue/OPT-13/us-105-roll-the-pmcc-leaps-to-a-further-expiration-when-dte-is-low)
- **Layout of record:** `mockups/epic-09-pmcc-position-detail.mdx` — the `RollLeapsSheet` function and the `rl-entry`, `rl-up-out`, `rl-out-debit`, `rl-too-much-time`, `rl-strike-above`, `rl-uncovers`, `rl-shortens`, `rl-no-change`, `rl-zero-proceeds`, `rl-recorded`, `rl-no-short` presets. `mockups/us-105-roll-pmcc-leaps.mdx` is design history and carries the **Linear figures** (the consolidated file runs the sheet on a different ledger; Linear wins on figures)
- **Research & Design Decisions:** `plans/us-105/research.md`
- **Data Model & Type Design:** `plans/us-105/data-model.md`
- **API Contract:** `plans/us-105/contracts/positions-roll-pmcc-leaps.md`
- **Quickstart & Verification:** `plans/us-105/quickstart.md`
- **Sibling plan this generalizes:** `plans/us-104/plan.md` (Areas 1, 3, 7, 8, 9) and `plans/us-104/research.md`
- **Spec pages this builds on:** `docs/spec/features/us-103-pmcc-cost-basis.md`, `docs/spec/features/us-14-roll-cc.md`, ADRs `pmcc-effective-share-cost-anchors-on-newest-long-buy`, `pmcc-contributions-by-role-and-action`, `shared-roll-chain-helper`, `pmcc-snapshot-single-writer-in-caller-transaction`, `rolls-as-linked-leg-pairs`, `soft-client-side-warnings`, `sheet-component-pattern`

## Prerequisites

Already in place on `wb-103` (verify with the first `grep` block in quickstart.md):

- US-103: `appendPmccSnapshot`, `pmccLedgerFromLegs`, `currentLongStrike` / private `newestLongBuy`
  (already re-anchors on a SELL-chain's `ROLL_TO`) in `src/main/services/pmcc-ledger.ts`;
  `groupRollChains` + `RollChain` in `roll-chains.ts` (nets by action — a LEAPS roll reads `+2.5000`);
  `readLegs` in `leg-rows.ts`; `PmccTriggerEvent` with `'PMCC_LEAPS_ROLL'`; `GetPositionResult.pmccLedger`
  with `leapsCostPerShare`; `PmccCostBasis` drawer; the `_test:pmcc-record-leg-event` seam;
  `e2e/pmcc-ledger-helpers.ts` (`EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `LEAPS_ROLL`, `cell`, `snapshots`);
  `src/main/services/test-fixtures/pmcc-legs.ts` (same five fixtures).
- US-101: `pmccCrossLegIssues` with the inline strike rule; `PmccIssue`; `PmccLegReference`.
- US-14: `registerParsedPositionHandler`, `usePositionMutation`, the `Sheet*` / `Field` / `NumberInput` /
  `DatePicker` / `AlertBox` / `SummaryRow` / `SectionCard` primitives, `e2e/helpers.ts#reachCcOpenState`.

Expected from `wb-104` (verify with the second `grep` block; ★ areas cover a miss):

- `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG` (`pmcc-rules.ts`); `pmccOpenLegs` /
  `currentLeapsLeg` / `currentShortCallLeg` and `GetPositionResult.pmccOpenLegs`;
  `src/renderer/src/lib/pmcc-roll.ts` (`pmccRollNet`, `pmccRollLabel`, `pmccPostRollEffectiveCost`,
  `pmccStrikeShortfall`); `PmccCoverageRuler`; `FormButton` disabled treatment;
  `PositionDetailActions` `strategyType` / `hasOpenShortCall`; `usePositionDetailSheets`
  `pmccRollRecorded`; `RollPmccShortCallSheet` / `RollPmccShortCallForm`; `e2e/pmcc-roll-helpers.ts`
  (`fieldError`, `confirmButton`, `rollSheet`, `monthLabel`, `longDate`); optionally `insertLegRow` in
  `leg-rows.ts`.
- No migration: `legs` and `cost_basis_snapshots` already hold everything the roll writes.

## Implementation Areas

### 1. ★ Shared PMCC shape rules: strike-ordering predicate and the long-side comparator message

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts` — export `shortStrikeAboveLeaps`, `LONG_NOT_AFTER_SHORT`,
  `STRIKE_NOT_BELOW_SHORT_CODE`, `leapsStrikeNotBelowShortMessage`; make the inline
  `new Decimal(short.strike).lte(long.strike)` rule in `pmccCrossLegIssues` call the predicate
- `src/main/core/pmcc-rules.test.ts` — new cases
- `src/main/core/pmcc-rules.property.test.ts` — new cases (★ new file if US-104 did not create it)
- ★ If US-104 has not landed: also add `shortExpiresBeforeLeaps` and `SHORT_NOT_BEFORE_LONG` exactly as
  `plans/us-104/plan.md` Area 1 specifies, and make the `short.expiration` rule use them

**Red — tests to write:**

- `pmcc-rules.test.ts`: `shortStrikeAboveLeaps('112.0000', '85.0000')` is `true`; equal strikes
  (`'112.0000'`, `'112'`) → `false`; lower short → `false`. `LONG_NOT_AFTER_SHORT` equals
  `{ code: 'long_not_after_short', message: 'LEAPS call must expire after the short call.' }`.
  `leapsStrikeNotBelowShortMessage('112.0000')` is `LEAPS strike must be below the short-call strike ($112.00).`;
  `('112.5')` → `($112.50)`. `STRIKE_NOT_BELOW_SHORT_CODE === 'strike_not_below_short'`. Regression:
  the existing `pmccCrossLegIssues` case for `short.strike ≤ long.strike` still reports
  `('short.strike', 'strike_not_above_long', 'Short-call strike must be above the LEAPS strike.')`
  and the valid pair still yields `[]`.
- `pmcc-rules.property.test.ts` (**property — oracle/iff**): for any two `positiveMoney()` strikes,
  `shortStrikeAboveLeaps(a, b) === new Decimal(a).gt(b)`; and `pmccCrossLegIssues` over a valid pair
  with only the two strikes varied contains a `strike_not_above_long` issue **iff**
  `!shortStrikeAboveLeaps(short, long)`.

**Green — implementation:**

- `export const shortStrikeAboveLeaps = (shortStrike: string, longStrike: string): boolean => new Decimal(shortStrike).gt(longStrike)`;
  `export const LONG_NOT_AFTER_SHORT = { code: 'long_not_after_short', message: 'LEAPS call must expire after the short call.' } as const satisfies Pick<PmccIssue, 'code' | 'message'>`;
  `export const STRIKE_NOT_BELOW_SHORT_CODE = 'strike_not_below_short' as const`;
  `export const leapsStrikeNotBelowShortMessage = (shortStrike: string): string => \`LEAPS strike must be below the short-call strike ($${new Decimal(shortStrike).toFixed(2)}).\``(per data-model.md § 4). Pure; no new imports beyond the existing`decimal.js`.
- `pmccCrossLegIssues`: `...issueIf(both defined && !shortStrikeAboveLeaps(short.strike, long.strike), 'short.strike', 'strike_not_above_long', 'Short-call strike must be above the LEAPS strike.')`.

**Refactor — cleanup to consider:**

- `SHORT_NOT_BEFORE_LONG` and `LONG_NOT_AFTER_SHORT` are the two halves of US-102; group them under one
  `// US-102 — PMCC coverage comparator` comment block so US-102 finds both when it lands.

**Acceptance criteria covered:**

- Foundation for "Reject a replacement strike that is not below the open short strike" and "Reject a
  replacement expiration that would leave the short call uncovered … by the shared US-102
  comparator, with that story's message".

### 2. Pure lifecycle rule set: `rollPmccLeaps`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — `RollPmccLeapsInput`, `RollPmccLeapsResult`, `rollPmccLeaps`
- `src/main/core/lifecycle.test.ts` — new describe block
- `src/main/core/lifecycle.property.test.ts` — new cases

**Red — tests to write (`lifecycle.test.ts`, `describe('rollPmccLeaps')`, fixture: phase `PMCC_OPEN`,
`currentLeaps { strike '80.0000', expiration '2027-09-17' }`, `openShort { strike '112.0000', expiration '2027-07-16' }`):**

- Roll up & out (`85.0000`, `2028-01-21`, proceeds `26.0000`, debit `23.5000`) → `{ phase: 'PMCC_OPEN' }`.
- Roll out at the same strike with a debit (`80.0000`, `2028-01-21`, `26.0000`, `29.2000`) → `PMCC_OPEN`
  (a debit is valid).
- Shortened coverage (`80.0000`, `2027-08-20`, `26.0000`, `26.6000`) → `PMCC_OPEN` — **no**
  on-or-after-current rejection.
- Same expiration, higher strike (`85.0000`, `2027-09-17`) → accepted (`Roll Up`).
- Every rejection in the research.md rule table, asserted as `ValidationError` `{ field, code, message }`:
  phase `CC_OPEN` → `__phase__` / `invalid_phase` / `Position is not in PMCC_OPEN phase`; proceeds
  `0.0000` → `proceedsPerContract` / `must_be_positive` / `Proceeds from close must be greater than zero`;
  debit `0.0000` → `replacementDebitPerContract` / `must_be_positive` / `Replacement debit must be greater than zero`;
  strike `0.0000` → `newStrike` / `must_be_positive` / `Strike must be positive`; expiration
  `2027-07-16` and `2027-07-02` → `newExpiration` / `long_not_after_short` / `LEAPS call must expire after the short call.`;
  strike `112.0000` and `115.0000` → `newStrike` / `strike_not_below_short` /
  `LEAPS strike must be below the short-call strike ($112.00).`; `80.0000` + `2027-09-17` → `__roll__` /
  `no_change` / `Roll must change the strike, the expiration, or both`.
- Order: phase `CC_OPEN` with proceeds `0` reports the phase; proceeds `0` with expiration `2027-07-16`
  reports the proceeds; expiration `2027-07-16` with strike `112` reports the comparator (coverage
  before strike); strike `112` with the current expiration reports the strike, not no-change.
- `openShort: null`: strike `112.0000` + `2028-01-21` → accepted; expiration `2027-07-16` (before the
  current LEAPS, would be "uncovered" if a short were open) → accepted; `80.0000` + `2027-09-17` →
  still `no_change`; proceeds `0` → still `must_be_positive`.

**Red — properties (`lifecycle.property.test.ts`):**

- **Guard (phase)**: add `rollPmccLeaps` to the `phase guards` table with `requiredPhase: 'PMCC_OPEN'` —
  every other `wheelPhase` throws `__phase__` / `invalid_phase`.
- **Guard (coverage)**: for `orderedDays(2)` as `[replacement, short]` (replacement ≤ short) with an
  open short and positive money / a strike below the short, the error is `newExpiration` /
  `long_not_after_short` — regardless of the current LEAPS expiration.
- **Guard (strike)**: for `positiveMoney()` short strike `s` and replacement strike `n ≥ s` (generate
  `n = s + nonNegative`), an open short, and a replacement expiration after the short, the error is
  `newStrike` / `strike_not_below_short`.
- **Invariant (no-short skip)**: with `openShort: null`, any `isoDay` expiration and any
  `positiveMoney()` strike / proceeds / debit where strike or expiration differs from the current LEAPS,
  the result is `{ phase: 'PMCC_OPEN' }`.
- **Invariant (valid)**: for `orderedDays(2)` as `[short, replacement]` (replacement > short), strike
  `< s`, positive money, and a change from the current LEAPS, the result is `{ phase: 'PMCC_OPEN' }`.

**Green — implementation:**

- The types and function per research.md § ADR "`rollPmccLeaps`", reusing `requirePositiveDecimal(value, 'proceedsPerContract', 'Proceeds from close')`,
  `requirePositiveDecimal(value, 'replacementDebitPerContract', 'Replacement debit')`,
  `requirePositiveStrike(newStrike, 'newStrike')`, `shortExpiresBeforeLeaps(openShort.expiration, newExpiration)`
  with `LONG_NOT_AFTER_SHORT`, `shortStrikeAboveLeaps(openShort.strike, newStrike)` with
  `STRIKE_NOT_BELOW_SHORT_CODE` / `leapsStrikeNotBelowShortMessage(openShort.strike)`; rules 5–6
  inside `if (input.openShort !== null)`. Strike equality via `new Decimal(a).eq(b)`. No logging, no
  I/O imports.

**Refactor — cleanup to consider:**

- `rollPmccShortCall` and `rollPmccLeaps` share the `__roll__` / `no_change` check with the identical
  message; if a private `requireRollChange(current, next)` reads cleaner for both, extract it
  (leave `rollCc` alone — its message differs).

**Acceptance criteria covered:**

- Engine side of "Reject a replacement strike that is not below the open short strike" (both rows),
  "Reject a replacement expiration that would leave the short call uncovered" (both rows), "Allow a
  replacement that shortens coverage but still outlasts the short call" (accepted), "Reject a roll that
  changes neither strike nor expiration", "Reject non-positive proceeds or replacement debit" (both
  rows), "Roll the LEAPS while no short call is open" (no check applied), and the acceptance half of
  the two preview scenarios and "Recording the roll".

### 3. Payload schema, generic `RollResultBase` and the result type

**Files to create or modify:**

- `src/main/schemas.ts` — `RollPmccLeapsPayloadSchema`, `RollPmccLeapsPayload`,
  `RollResultBase<From, To>`, `RollPmccLeapsResult`
- `src/main/schemas.pmcc.test.ts` — new cases

**Red — tests to write:**

- `RollPmccLeapsPayloadSchema.parse` accepts the contract's example and rejects
  `proceedsPerContract: 0` and `replacementDebitPerContract: 0` (`too_small`), a non-ISO
  `newExpiration`, and a missing `positionId`; `newStrike` and `fillDate` are optional; the parsed
  type has no `costToClosePerContract` key (`expectTypeOf<RollPmccLeapsPayload>().not.toHaveProperty('costToClosePerContract')`).
- Type-level (`expectTypeOf`): `RollPmccLeapsResult['rollFromLeg']['action']` is `'SELL'`;
  `RollPmccLeapsResult['rollToLeg']['action']` is `'BUY'`; `RollPmccLeapsResult['position']['phase']`
  is `'PMCC_OPEN'`; `RollPmccLeapsResult['costBasisSnapshot']['triggerEvent']` is `'PMCC_LEAPS_ROLL'`;
  `RollPmccLeapsResult extends RollResultBase<'SELL', 'BUY'>`; regression:
  `RollCcResult['rollFromLeg']['action']` is still `'BUY'` and `RollCcResult extends RollResultBase`.

**Green — implementation:**

- `export const RollPmccLeapsPayloadSchema = z.object({ positionId: PositionIdSchema, proceedsPerContract: z.number().positive(), replacementDebitPerContract: z.number().positive(), newExpiration: IsoDateSchema, newStrike: z.number().positive().optional(), fillDate: z.string().optional() })`
  next to `RollCcPayloadSchema`; `export type RollPmccLeapsPayload = z.infer<...>`.
- `interface RollResultBase<From extends LegAction = 'BUY', To extends LegAction = 'SELL'> { rollFromLeg: LegRecord & { legRole: 'ROLL_FROM'; action: From }; rollToLeg: LegRecord & { legRole: 'ROLL_TO'; action: To }; rollChainId: string; costBasisSnapshot: CostBasisSnapshotRecord }`
  (import `LegAction` from `./core/types`); the three existing results are untouched.
- `export interface RollPmccLeapsResult extends RollResultBase<'SELL', 'BUY'> { position: { id; ticker; phase: 'PMCC_OPEN'; status: 'ACTIVE' }; costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_LEAPS_ROLL'; finalPnl: null }; ledger: PmccLedgerResult; leapsRollNumber: number }`
  per data-model.md § 1 and § 4.

**Refactor — cleanup to consider:**

- Check naming consistency with `RollPmccShortCallResult` (`shortCallRollNumber` ↔ `leapsRollNumber`).

**Acceptance criteria covered:**

- Transport shape for "Recording the roll creates a linked leg pair and one net cost-basis line"
  (ROLL_FROM SELL, ROLL_TO BUY).

### 4. ★ Fixtures and the `rollPmccLeapsPosition` service

**Files to create or modify:**

- `src/main/services/test-fixtures/pmcc-legs.ts` — add `EXPIRE_2` (`SHORT_CALL_EXPIRED` EXPIRE
  `112.0000` exp `day(95)` fill `day(95)` premium `0.0000`) to `PmccFixtures`
- `src/main/services/roll-pmcc-leaps-position.ts` — new
- `src/main/services/roll-pmcc-leaps-position.test.ts` — new
- `src/main/services/pmcc-cost-basis-chain.test.ts` — one new chain case through the real service
- ★ If US-104 has not landed: `pmccOpenLegs` / `currentLeapsLeg` / `currentShortCallLeg` in
  `pmcc-ledger.ts`, `GetPositionResult.pmccOpenLegs` and the `get-position.ts` / `ipc` / renderer
  fixture changes exactly as `plans/us-104/plan.md` Area 3 specifies

**Red — tests to write (`roll-pmcc-leaps-position.test.ts`; Background = `createPmccPosition` +
`insertLegs` of `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL` from `pmccFixtures(positionId, runDay)` with a
snapshot per event via `appendPmccSnapshot`, so the chain is realistic):**

- Happy path (proceeds `26`, debit `23.5`, strike `85`, expiration `day(494)`): result has
  `rollFromLeg` `ROLL_FROM` / **`SELL`** / `CALL` / `80.0000` / `day(368)` / `26.0000` / `fees '0.0000'`;
  `rollToLeg` `ROLL_TO` / **`BUY`** / `85.0000` / `day(494)` / `23.5000`; both `rollChainId` equal and
  non-null; `costBasisSnapshot.triggerEvent === 'PMCC_LEAPS_ROLL'`, `basisPerShare '19.3000'`,
  `totalPremiumCollected '320.0000'`; `ledger.basisTotal '1930.0000'`, `ledger.leapsCostPerShare '22.5000'`,
  `ledger.effectiveShareCost '104.3000'`; `leapsRollNumber === 1`; `position.phase 'PMCC_OPEN'`.
- DB state after: `legs` count +2; the newest `cost_basis_snapshots` row matches the result; the
  `positions` row's `phase` and `updated_at` unchanged; `getPosition(...).pmccOpenLegs.long.strike === '85.0000'`
  and `.long.legRole === 'ROLL_TO'`; `.short.strike === '112.0000'` and `.short.id` unchanged (the open
  short is untouched).
- Debit roll (proceeds `26`, debit `29.2`, strike omitted → defaults to `80.0000`): `basisPerShare '25.0000'`,
  `ledger.effectiveShareCost '105.0000'`.
- A second LEAPS roll on the same position → `leapsRollNumber === 2`; a position with the `SHORT_ROLL`
  chain only still reports `leapsRollNumber === 1` (short-side chains do not count).
- `fillDate` omitted → both legs' `fillDate === localToday()`.
- No short open (Background + `EXPIRE_2`): strike `112` and expiration `day(95)` are **accepted**
  and the basis reads `19.3000` for the `UP_OUT` values.
- Rejections propagate as `ValidationError` with the engine's field/code and write nothing (assert leg
  and snapshot counts unchanged): expiration `day(95)` → `newExpiration` / `long_not_after_short`;
  strike `112` → `newStrike` / `strike_not_below_short`; unknown id → `__root__` / `not_found`; a wheel
  position id → `__phase__` / `invalid_phase`; a PMCC whose `pmccOpenLegs` is null (delete its legs in
  the test) → `__root__` / `no_active_leg`.
- Rollback: install `CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`
  → the call throws, `legs` count unchanged (no orphan `ROLL_FROM`), snapshot count unchanged.
- `pmcc-cost-basis-chain.test.ts`: OPEN → EXPIRE_1 → SHORT_2 → SHORT_ROLL (fixture rows) →
  **`rollPmccLeapsPosition`** → snapshots read `23.0000, 23.0000, 21.2000, 21.8000, 19.3000` with
  triggers `PMCC_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_OPEN, PMCC_SHORT_ROLL, PMCC_LEAPS_ROLL`.

**Green — implementation:**

- The service per research.md § ADR "`rollPmccLeapsPosition`": `getPosition` → `pmccOpenLegs(detail.legs)`
  (null → `no_active_leg`) → 4-dp formatting (`new Decimal(x).toFixed(4)`), `newStrike ?? long.strike`
  → `rollPmccLeaps({ currentPhase, currentLeaps: { strike: long.strike, expiration: long.expiration }, openShort: short ? { strike, expiration } : null, ... })`
  → `db.transaction(() => { insert ROLL_FROM (SELL); insert ROLL_TO (BUY); return appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_LEAPS_ROLL', eventDate: fillDate, now }) })()`.
  Inserts via `insertLegRow` from `leg-rows.ts` if US-104 extracted it, else two `INSERT` statements
  mirroring `roll-cc-position.ts` with `'SELL'` / `'BUY'`.
  `leapsRollNumber = groupRollChains(detail.legs).filter((c) => c.rollFrom.action === 'SELL').length + 1`.
- Logging per research.md § ADR "Logging" (INFO `pmcc_leaps_rolled`, INFO `pmcc_leaps_roll_rejected`
  on `ValidationError`, DEBUG inputs and tx checkpoints).

**Refactor — cleanup to consider:**

- `roll-pmcc-short-call-position.ts` and this service differ only in the engine call, the two actions,
  the trigger event and the chain filter; if a shared `recordPmccRoll(db, positionId, { from, to, triggerEvent, fillDate })`
  in `pmcc-ledger.ts` removes the duplicated transaction body without obscuring either, extract it —
  only if both services' tests stay green and the wheel services are untouched.

**Acceptance criteria covered:**

- "Recording the roll creates a linked leg pair and one net cost-basis line" (ROLL_FROM SELL $80 @
  $26.00, ROLL_TO BUY $85 @ $23.50, one chain, basis $19.30 by US-103, LEAPS cost to date $22.50,
  effective $104.30, the $112 short unchanged); "Roll the LEAPS while no short call is open" (recorded,
  $19.30, no checks); the bypass half of "Reject a replacement expiration that would leave the short
  call uncovered … no ROLL_FROM or ROLL_TO leg is recorded … the $80 LEAPS remains open".

### 5. IPC handler, preload, renderer adapter and hook

**Files to create or modify:**

- `src/main/ipc/positions.ts` — `positions:roll-pmcc-leaps`
- `src/main/ipc/positions.test.ts` — new cases
- `src/preload/index.ts` — `rollPmccLeaps: (payload: unknown) => invoke('positions:roll-pmcc-leaps', payload)`
- `src/preload/index.d.ts` — `IpcRollPmccLeapsResult = IpcResult<RollPmccLeapsResult>`; the `api`
  entry typed `(payload: RollPmccLeapsPayload) => Promise<IpcRollPmccLeapsResult>`
- `src/renderer/src/api/positions.ts` — `RollPmccLeapsPayload`, `RollPmccLeapsResponse`, `rollPmccLeaps()`
- `src/renderer/src/api/positions.test.ts` — new cases
- `src/renderer/src/hooks/useRollPmccLeaps.ts` — new (one-liner over `usePositionMutation`, like `useRollCc`)

**Red — tests to write:**

- `ipc/positions.test.ts`: the channel is registered; a valid payload calls
  `rollPmccLeapsPosition(db, positionId, parsed)` and returns `{ ok: true, ...result }`; a payload with
  `proceedsPerContract: 0` returns `{ ok: false, errors: [{ field: 'proceedsPerContract', … }] }` without
  calling the service; a service `ValidationError('newExpiration', 'long_not_after_short', …)` returns
  that envelope; a service `ValidationError('newStrike', 'strike_not_below_short', …)` likewise; a
  generic throw returns `internal_error`.
- `api/positions.test.ts`: `rollPmccLeaps` passes the payload through unchanged, throws an `ApiError`
  status 400 carrying the field errors on `{ ok: false }`, returns the body on success.

**Green — implementation:**

- `registerParsedPositionHandler(db, 'positions:roll-pmcc-leaps', 'positions_roll_pmcc_leaps_unhandled_error', RollPmccLeapsPayloadSchema, rollPmccLeapsPosition)`
  — nothing else in the handler file.
- Preload, `index.d.ts`, adapter and hook mirroring the `rollPmccShortCall` trio exactly (camelCase
  end to end; `IpcPayload<'rollPmccLeaps'>` / `IpcSuccess<'rollPmccLeaps'>` per data-model.md § 4).

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Transport for every scenario that records or rejects a roll.

### 6. ★ Renderer pure helpers (generalized) and the form schema

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-roll.ts` — generalize `pmccRollNet` to `PmccRollCash { received, paid, contracts }`;
  `pmccRollLabel(current, next, monthFormat: RollLabelMonthFormat = 'MMM')` gaining the `In` direction;
  add `leapsCoverageChange(currentExpiration, newExpiration): number | null`
- `src/renderer/src/lib/pmcc-roll.test.ts` — new cases; US-104's cases re-expressed with `received` / `paid`
- `src/renderer/src/components/RollPmccShortCallForm.tsx` (US-104) — call `pmccRollNet({ received: premium, paid: costToClose, contracts })`
- `src/renderer/src/schemas/roll-pmcc-leaps.ts` — `RollPmccLeapsContext`, `rollPmccLeapsSchema(ctx)`,
  `RollPmccLeapsFormValues`, `EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(today, currentStrike)`,
  `toRollPmccLeapsPayload(values, positionId)`
- `src/renderer/src/schemas/roll-pmcc-leaps.test.ts` — new
- ★ If US-104 has not landed: create `pmcc-roll.ts` with `pmccRollNet`, `pmccRollLabel`,
  `pmccPostRollEffectiveCost`, `pmccStrikeShortfall` per `plans/us-104/plan.md` Area 7, using the
  generalized signatures above from the start

**Red — tests to write:**

- `pmcc-roll.test.ts`: `pmccRollNet({ received: '26.00', paid: '23.50', contracts: 1 })` →
  `{ isDebit: false, perShare: '2.50', total: '250.00' }`; `('26.00', '29.20')` → debit `3.20` / `320.00`;
  `('26.00', '37.00')` → debit `11.00` / `1,100.00` (grouped total); 3 contracts → total `750.00`; `''`
  or `'0'` in either field → `null`. `pmccRollLabel({ strike: '80.0000', expiration: '2027-09-17' }, { strike: '85', expiration: '2028-01-21' }, 'MMM yyyy')`
  → `Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration`; same strike →
  `Roll Out: same $80 strike, Sep 2027 to Jan 2028 expiration`; `2027-08-20` same strike →
  `Roll In: same $80 strike, Sep 2027 to Aug 2027 expiration`; `85` + `2027-09-17` →
  `Roll Up: $80 to $85 strike, same Sep 2027 expiration`; `75` + later → `Roll Down & Out: …`; nothing
  changed → `null`; `'112.5000'` prints `$112.5`; the default format still yields US-104's
  `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration` and the same-month `Nov 20 to Nov 27` form.
  `pmccPostRollEffectiveCost({ basisPerShare: '21.8000', leapsStrike: '85', net: +2.50 })` →
  `{ postBasis: '19.30', effectiveAfter: '104.30' }`; `('21.8000', '80', −3.20)` → `'25.00' / '105.00'`;
  `('21.8000', '80', −11.00)` → `'32.80' / '112.80'`. `pmccStrikeShortfall('112.0000', '112.80')` →
  `'0.80'`; `('112.0000', '104.30')` → `null`; `('112.0000', '112.00')` → `null`.
  `leapsCoverageChange('2027-09-17', '2027-08-20')` → `-28`; `('2027-09-17', '2028-01-21')` → `126`;
  incomplete date → `null`.
- `roll-pmcc-leaps.test.ts` (ctx: current `80.0000` / `2027-09-17`, `openShort { '112.0000', '2027-07-16' }`):
  the `UP_OUT` values parse; `newExpiration '2027-07-16'` and `'2027-07-02'` → issue at
  `['newExpiration']` with `LONG_NOT_AFTER_SHORT.message`; `newStrike '112'` and `'115'` → issue at
  `['newStrike']` with `LEAPS strike must be below the short-call strike ($112.00).`; `80` +
  `'2027-09-17'` → issue at `['__roll__']` with `Roll must change the strike, the expiration, or both`;
  `proceeds '0.00'` → `Proceeds from close must be greater than zero`; `newDebit '0'` →
  `Replacement debit must be greater than zero`; `newExpiration '2027-08-20'` with strike `80` →
  **no issue**; an incomplete expiration (`''`) reports only the ISO-date message (the comparator is
  skipped while undecided). With `openShort: null`: `'2027-07-16'` and strike `'112'` both parse
  cleanly; no-change and money rules still fire. `toRollPmccLeapsPayload` yields
  `{ positionId, proceedsPerContract: 26, replacementDebitPerContract: 23.5, newStrike: 85, newExpiration, fillDate }`
  (numbers; `fillDate` omitted when empty).
- `RollPmccShortCallForm.test.tsx` (US-104 regression): the existing `UP_OUT` / `OUT_CREDIT` net and
  label assertions still pass after the signature change.

**Green — implementation:**

- `pmcc-roll.ts`: `pmccRollNet` computes `received − paid` with `Decimal`, `toFixed(2)` for display,
  grouped total via `fmtMoneyGrouped`-style formatting; `pmccRollLabel` derives direction from strike
  (`Up` / `Down`) and timing from expiration (`Out` later, `In` earlier), joins with `&`, formats
  dates with `date-fns` `format(parseISO(d), monthFormat)` and adds the day when both fall in the same
  period but differ; `leapsCoverageChange` = `differenceInCalendarDays(parseISO(new), parseISO(current))`
  guarded by the ISO regex. Pure, no React.
- The schema per data-model.md § 4: `z.object({ proceeds, newStrike, newDebit: moneySchema(...), newExpiration: isoDateSchema, fillDate: isoDateSchema, __roll__: z.string().optional() }).superRefine(...)`
  with the three cross-field rules at their paths, reusing `shortExpiresBeforeLeaps`,
  `LONG_NOT_AFTER_SHORT`, `shortStrikeAboveLeaps`, `leapsStrikeNotBelowShortMessage` from
  `src/main/core/pmcc-rules.ts`; the two shape rules run only when `ctx.openShort !== null` and the
  value is decided. Defaults live in `EMPTY_ROLL_PMCC_LEAPS_DEFAULTS` (strike pre-filled to the current
  LEAPS strike at 2 dp, as `RollCcSheet` does), never as `.default()`.

**Refactor — cleanup to consider:**

- `moneySchema` / `required` now have three private copies (`pmcc-entry.ts`, `roll-pmcc-short-call.ts`,
  this file); move them to `schemas/common.ts` if US-104 did not already.

**Acceptance criteria covered:**

- "Net credit preview for a roll up and out", "Net debit preview for a roll out at the same strike",
  "Warning when the effective share cost after the roll rises above the open short strike", "Allow a
  replacement that shortens coverage" (the 28-day figure), and the client-side half of the five
  rejection scenarios and of "Roll the LEAPS while no short call is open" (checks skipped).

### 7. ★ Header action, banner state union, and the marks-based coverage ruler

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.tsx` + `.test.tsx` — `hasOpenLeaps`, `onRollPmccLeaps`; `Roll LEAPS →`
- `src/renderer/src/pages/usePositionDetailSheets.ts` — `rollPmccLeapsOpen`, `handleRollPmccLeaps`,
  `handleCloseRollPmccLeaps`; `pmccRollRecorded: PmccRollRecorded` (discriminated union),
  `handlePmccShortRollRecorded` / `handlePmccLeapsRollRecorded`; `overlayOpen` includes the new sheet
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — new cases
- `src/renderer/src/components/PmccCoverageRuler.tsx` + `.test.tsx` — generalize to `{ today, blocked, fillTo, marks: PmccRulerMark[], note }`
- `src/renderer/src/components/RollPmccShortCallForm.tsx` + `.test.tsx` (US-104) — build its four marks
  and its note from the props it already has
- ★ If US-104 has not landed: `FormButton` disabled treatment, `PositionDetailActions` `strategyType` /
  `hasOpenShortCall`, and `usePositionDetailSheets` base changes per `plans/us-104/plan.md` Area 8;
  create `PmccCoverageRuler` marks-based from the start

**Red — tests to write:**

- `PositionDetailActions.test.tsx`: `strategyType 'PMCC'` + `hasOpenLeaps` + `hasOpenShortCall` →
  `roll-pmcc-short-btn` then `roll-pmcc-leaps-btn` (text `Roll LEAPS →`) in that order, no wheel
  buttons; `strategyType 'PMCC'` + `hasOpenLeaps` + `hasOpenShortCall: false` → `roll-pmcc-leaps-btn`
  present and `roll-pmcc-short-btn` absent; `strategyType 'PMCC'` + `hasOpenLeaps: false` → no roll
  buttons; `strategyType 'WHEEL'` + `phase 'CC_OPEN'` → `roll-cc-btn` present and both PMCC buttons
  absent (regression).
- `PositionDetailPage.test.tsx`: on a PMCC detail with `pmccOpenLegs`, clicking `Roll LEAPS →` opens
  `role=dialog[name="Roll LEAPS"]` and blurs the content (`overlayOpen`); the same on a detail whose
  `pmccOpenLegs.short === null`; `handlePmccLeapsRollRecorded(res)` closes the sheet and shows
  `pmcc-leaps-roll-recorded-banner`; opening either roll sheet again clears it; a `kind: 'short'`
  banner and a `kind: 'leaps'` banner never render together (set one, then the other — only the
  latter shows).
- `PmccCoverageRuler.test.tsx`: given `marks` with `date: null` the legend row renders its label and
  `value` but no tick (`data-mark` count = marks with a date); `data-blocked="true"` colours the fill
  and the tall mark `bg-wb-red`, otherwise `bg-wb-gold`; the `note` renders verbatim; percent widths
  are the only inline styles; US-104's four ruler cases are re-expressed as marks + notes supplied by
  the test and still pass.
- `RollPmccShortCallForm.test.tsx` (US-104 regression): the `OUTLASTS` case still renders
  `data-blocked="true"` and the naked-short note; the no-replacement note still reads
  `Current short call expires in <n> days. The LEAPS covers <m> days.`

**Green — implementation:**

- `PositionDetailActions`: after the US-104 button,
  `{strategyType === 'PMCC' && hasOpenLeaps && <ActionButton testId="roll-pmcc-leaps-btn" label="Roll LEAPS →" onClick={onRollPmccLeaps} />}`;
  wheel branches untouched. `PositionDetailPage` passes `hasOpenLeaps={Boolean(data.pmccOpenLegs)}`.
- `usePositionDetailSheets`: `const [rollPmccLeapsOpen, setRollPmccLeapsOpen] = useState(false)`;
  `type PmccRollRecorded = { kind: 'short'; result: RollPmccShortCallResponse } | { kind: 'leaps'; result: RollPmccLeapsResponse } | null`
  per data-model.md § 4; `handleRollPmccLeaps` opens and clears the banner;
  `handlePmccLeapsRollRecorded(res)` sets `{ kind: 'leaps', result: res }` and closes; US-104's handler
  sets `kind: 'short'`.
- `PmccCoverageRuler({ today, blocked, fillTo, marks, note })`: the consolidated mockup's `Ruler` —
  one axis spanning `max(DTE of every dated mark)`, a fill bar to `fillTo`, one tick per dated mark
  (`data-mark={key}`), a legend row per mark (`LegendItem`: swatch by `tone`, label, value), and the
  note (`text-wb-red` when blocked). DTE via `computeDteFromInput(date, today)`; tones map to
  `bg-wb-text-muted` / `bg-wb-text-secondary` / `bg-wb-green` / `bg-wb-gold` (or `bg-wb-red` when
  blocked); `data-blocked` attribute. Tailwind only; the percentage offsets are the only inline styles.

**Refactor — cleanup to consider:**

- `usePositionDetailSheets` now holds four independent roll booleans; if a single
  `openSheet: 'rollCsp' | 'rollCc' | 'rollPmccShort' | 'rollPmccLeaps' | null` reads simpler and the
  existing tests stay green, fold them — otherwise leave the wheel's two alone.

**Acceptance criteria covered:**

- Entry point for every UI scenario (short open and no short open); "the confirm action is disabled"
  (six scenarios) reads as disabled via US-104's `FormButton` treatment; "Leave a classic wheel
  unaffected" (no `Roll LEAPS` on a wheel header).

### 8. The `Roll LEAPS` sheet, form, page wiring and banner

**Files to create or modify:**

- `src/renderer/src/components/RollPmccLeapsSheet.tsx` + `.test.tsx` — portal sheet owning the RHF instance, server-error mapping, `onRecorded`
- `src/renderer/src/components/RollPmccLeapsForm.tsx` + `.test.tsx` — presentational
- `src/renderer/src/pages/PositionDetailPage.tsx` — mount the sheet and the success banner

**Red — tests to write:**

- `RollPmccLeapsForm.test.tsx` (props: ticker `XYZ`, `leaps { strike '80.0000', expiration, premiumPerContract '25.0000', contracts 1 }`,
  `openShort { strike '112.0000', expiration, premiumPerContract '2.4000' } | null`,
  `ledger { basisPerShare '21.8000', leapsCostPerShare '25.0000', effectiveShareCost '101.8000' }`):
  - Header: eyebrow `ROLL LEAPS`, title `Roll LEAPS Call`, subtitle
    `XYZ CALL $80.00 · exp <date> · <n> DTE` (DTE via `computeDteFromInput`).
  - `Coverage` section: ruler marks `today`, `short`, `current`, `replacement` (three ticks until a
    replacement date is typed); legend rows `Today`, `Open short call`, `Current LEAPS (selling)`,
    `Replacement LEAPS (buying) · not entered`; note
    `Current LEAPS expires in <n> days — inside the window where its time value starts to decay fast. The open short call needs cover past <short date>.`
    when `n ≤ 90`, without the window clause otherwise.
  - `Current LEAPS` rows: `Contract` `XYZ $80.00 CALL`, `Expiration` `<date> (<n> DTE)`, `Bought at`
    `$25.00 / share`, `LEAPS cost to date` `$25.00 / share`, `Cost basis` `$21.80 / share`,
    `Effective share cost` `$101.80` highlighted, and the note containing
    `the $80.00 strike plus $21.80 of basis. Re-anchors to the replacement strike after this roll.`
  - `Open short call` rows: `Contract` `XYZ $112.00 CALL`, `Expiration` `<date> (<n> DTE)`, `Sold at`
    `$2.40 / share`, note `Read-only. The replacement LEAPS must expire after it and strike below it.`;
    with `openShort: null` → the text `No short call open — nothing to cover, so the expiration and strike checks are skipped.`
    and the legend row `Open short call · none`.
  - Inputs by id: `pmcc-leaps-roll-proceeds` (`Proceeds from close / share`), `pmcc-leaps-roll-debit`
    (`Debit (buy to open) / share`), `pmcc-leaps-roll-strike` (pre-filled `80.00`),
    `pmcc-leaps-roll-expiration` (DatePicker, hint `<n> DTE` once valid), `pmcc-leaps-roll-fill-date`
    (DatePicker defaulting to today), `pmcc-leaps-roll-contracts` read-only.
  - With no cash entered the dashed placeholder
    `Enter the proceeds from close and the replacement debit to preview the net.` renders and
    `pmcc-leaps-roll-net` does not.
  - `UP_OUT` values → `pmcc-leaps-roll-net` text `Net Credit: $2.50 per share ($250.00 total)`, amount
    span `text-wb-green`; `pmcc-leaps-roll-label` text
    `Roll Up & Out: $80 to $85 strike, <Mon yyyy> to <Mon yyyy> expiration · <n> DTE`; rows
    `Cost basis after roll` `$19.30 / share (from $21.80)`, `LEAPS cost to date after`
    `$22.50 / share (from $25.00)`, `Effective share cost after roll` `$104.30 (from $101.80)`
    highlighted, and the note `$85.00 strike + $19.30 basis · up $2.50 from $101.80. Cash came out, but the strike moved up more than the credit.`;
    `pmcc-leaps-roll-confirm` enabled; no warning, no info note.
  - `OUT_DEBIT` → `Net Debit: $3.20 per share ($320.00 total)` in `text-wb-red`; label
    `Roll Out: same $80 strike, …`; `$25.00 / share (from $21.80)`; `$105.00 (from $101.80)`; note
    ends `You are buying time value; it lands in the basis.`; confirm enabled.
  - `TOO_MUCH_TIME` → `Net Debit: $11.00 per share ($1,100.00 total)`; `pmcc-leaps-roll-warning`
    (`AlertBox warning`) text contains
    `Open short strike $112.00 is below your effective share cost of $112.80 after this roll. If assigned, covering from the LEAPS realizes roughly $0.80 per share of loss.`;
    confirm enabled.
  - `SHORTENS` → `Net Debit: $0.60 per share ($60.00 total)`; `pmcc-leaps-roll-coverage-note`
    (`AlertBox info`) text `Replacement LEAPS is <n> DTE, 28 days shorter than the current LEAPS. It still covers the open short call.`
    (`<n>` computed; without the last sentence when `openShort` is null); label starts `Roll In:`;
    ruler not blocked; confirm enabled.
  - `STRIKE_ABOVE` (`112`) → the strike `Field` error
    `LEAPS strike must be below the short-call strike ($112.00).`; footer note
    `The XYZ $80.00 LEAPS stays open at <date>. No close or replacement leg is recorded.`; ruler **not**
    red; confirm disabled.
  - `UNCOVERS` (short's expiration) → the expiration `Field` error
    `LEAPS call must expire after the short call.`; ruler `data-blocked="true"` with the note
    `The replacement LEAPS expires on or before the short call. Past this point the short call is naked.`;
    the footer note; confirm disabled.
  - `NO_CHANGE` → `AlertBox error` `Roll must change the strike, the expiration, or both`; confirm disabled.
  - `ZERO_PROCEEDS` → `Proceeds from close must be greater than zero` beside the field, confirm
    disabled; `ZERO_DEBIT` → `Replacement debit must be greater than zero`.
  - With `openShort: null`, `STRIKE_ABOVE` and `UNCOVERS` values render **no** field error and the
    confirm is enabled; the warning never renders (no short strike to compare).
  - Footer always shows `Your draft is kept until the roll is valid. No order is placed.`; Cancel calls `onClose`.
- `RollPmccLeapsSheet.test.tsx` (mock `useRollPmccLeaps`): renders `role=dialog[aria-label="Roll LEAPS"]`
  in the sheet portal; Escape and the scrim call `onClose`; a valid submit calls `mutate` with
  `toRollPmccLeapsPayload` output and, on success, `onRecorded(response)`; a 400 `ApiError` with
  `field: 'newExpiration'` lands on the expiration `Field`, `newStrike` on the strike `Field`,
  `proceedsPerContract` on the proceeds field, `replacementDebitPerContract` on the debit field,
  `__roll__` on the no-change alert, and `__root__` / `__phase__` as `root.save` → `AlertBox error`
  `Could not record the roll. Your entries are preserved. Try again.`; the draft survives a failure; a
  double click while pending is ignored (`isPending` → `Recording…`).
- `PositionDetailPage.test.tsx`: `pmcc-leaps-roll-recorded-banner` text for the `UP_OUT` response:
  `Rolled — sold to close XYZ $80.00 CALL <exp> at $26.00, bought to open XYZ $85.00 CALL <exp> at $23.50. LEAPS roll #1 credit · $2.50 per share ($250.00 total). Both legs share one roll chain.`;
  a debit response reads `… LEAPS roll #1 debit · $3.20 per share ($320.00 total).`

**Green — implementation (the consolidated mockup's `RollLeapsSheet`, top to bottom):**

- `RollPmccLeapsSheet`: `createPortal(<SheetOverlay onClose><SheetPanel width={440}><div role="dialog" aria-label="Roll LEAPS" tabIndex={-1} onKeyDown={Escape → onClose}>…`
  — `useForm<RollPmccLeapsFormValues>({ mode: 'onChange', resolver: zodResolver(rollPmccLeapsSchema({ currentStrike, currentExpiration, openShort })), defaultValues: EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(today, currentStrike) })`;
  `useWatch` on the five fields; `useRollPmccLeaps({ onSuccess: onRecorded })`; `onError` →
  the shared `applyIpcFieldErrors(error, setError, fieldMap)` if US-104's Refactor extracted it,
  else a local `showRollErrors` modelled on it, with the field map `proceedsPerContract → proceeds`,
  `replacementDebitPerContract → newDebit`, `newStrike`, `newExpiration`, `__roll__`, else `root.save`.
- `RollPmccLeapsForm` sections, in order: `SheetHeader eyebrow="ROLL LEAPS" title="Roll LEAPS Call" subtitle=…`;
  `SectionCard header="Coverage" headerVariant="emphasized"` → `PmccCoverageRuler` with marks
  `[{ key: 'today', … }, { key: 'short', date: openShort?.expiration ?? null, label: 'Open short call', value: openShort ? '<date> · <n> DTE' : 'none', tone: 'secondary' }, { key: 'current', date: leaps.expiration, label: 'Current LEAPS (selling)', tone: 'green' }, { key: 'replacement', date: decided newExpiration | null, label: 'Replacement LEAPS (buying)', value: … | 'not entered', tone: 'accent' }]`,
  `fillTo` = the replacement when decided else the current LEAPS, `blocked` = the expiration error is
  the comparator message, and the three-way note from the mockup; `SectionCard header="Current LEAPS"`
  with the six `SummaryRow`s and the muted note; `SectionCard header="Open short call"` with the three
  rows + note or the no-short sentence; `SectionCard header="Replacement LEAPS"` with a two-column grid
  of `Field`s (`Proceeds from close / share`, `Debit (buy to open) / share`, `Strike`, `Expiration`
  with the `N DTE` hint, `Fill date`, read-only `Contracts`) using `NumberInput prefix="$"` and
  `Controller` + `DatePicker`; the dashed placeholder or `SectionCard header="Net" headerVariant="emphasized"`
  containing `data-testid="pmcc-leaps-roll-net"` (`Net Debit` / `Net Credit` + amount `text-wb-red` /
  `text-wb-green`), `data-testid="pmcc-leaps-roll-label"` (label ` · N DTE`), and the three
  `SummaryRow`s (`Cost basis after roll`, `LEAPS cost to date after`, `Effective share cost after roll`
  highlighted) with the re-anchoring note (`up` / `down` / `unchanged` from the current effective cost;
  debit → `You are buying time value; it lands in the basis.`, credit → `Cash came out, but the strike moved up more than the credit.`);
  `AlertBox variant="warning" data-testid="pmcc-leaps-roll-warning"` when `pmccStrikeShortfall(openShort.strike, effectiveAfter)`
  is non-null; `AlertBox variant="info" data-testid="pmcc-leaps-roll-coverage-note"` when the form is
  valid and `leapsCoverageChange` is negative; `AlertBox variant="error"` for `errors.__roll__`;
  `AlertBox variant="error"` for `errors.root?.save`; `SheetFooter` with the red stays-open note when
  the expiration error is the comparator message **or** the strike error is present,
  `FormButton Cancel` (secondary) + `FormButton label="Confirm roll" pendingLabel="Recording…" disabled={!isValid} data-testid="pmcc-leaps-roll-confirm"`,
  and the muted draft note. Tailwind `wb-*` tokens throughout.
- `PositionDetailPage`: `{rollPmccLeapsOpen && data.pmccOpenLegs && data.pmccLedger && <RollPmccLeapsSheet positionId ticker leaps={data.pmccOpenLegs.long} openShort={data.pmccOpenLegs.short} ledger={pick(data.pmccLedger, basisPerShare, leapsCostPerShare, effectiveShareCost)} onClose onRecorded={handlePmccLeapsRollRecorded} />}`;
  above `PositionDetailContent`, the banner switches on `pmccRollRecorded.kind`: `'leaps'` →
  `AlertBox variant="success" data-testid="pmcc-leaps-roll-recorded-banner"` built from `rollFromLeg`,
  `rollToLeg`, `leapsRollNumber` and `pmccRollNet({ received: rollFromLeg.premiumPerContract, paid: rollToLeg.premiumPerContract })`.

**Refactor — cleanup to consider:**

- `RollPmccShortCallSheet` and `RollPmccLeapsSheet` share the portal + RHF + mutation + error-routing
  skeleton; if they are byte-for-byte except the schema, hook, field map and form component, extract
  `useRollSheetForm` now — this is the second copy the US-104 plan said to wait for. Do not touch the
  wheel sheets.
- The `Current LEAPS` note and the `Net` card's re-anchoring note both spell "strike + basis"; if a
  small `effectiveCostSentence(strike, basis)` reads cleaner, extract it into `pmcc-roll.ts`.

**Acceptance criteria covered:**

- "The roll form shows the decision context for the open LEAPS", "Net credit preview for a roll up and
  out" (label, DTE, basis $19.30, effective $104.30 named as $85 + $19.30, up from $101.80), "Net debit
  preview for a roll out at the same strike" (confirm enabled), "Recording the roll …" (the banner's
  one net line; the refreshed `Leg reference` and `Cost basis` drawer), "Warning when the effective
  share cost after the roll rises above the open short strike", "Allow a replacement that shortens
  coverage" (advisory note, confirm enabled), "Roll the LEAPS while no short call is open" (`No short
call open` in place of the coverage context), and the UI half of the five rejection scenarios
  (message beside the field, confirm disabled, the $80 LEAPS stays open).

### 9. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-leaps-roll.spec.ts` — new; one `it` per AC scenario, one `it` per Scenario Outline row,
  names mirroring the Gherkin
- `e2e/pmcc-ledger-helpers.ts` — add `EXPIRE_2()` (`PMCC_SHORT_EXPIRED` at `localDate(95)`,
  `SHORT_CALL_EXPIRED` EXPIRE `112.0000` exp `localDate(95)` fill `localDate(95)`)
- `e2e/pmcc-roll-helpers.ts` (US-104's file; ★ create it if absent) — add `reachXyzLeapsRollBackground(page)`
  (= `createXyzPmcc` → `recordEvents([EXPIRE_1(), SHORT_2(), SHORT_ROLL()])` → `openXyzDetail`),
  `reachXyzNoShort(page)` (+ `EXPIRE_2()`), `openRollLeapsSheet(page)` (`roll-pmcc-leaps-btn` →
  `role=dialog[name="Roll LEAPS"]`), `fillLeapsRoll(page, { proceeds, strike, debit, expiration })`
  (`#pmcc-leaps-roll-*`, `selectDate` for the expiration), `rollLeaps(page, payload)`
  (`window.api.rollPmccLeaps`), and the date constants `LEAPS_EXP = localDate(368)`,
  `SHORT_EXP = localDate(95)`, `UP_OUT_EXP = localDate(494)`, `TOO_MUCH_EXP = localDate(860)`,
  `SHORTENS_EXP = localDate(340)`, `BEFORE_SHORT_EXP = localDate(81)`; reuse `fieldError`,
  `confirmButton`, `rollSheet`, `monthYearLabel(iso)` (`MMM yyyy`), `dteOf(iso)`
- Existing specs and helpers: **unchanged** (`pmcc-short-call-roll.spec.ts`, `pmcc-cost-basis.spec.ts`,
  `cc-roll.spec.ts`, `open-pmcc-position.spec.ts`, `position-cockpit.spec.ts` must still pass)

**Red — tests to write (AC audit — every AC row appears exactly once):**

- `The roll form shows the decision context for the open LEAPS` — Background → open the sheet; the
  dialog text contains `XYZ $80.00 CALL`, `LEAPS_EXP`, `${dteOf(LEAPS_EXP)} DTE`, `Bought at` with
  `$25.00 / share`, `Open short call`, `XYZ $112.00 CALL`, `SHORT_EXP`, `${dteOf(SHORT_EXP)} DTE`,
  `Cost basis` with `$21.80 / share`, `Effective share cost` with `$101.80`; the five inputs
  `#pmcc-leaps-roll-proceeds`, `#pmcc-leaps-roll-strike`, `#pmcc-leaps-roll-expiration`,
  `#pmcc-leaps-roll-debit`, `#pmcc-leaps-roll-fill-date` are visible; `pmcc-leaps-roll-net` is absent
  and the placeholder text is present.
- `Net credit preview for a roll up and out` — fill `26.00` / `85` / `UP_OUT_EXP` / `23.50`;
  `pmcc-leaps-roll-net` text is `Net Credit: $2.50 per share ($250.00 total)`; `pmcc-leaps-roll-label`
  text starts `Roll Up & Out: $80 to $85 strike, ${monthYearLabel(LEAPS_EXP)} to ${monthYearLabel(UP_OUT_EXP)} expiration`
  and ends `${dteOf(UP_OUT_EXP)} DTE`; the dialog contains `Cost basis after roll` with
  `$19.30 / share`, `Effective share cost after roll` with `$104.30 (from $101.80)` and
  `$85.00 strike + $19.30 basis · up $2.50`; `pmcc-leaps-roll-confirm` is enabled.
- `Net debit preview for a roll out at the same strike` — fill `26.00` / `80` / `UP_OUT_EXP` / `29.20`;
  net text `Net Debit: $3.20 per share ($320.00 total)`; label `Roll Out: same $80 strike, … expiration`;
  `$25.00 / share`; `$105.00`; confirm enabled.
- `Recording the roll creates a linked leg pair and one net cost-basis line` — fill the up-and-out
  values, click confirm; the dialog detaches; `pmcc-leaps-roll-recorded-banner` contains
  `sold to close XYZ $80.00 CALL`, `bought to open XYZ $85.00 CALL`, `LEAPS roll #1 credit` and
  `$2.50 per share`; `window.api.getPosition(id)`: `legs` has a new `ROLL_FROM` with `action 'SELL'`,
  `strike '80.0000'`, `expiration LEAPS_EXP`, `premiumPerContract '26.0000'` and a new `ROLL_TO` with
  `action 'BUY'`, `strike '85.0000'`, `expiration UP_OUT_EXP`, `premiumPerContract '23.5000'`, sharing
  a non-null `rollChainId` that differs from the `SHORT_ROLL` chain's; `pmccLedger.basisPerShare === '19.3000'`,
  `pmccLedger.leapsCostPerShare === '22.5000'`, `pmccLedger.effectiveShareCost === '104.3000'`;
  `allSnapshots` has 5 rows, the last with `triggerEvent 'PMCC_LEAPS_ROLL'` and `basisPerShare '19.3000'`;
  `pmccOpenLegs.long.strike === '85.0000'` and `pmccOpenLegs.short` is the same `id` as before with
  `strike '112.0000'` and `expiration SHORT_EXP`; on the page, `cell(page, 'Cost basis / share')` is
  `$19.30`, `cell(page, 'LEAPS cost to date')` is `$22.50`, `cell(page, 'Effective share cost')` is
  `$104.30`, and the `Buy LEAPS call` card shows `$85.00` while `Sell short call` still shows `$112.00`.
- `Warning when the effective share cost after the roll rises above the open short strike` — fill
  `26.00` / `80` / `TOO_MUCH_EXP` / `37.00`; net text `Net Debit: $11.00 per share ($1,100.00 total)`;
  `pmcc-leaps-roll-warning` text contains
  `Open short strike $112.00 is below your effective share cost of $112.80 after this roll. If assigned, covering from the LEAPS realizes roughly $0.80 per share of loss.`;
  confirm enabled.
- `Reject a replacement strike that is not below the open short strike — $112.00` — fill `26.00` /
  `112` / `UP_OUT_EXP` / `23.50`; `fieldError('pmcc-leaps-roll-strike')` is
  `LEAPS strike must be below the short-call strike ($112.00).`; confirm disabled.
- `Reject a replacement strike that is not below the open short strike — $115.00` — same with `115`;
  same error; confirm disabled; then bypass `rollLeaps(page, { positionId, proceedsPerContract: 26, replacementDebitPerContract: 23.5, newStrike: 115, newExpiration: UP_OUT_EXP })`
  → `{ ok: false }` with `errors[0]` `{ field: 'newStrike', code: 'strike_not_below_short' }`;
  `tableCount(dbPath, 'legs') === 6`.
- `Reject a replacement expiration that would leave the short call uncovered — on the short's expiration` —
  fill `26.00` / `85` / `SHORT_EXP` / `20.20`; `fieldError('pmcc-leaps-roll-expiration')` is
  `LEAPS call must expire after the short call.`; the ruler has `data-blocked="true"`; the footer note
  `The XYZ $80.00 LEAPS stays open at ${LEAPS_EXP}. No close or replacement leg is recorded.`; confirm
  disabled; then bypass `rollLeaps(page, { …, newStrike: 85, newExpiration: SHORT_EXP })` →
  `{ ok: false }` with `errors[0]` `{ field: 'newExpiration', code: 'long_not_after_short', message: 'LEAPS call must expire after the short call.' }`;
  `tableCount(dbPath, 'legs') === 6`; `getPosition(id).pmccOpenLegs.long.strike === '80.0000'` and
  `.long.expiration === LEAPS_EXP`; `snapshots(page, id)` has length 4.
- `Reject a replacement expiration that would leave the short call uncovered — before the short's expiration` —
  fill with `BEFORE_SHORT_EXP`; same field error; confirm disabled; the bypass with `BEFORE_SHORT_EXP`
  → the same envelope; `tableCount(dbPath, 'legs') === 6`.
- `Allow a replacement that shortens coverage but still outlasts the short call` — fill `26.00` / `80`
  / `SHORTENS_EXP` / `26.60`; net text `Net Debit: $0.60 per share ($60.00 total)`;
  `pmcc-leaps-roll-coverage-note` text is
  `Replacement LEAPS is ${dteOf(SHORTENS_EXP)} DTE, 28 days shorter than the current LEAPS. It still covers the open short call.`;
  no `pmcc-leaps-roll-warning`; the ruler is not blocked; confirm enabled.
- `Reject a roll that changes neither strike nor expiration` — fill `26.00` / `80` / `LEAPS_EXP` / `26.00`;
  the dialog contains `Roll must change the strike, the expiration, or both`; confirm disabled.
- `Reject non-positive proceeds from close` — fill `0.00` / `85` / `UP_OUT_EXP` / `23.50`;
  `fieldError('pmcc-leaps-roll-proceeds')` is `Proceeds from close must be greater than zero`; confirm disabled.
- `Reject non-positive replacement debit` — fill `26.00` / `85` / `UP_OUT_EXP` / `0.00`;
  `fieldError('pmcc-leaps-roll-debit')` is `Replacement debit must be greater than zero`; confirm disabled.
- `Roll the LEAPS while no short call is open` — `reachXyzNoShort`; `roll-pmcc-short-btn` count is 0 and
  `roll-pmcc-leaps-btn` is visible; open the sheet; the dialog contains `No short call open` and the
  legend row `Open short call` with `none`; fill `26.00` / `112` / `SHORT_EXP` / `23.50` (values that
  would fail both shape checks) → **no** field error on strike or expiration and confirm enabled;
  change to `85` / `UP_OUT_EXP`, click confirm; `getPosition(id).pmccLedger.basisPerShare === '19.3000'`,
  `pmccOpenLegs.short === null`, `pmccOpenLegs.long.strike === '85.0000'`; `allSnapshots` has 6 rows
  ending `PMCC_LEAPS_ROLL`.
- `Leave a classic wheel unaffected` — `reachCcOpenState(page, '185', '2.50', localDate(30))`;
  `roll-pmcc-leaps-btn` and `roll-pmcc-short-btn` are absent; click `roll-cc-btn`; the sheet text
  contains `Roll Covered Call` and does not contain `Effective share cost`, `LEAPS` or `Roll LEAPS`.

**Green — implementation:**

- Only test code: the spec and helper files above. Launch with
  `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })` so the US-103 seam is registered; `afterEach` →
  `closePmcc`.

**Refactor — cleanup to consider:**

- `pmcc-roll-helpers.ts` now serves two roll specs; keep the shared selectors (`fieldError`,
  `confirmButton`, `rollSheet`) generic and the per-sheet openers / fillers named by sheet.

**Acceptance criteria covered:**

- All fifteen rows (nine scenarios, three two-row outlines), one `it` each — see the AC Audit.

## AC Audit

| Linear AC (Gherkin)                                                                    | E2e test (Area 9)                                                                                           | Unit / integration coverage                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| The roll form shows the decision context for the open LEAPS                            | `The roll form shows the decision context for the open LEAPS`                                               | Areas 7, 8                                            |
| Net credit preview for a roll up and out                                               | `Net credit preview for a roll up and out`                                                                  | Areas 6, 8                                            |
| Net debit preview for a roll out at the same strike                                    | `Net debit preview for a roll out at the same strike`                                                       | Areas 2, 6, 8                                         |
| Recording the roll creates a linked leg pair and one net cost-basis line               | `Recording the roll creates a linked leg pair and one net cost-basis line`                                  | Areas 2, 3, 4, 5, 7, 8                                |
| Warning when the effective share cost after the roll rises above the open short strike | `Warning when the effective share cost after the roll rises above the open short strike`                    | Areas 6, 8                                            |
| Outline: replacement strike $112.00                                                    | `Reject a replacement strike that is not below the open short strike — $112.00`                             | Areas 1, 2, 6, 8                                      |
| Outline: replacement strike $115.00                                                    | `Reject a replacement strike that is not below the open short strike — $115.00`                             | Areas 1, 2, 4, 5, 6, 8                                |
| Outline: replacement expiration 2027-07-16 (= short)                                   | `Reject a replacement expiration that would leave the short call uncovered — on the short's expiration`     | Areas 1, 2, 4, 5, 6, 7, 8                             |
| Outline: replacement expiration 2027-07-02 (< short)                                   | `Reject a replacement expiration that would leave the short call uncovered — before the short's expiration` | Areas 1, 2, 4, 6, 8                                   |
| Allow a replacement that shortens coverage but still outlasts the short call           | `Allow a replacement that shortens coverage but still outlasts the short call`                              | Areas 2, 6, 8                                         |
| Reject a roll that changes neither strike nor expiration                               | `Reject a roll that changes neither strike nor expiration`                                                  | Areas 2, 6, 8                                         |
| Outline: proceeds from close $0.00                                                     | `Reject non-positive proceeds from close`                                                                   | Areas 2, 3, 6, 8                                      |
| Outline: replacement debit $0.00                                                       | `Reject non-positive replacement debit`                                                                     | Areas 2, 3, 6, 8                                      |
| Roll the LEAPS while no short call is open                                             | `Roll the LEAPS while no short call is open`                                                                | Areas 2, 4, 6, 7, 8                                   |
| Leave a classic wheel unaffected                                                       | `Leave a classic wheel unaffected`                                                                          | Area 7 (actions regression); untouched `rollCc` suite |

Every AC row maps to exactly one e2e test. No uncovered ACs.

## Out of scope (per Linear, restated so tasks do not drift)

- Rolling the short call (US-104 — consumed, not rebuilt), selling a subsequent short call (US-115),
  short-call assignment (US-111), closing the PMCC outright (US-120).
- The comparator's ownership and any renaming of its codes (US-102); the cost-basis formula, labels,
  snapshot chain and re-anchoring (US-103 — already implemented); rendering the "LEAPS roll #1 credit"
  history line in the timeline (US-109; the banner names it until then).
- The LEAPS DTE alert and any deep link from it into this sheet (US-107); IVR / term-structure context
  on this sheet (US-113, US-114); the final PMCC header-action set and two-lane hero (US-118).
- Delta, remaining extrinsic, chain-driven strike selection, liquidity checks, quote-based figures; a
  minimum replacement DTE preference (guidance, not validation); broker-executed rolls (Epic 10).
- Partial rolls, quantity changes, a different underlying, adjusted contracts; editing a recorded roll.
- Fees on the roll legs (no input in the AC or either mockup; legs write `fees = '0.0000'`).
