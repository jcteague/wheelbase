---
story: us-104
kind: feature
parent: null
topics: [wheel-lifecycle, cost-basis, ipc-handlers, zod-schemas, position-detail, pmcc]
status: planned
---

# Implementation Plan: US-104 — Roll the PMCC short call with net credit/debit preview

## Summary

Add the PMCC short-call roll: a pure `rollPmccShortCall` lifecycle rule set (phase, open short,
positive money, US-102's coverage comparator, on-or-after-current, no-change), a service that writes
the linked `ROLL_FROM` BUY / `ROLL_TO` SELL pair and calls US-103's `appendPmccSnapshot` with
`'PMCC_SHORT_ROLL'` in one transaction, the `positions:roll-pmcc-short` channel, and the `Roll Short
Call` sheet from the consolidated detail mockup — coverage ruler, live `Net Debit / Net Credit`
preview with the roll label and replacement DTE, post-roll basis and effective share cost, and the
advisory below-effective-cost warning. Done when every Linear scenario passes end to end from the
US-103 Background (XYZ, $108 short, basis $21.20), the roll lands as one chain and one snapshot
reading $21.80, and the wheel's covered-call roll is unchanged.

Estimated at **5 points**. Areas 1–6 are main-process plus transport; 7–9 are the renderer; 10 is
the AC-driven e2e suite. **Depends on US-103 (`wb-103`) having landed** — see quickstart.md.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-12](https://linear.app/optionswheel/issue/OPT-12/us-104-roll-the-pmcc-short-call-with-net-creditdebit-preview)
- **Layout of record:** `mockups/epic-09-pmcc-position-detail.mdx` — the `RollShortSheet` function and the `rs-entry`, `rs-up-out`, `rs-out-credit`, `rs-below-cost`, `rs-outlasts`, `rs-rolls-in`, `rs-no-change`, `rs-zero-cost`, `rs-recorded` presets (`mockups/us-104-roll-pmcc-short-call.mdx` is design history and agrees)
- **Research & Design Decisions:** `plans/us-104/research.md`
- **Data Model & Type Design:** `plans/us-104/data-model.md`
- **API Contracts:** `plans/us-104/contracts/positions-roll-pmcc-short.md`, `plans/us-104/contracts/positions-get.md`
- **Quickstart & Verification:** `plans/us-104/quickstart.md`
- **Spec pages this builds on:** `docs/spec/features/us-14-roll-cc.md` (the roll-pair precedent), `docs/spec/features/us-101-open-pmcc-position.md`, `plans/us-103/` (`research.md` ADRs "appendPmccSnapshot is the one writer" and "Contributions are classified by leg role → side and signed by action"), ADRs `rolls-as-linked-leg-pairs`, `soft-client-side-warnings`, `server-side-dte-and-derived-fields`, `sheet-component-pattern`

## Prerequisites

Already in place on `wb-103` (verify with the `grep` lines in quickstart.md):

- US-103: `appendPmccSnapshot`, `pmccLedgerFromLegs`, `currentLongStrike` / private `newestLongBuy`
  in `src/main/services/pmcc-ledger.ts`; `groupRollChains` + `RollChain` in `roll-chains.ts`;
  `readLegs` in `leg-rows.ts`; `PmccTriggerEvent` with `'PMCC_SHORT_ROLL'`; `GetPositionResult.pmccLedger`;
  `PmccCostBasis` drawer; the `_test:pmcc-record-leg-event` seam and `e2e/pmcc-ledger-helpers.ts`;
  `src/main/services/test-fixtures/pmcc-legs.ts`.
- US-101: `LEAPS_OPEN` / `SHORT_CALL_OPEN` legs with `fees`; `PmccLegReference`; `pmccCrossLegIssues`.
- US-14: `RollPayloadBaseSchema`, `RollResultBase`, `registerParsedPositionHandler`, `usePositionMutation`,
  the `Sheet*` / `Field` / `NumberInput` / `DatePicker` / `AlertBox` primitives, `e2e/helpers.ts#reachCcOpenState`.
- No migration: `legs` and `cost_basis_snapshots` already hold everything the roll writes.

## Implementation Areas

### 1. Shared coverage comparator (the short-side half of US-102's extraction)

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts` — export `SHORT_NOT_BEFORE_LONG` and `shortExpiresBeforeLeaps`; make the inline `short.expiration >= long.expiration` rule in `pmccCrossLegIssues` use them
- `src/main/core/pmcc-rules.test.ts` — new cases
- `src/main/core/pmcc-rules.property.test.ts` — new file

**Red — tests to write:**

- `pmcc-rules.test.ts`: `shortExpiresBeforeLeaps('2026-10-16', '2027-09-17')` is `true`; equal dates → `false`; later short → `false`. `SHORT_NOT_BEFORE_LONG` equals `{ code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }`. Regression: the existing `pmccCrossLegIssues` case for `short.expiration` ≥ `long.expiration` still reports `('short.expiration', 'short_not_before_long', 'Short call must expire before the LEAPS call.')` and the valid pair still yields `[]`.
- `pmcc-rules.property.test.ts` (**property — guard/iff**): for any two `isoDay` values, `shortExpiresBeforeLeaps(a, b) === (a < b)`; and `pmccCrossLegIssues` over a valid pair with only the two expirations varied contains a `short_not_before_long` issue **iff** `!shortExpiresBeforeLeaps(short, long)`.

**Green — implementation:**

- `export const SHORT_NOT_BEFORE_LONG = { code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' } as const satisfies Pick<PmccIssue, 'code' | 'message'>` and `export const shortExpiresBeforeLeaps = (shortExpiration: string, longExpiration: string): boolean => shortExpiration < longExpiration` (ISO strings compare as dates, as the file already states).
- `pmccCrossLegIssues` spreads the constant: `...issueIf(both defined && !shortExpiresBeforeLeaps(short.expiration, long.expiration), 'short.expiration', SHORT_NOT_BEFORE_LONG.code, SHORT_NOT_BEFORE_LONG.message)`.

**Refactor — cleanup to consider:**

- If `issueIf` reads better taking a `{ code, message }` pair, change its signature once for all seven rules; otherwise leave the call sites alone.

**Acceptance criteria covered:**

- Foundation for "Reject a replacement expiration that would outlast the LEAPS — rejected by the shared US-102 comparator, with that story's message".

### 2. Pure lifecycle rule set: `rollPmccShortCall`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — `RollPmccShortCallInput`, `RollPmccShortCallResult`, `rollPmccShortCall`
- `src/main/core/lifecycle.test.ts` — new describe block
- `src/main/core/lifecycle.property.test.ts` — new cases

**Red — tests to write (`lifecycle.test.ts`, `describe('rollPmccShortCall')`, fixture: phase `PMCC_OPEN`, `openShort { strike '108.0000', expiration '2026-11-20' }`, `leapsExpiration '2027-09-17'`):**

- Roll up & out (`112.0000`, `2026-12-18`, cost `3.0000`, premium `2.4000`) → `{ phase: 'PMCC_OPEN' }` (a debit is valid).
- Roll out at the same strike (`108.0000`, `2026-12-18`, `1.1000`, `2.3000`) → `PMCC_OPEN`.
- Every rejection in the research.md rule table, asserted as `ValidationError` `{ field, code, message }`: phase `CC_OPEN` → `__phase__` / `invalid_phase`; `openShort: null` → `__root__` / `no_open_short_call` / `This PMCC has no open short call to roll.`; cost `0.0000` → `costToClosePerContract` / `must_be_positive` / `Cost to close must be greater than zero`; premium `0.0000` → `newPremiumPerContract` / `must_be_positive` / `Replacement premium must be greater than zero`; strike `0.0000` → `newStrike` / `must_be_positive`; expiration `2027-09-17` and `2027-10-15` → `newExpiration` / `short_not_before_long` / `Short call must expire before the LEAPS call.`; expiration `2026-11-13` → `newExpiration` / `must_be_on_or_after_current` / `Replacement expiration must be on or after the current expiration (Nov 20, 2026)`; `108.0000` + `2026-11-20` → `__roll__` / `no_change` / `Roll must change the strike, the expiration, or both`.
- Order: `openShort: null` with phase `CC_OPEN` reports the phase; cost `0` with expiration `2027-09-17` reports the cost; expiration `2027-09-17` with the same strike as current reports the comparator, not no-change.
- Same expiration, different strike (`Roll Up`) is accepted.

**Red — properties (`lifecycle.property.test.ts`):**

- **Guard**: add `rollPmccShortCall` to the `phase guards` table with `requiredPhase: 'PMCC_OPEN'` — every other `wheelPhase` throws `__phase__` / `invalid_phase`.
- **Guard (coverage)**: for `orderedDays(2)` as `[leaps, replacement]` (replacement ≥ LEAPS) and any positive money, the error is `newExpiration` / `short_not_before_long` — regardless of the current short's expiration.
- **Invariant**: for `orderedDays(3)` as `[current, replacement, leaps]` with `replacement < leaps`, `positiveMoney()` for cost / premium / strike and a strike different from current, the result is `{ phase: 'PMCC_OPEN' }`.

**Green — implementation:**

- The types and function per research.md § ADR "`rollPmccShortCall`", reusing `requirePositiveDecimal` (field + label), `requirePositiveStrike(strike, 'newStrike')`, `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG` from `pmcc-rules.ts`, and `date-fns` `format(parseISO(openShort.expiration), 'MMM d, yyyy')` for rule 7. Strike equality via `new Decimal(a).eq(b)`. No logging, no I/O imports.

**Refactor — cleanup to consider:**

- `rollCc` and `rollPmccShortCall` both check "on or after current" and "no change"; if a private `requireRollChanges(current, next, field)` helper reads cleaner for both, extract it — only if `rollCc`'s messages stay byte-identical (its message differs: `Roll must change at least one of strike or expiration`).

**Acceptance criteria covered:**

- "Reject a replacement expiration that would outlast the LEAPS", "Reject a roll that changes neither strike nor expiration", "Reject a replacement expiration earlier than the current short call", "Reject a non-positive cost to close or replacement premium", "Reject a roll when the PMCC has no open short call"; engine side of "Recording the roll" (a debit is accepted).

### 3. Open-leg selectors and `pmccOpenLegs` on `positions:get`

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts` — export `currentLeapsLeg` (the existing `newestLongBuy`), add `currentShortCallLeg`, `pmccOpenLegs`, `PmccOpenLegs`
- `src/main/services/pmcc-ledger.test.ts` — new cases
- `src/main/schemas.ts` — `GetPositionResult.pmccOpenLegs: PmccOpenLegs | null` (import the type from the service module)
- `src/main/services/get-position.ts` — compute `pmccOpenLegs` beside `pmccLedger`
- `src/main/services/get-position.test.ts` — new cases
- `src/main/ipc/positions.test.ts` — the `positions:get` envelope carries `pmccOpenLegs` through
- `src/renderer/src/api/positions.ts` — re-export `PmccOpenLegs`; renderer test fixtures that build a `PositionDetail` gain `pmccOpenLegs: null`

**Red — tests to write:**

- `pmcc-ledger.test.ts` (using `test-fixtures/pmcc-legs.ts` rows): `currentShortCallLeg(OPEN)` is the `SHORT_CALL_OPEN`; after `EXPIRE_1` → `null`; after `SHORT_2` → the $108 `SHORT_CALL_OPEN`; after `SHORT_ROLL` → the `ROLL_TO` ($112); after `LEAPS_ROLL` (a long-side chain) the short is unchanged; a `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` row closes it. `currentLeapsLeg` after `LEAPS_ROLL` is the $85 `ROLL_TO`. `pmccOpenLegs([])` is `null`; `pmccOpenLegs(OPEN + EXPIRE_1)` is `{ long: LEAPS_OPEN, short: null }`.
- `get-position.test.ts`: a PMCC created by `createPmccPosition` returns `pmccOpenLegs.long.legRole === 'LEAPS_OPEN'` and `.short.legRole === 'SHORT_CALL_OPEN'`; after inserting the `SHORT_ROLL` rows `.short` is the `ROLL_TO` with `strike '112.0000'`; a wheel position returns `pmccOpenLegs: null`.
- `ipc/positions.test.ts`: `positions:get` returns `pmccOpenLegs` unchanged from the service result.

**Green — implementation:**

- `currentShortCallLeg(legs)`: fold over `legs` (already in `readLegs` order) with the chains from `groupRollChains(legs)`: `SHORT_CALL_OPEN` → open; `SHORT_CALL_EXPIRED | SHORT_CALL_CLOSE | SHORT_CALL_ASSIGNED` → null; a short-side chain (`rollFrom.action === 'BUY'`) → its `rollTo`. Implement as a `reduce` over a merged, date-ordered list of non-roll legs and chains (the same `byFillThenCreated` ordering `contributionsFrom` uses), not an imperative loop.
- `pmccOpenLegs(legs): PmccOpenLegs | null` = `long === null ? null : { long, short: currentShortCallLeg(legs) }`.
- `getPosition`: `const pmccOpenLegs = isPmcc ? pmccOpenLegs(legs) : null`; add to the return.

**Refactor — cleanup to consider:**

- `contributionsFrom`, `newestLongBuy` and the new selector all merge legs with chains and sort by fill then created; if a shared `orderedLedgerEvents(legs, chains)` removes the triplication, extract it in this area.

**Acceptance criteria covered:**

- "The roll form shows the decision context for the open short call" (the open $108 short and the $80 LEAPS as read-only context); "the PMCC still shows one open LEAPS and one open short call"; "Reject a roll when the PMCC has no open short call" (the service's source of truth for rule 2).

### 4. Payload schema and result type

**Files to create or modify:**

- `src/main/schemas.ts` — `RollPmccShortCallPayloadSchema`, `RollPmccShortCallPayload`, `RollPmccShortCallResult`
- `src/main/schemas.pmcc.test.ts` — new cases

**Red — tests to write:**

- `RollPmccShortCallPayloadSchema.parse` accepts the contract's example and rejects `costToClosePerContract: 0` (`positive`), a non-ISO `newExpiration`, and a missing `positionId`; `newStrike` and `fillDate` are optional.
- Type-level (`expectTypeOf` in the same file): `RollPmccShortCallResult['position']['phase']` is `'PMCC_OPEN'`; `RollPmccShortCallResult['costBasisSnapshot']['triggerEvent']` is `'PMCC_SHORT_ROLL'`; `RollPmccShortCallResult extends RollResultBase`.

**Green — implementation:**

- `export const RollPmccShortCallPayloadSchema = RollPayloadBaseSchema` (next to `RollCcPayloadSchema`), `export type RollPmccShortCallPayload = z.infer<...>`.
- `export interface RollPmccShortCallResult extends RollResultBase { position: { id; ticker; phase: 'PMCC_OPEN'; status: 'ACTIVE' }; costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_ROLL'; finalPnl: null }; ledger: PmccLedgerResult; shortCallRollNumber: number }` per data-model.md § 4.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with `RollCspResult` / `RollCcResult`.

**Acceptance criteria covered:**

- Transport shape for "Recording the roll creates a linked leg pair and one net cost-basis line".

### 5. `rollPmccShortCallPosition` service

**Files to create or modify:**

- `src/main/services/roll-pmcc-short-call-position.ts` — new
- `src/main/services/roll-pmcc-short-call-position.test.ts` — new
- `src/main/services/pmcc-cost-basis-chain.test.ts` — one new chain case through the real service
- `src/main/services/positions.ts` — re-export (or import directly in the IPC file, matching `rollCcPosition`)

**Red — tests to write (`roll-pmcc-short-call-position.test.ts`; Background = `createPmccPosition` + insert `EXPIRE_1` and `SHORT_2` rows from `test-fixtures/pmcc-legs.ts`, snapshots via `appendPmccSnapshot` so the chain is realistic):**

- Happy path (cost `3.0`, premium `2.4`, strike `112`, expiration +95d): result has `rollFromLeg` `ROLL_FROM` / `BUY` / `CALL` / `108.0000` / current expiration / `3.0000` / `fees '0.0000'`; `rollToLeg` `ROLL_TO` / `SELL` / `112.0000` / new expiration / `2.4000`; both `rollChainId` equal and non-null; `costBasisSnapshot.triggerEvent === 'PMCC_SHORT_ROLL'`, `basisPerShare '21.8000'`, `totalPremiumCollected '320.0000'`; `ledger.basisTotal '2180.0000'`, `ledger.effectiveShareCost '101.8000'`; `shortCallRollNumber === 1`; `position.phase 'PMCC_OPEN'`.
- DB state after: `legs` count +2; the newest `cost_basis_snapshots` row matches the result; the `positions` row's `phase` and `updated_at` unchanged; `getPosition(...).pmccOpenLegs.short.strike === '112.0000'`.
- Credit roll (cost `1.1`, premium `2.3`, strike omitted → defaults to `108.0000`): `basisPerShare '20.0000'`.
- A second roll on the same position → `shortCallRollNumber === 2` and two chains.
- `fillDate` omitted → both legs' `fillDate === localToday()`.
- Rejections propagate as `ValidationError` with the engine's field/code and write nothing (assert leg and snapshot counts unchanged): no open short (Background without `SHORT_2`) → `no_open_short_call`; replacement = LEAPS expiration → `short_not_before_long`; unknown id → `not_found`; a wheel position id → `__phase__` / `invalid_phase`.
- Rollback: install `CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;` on the test DB → the call throws, `legs` count unchanged (no orphan `ROLL_FROM`), snapshot count unchanged.
- `pmcc-cost-basis-chain.test.ts`: OPEN → EXPIRE_1 → SHORT_2 (seam/fixture rows) → **`rollPmccShortCallPosition`** → snapshots read `23.0000, 23.0000, 21.2000, 21.8000` with triggers `PMCC_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_OPEN, PMCC_SHORT_ROLL`.

**Green — implementation:**

- The service per research.md § ADR "`rollPmccShortCallPosition`": `getPosition` → `pmccOpenLegs(detail.legs)` → 4-dp formatting (`new Decimal(x).toFixed(4)`), `newStrike ?? openShort.strike` → `rollPmccShortCall({ currentPhase, openShort: { strike, expiration }, leapsExpiration: long.expiration, ... })` → `db.transaction(() => { insert ROLL_FROM; insert ROLL_TO; return appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_SHORT_ROLL', eventDate: fillDate, now }) })()`. `shortCallRollNumber = groupRollChains(detail.legs).filter((c) => c.rollFrom.action === 'BUY').length + 1`.
- Logging per research.md § ADR "Logging" (INFO `pmcc_short_call_rolled`, INFO `pmcc_short_roll_rejected` on `ValidationError`, DEBUG inputs and tx checkpoints).

**Refactor — cleanup to consider:**

- The two leg inserts duplicate `roll-cc-position.ts` / `roll-csp-position.ts` SQL and `test-pmcc-ledger.ts#INSERT_LEG_SQL`; if an `insertLegRow(db, row)` in `leg-rows.ts` serves all four without changing the wheel services' behaviour, extract it and use it here and in the test seam (leave the wheel services for a later pass unless the change is mechanical).

**Acceptance criteria covered:**

- "Recording the roll creates a linked leg pair and one net cost-basis line" (ROLL_FROM BUY $108 @ $3.00, ROLL_TO SELL $112 @ $2.40, one chain, basis $21.80 by US-103, one open LEAPS and one open short); "Reject a roll when the PMCC has no open short call … no leg and no cost-basis snapshot are recorded"; the bypass half of "Reject a replacement expiration that would outlast the LEAPS … no ROLL_FROM or ROLL_TO leg is recorded".

### 6. IPC handler, preload, renderer adapter and hook

**Files to create or modify:**

- `src/main/ipc/positions.ts` — `positions:roll-pmcc-short`
- `src/main/ipc/positions.test.ts` — new cases
- `src/preload/index.ts` — `rollPmccShortCall: (payload: unknown) => invoke('positions:roll-pmcc-short', payload)`
- `src/preload/index.d.ts` — `IpcRollPmccShortCallResult = IpcResult<RollPmccShortCallResult>`; the `api` entry typed `(payload: RollPmccShortCallPayload) => Promise<IpcRollPmccShortCallResult>`
- `src/renderer/src/api/positions.ts` — `RollPmccShortCallPayload`, `RollPmccShortCallResponse`, `rollPmccShortCall()`
- `src/renderer/src/api/positions.test.ts` — new cases
- `src/renderer/src/hooks/useRollPmccShortCall.ts` — new (one-liner over `usePositionMutation`, like `useRollCc`)

**Red — tests to write:**

- `ipc/positions.test.ts`: the channel is registered; a valid payload calls `rollPmccShortCallPosition(db, positionId, parsed)` and returns `{ ok: true, ...result }`; a payload with `costToClosePerContract: 0` returns `{ ok: false, errors: [{ field: 'costToClosePerContract', … }] }` without calling the service; a service `ValidationError('newExpiration', 'short_not_before_long', …)` returns that envelope; a generic throw returns `internal_error`.
- `api/positions.test.ts`: `rollPmccShortCall` passes the payload through unchanged, throws an `ApiError` status 400 carrying the field errors on `{ ok: false }`, returns the body on success.

**Green — implementation:**

- `registerParsedPositionHandler(db, 'positions:roll-pmcc-short', 'positions_roll_pmcc_short_unhandled_error', RollPmccShortCallPayloadSchema, rollPmccShortCallPosition)` — nothing else in the handler file.
- Preload, `index.d.ts`, adapter and hook mirroring the `rollCc` trio exactly (camelCase end to end; no mapping).

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Transport for every scenario that records or rejects a roll.

### 7. Renderer pure helpers and the form schema

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-roll.ts` — `pmccRollNet`, `pmccRollLabel`, `pmccPostRollEffectiveCost`, `pmccStrikeShortfall`
- `src/renderer/src/lib/pmcc-roll.test.ts` — new
- `src/renderer/src/schemas/roll-pmcc-short-call.ts` — `RollPmccShortCallContext`, `rollPmccShortCallSchema(ctx)`, `RollPmccShortCallFormValues`, `EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today)`, `toRollPmccShortCallPayload(values, positionId)`
- `src/renderer/src/schemas/roll-pmcc-short-call.test.ts` — new

**Red — tests to write:**

- `pmcc-roll.test.ts`: `pmccRollNet({ costToClose: '3.00', premium: '2.40', contracts: 1 })` → `{ isDebit: true, perShare: '0.60', total: '60.00' }`; `('1.10', '2.30')` → credit `1.20` / `120.00`; 3 contracts → total `180.00`; `''` or `'2.'` in either field → `null`; `'0'` → `null`. `pmccRollLabel` for the four fixtures: `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration`; `Roll Out: same $108 strike, Nov to Dec expiration`; same expiration higher strike → `Roll Up: $108 to $112 strike, same Nov expiration`; lower strike later month → `Roll Down & Out: …`; same month different day → `Nov 20 to Nov 27 expiration`; nothing changed → `null`; a `112.5000` strike prints `$112.5`. `pmccPostRollEffectiveCost({ basisPerShare: '21.2000', leapsStrike: '80.0000', net })` → `{ postBasis: '21.80', effectiveAfter: '101.80' }` for the debit and `'20.00' / '100.00'` for the credit. `pmccStrikeShortfall('98', '101.70')` → `'3.70'`; `('112', '101.80')` → `null`; `('101.70', '101.70')` → `null`.
- `roll-pmcc-short-call.test.ts` (ctx: current `108.0000` / `2026-11-20`, LEAPS `2027-09-17`): the `UP_OUT` values parse; `newExpiration '2027-09-17'` → issue at `['newExpiration']` with `SHORT_NOT_BEFORE_LONG.message`; `'2026-11-13'` → `Replacement expiration must be on or after the current expiration (Nov 20, 2026)`; `108` + `'2026-11-20'` → issue at `['__roll__']` with `Roll must change the strike, the expiration, or both`; `costToClose '0.00'` → `Cost to close must be greater than zero`; `newPremium '0'` → `Replacement premium must be greater than zero`; an incomplete expiration (`''`) reports only the ISO-date message (the comparator is skipped while undecided). `toRollPmccShortCallPayload` yields `{ positionId, costToClosePerContract: 3, newPremiumPerContract: 2.4, newStrike: 112, newExpiration, fillDate }` (numbers, `fillDate` omitted when empty).

**Green — implementation:**

- `pmcc-roll.ts` with `Decimal` (`ROUND_HALF_UP`, `toFixed(2)` for display strings) and `parseInputDecimal`; months via `date-fns` `format(parseISO(d), 'MMM')` / `'MMM d'`; strikes via `new Decimal(s).toString()`. Pure, no React.
- The schema per data-model.md § 4: `z.object({ costToClose, newStrike, newPremium: moneySchema(...), newExpiration: isoDateSchema, fillDate: isoDateSchema, __roll__: z.string().optional() }).superRefine(...)` with the three cross-field rules at their paths, reusing `shortExpiresBeforeLeaps` and `SHORT_NOT_BEFORE_LONG` from `src/main/core/pmcc-rules.ts` (the renderer already imports that module in `pmcc-entry.ts`). Defaults live in `EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS`, never as `.default()`.

**Refactor — cleanup to consider:**

- `moneySchema` / `required` in `pmcc-entry.ts` are private; if the roll schema needs the same two, move them to `schemas/common.ts`.

**Acceptance criteria covered:**

- "Net debit preview for a roll up and out", "Net credit preview for a roll out at the same strike", "Warning when the replacement strike sits below the effective share cost", and the client-side half of the four rejection scenarios.

### 8. `FormButton` disabled treatment, header action, sheet state

**Files to create or modify:**

- `src/renderer/src/components/ui/FormButton.tsx` + `.test.tsx` — visible disabled state
- `src/renderer/src/components/PositionDetailActions.tsx` + `.test.tsx` — `strategyType`, `hasOpenShortCall`, `onRollPmccShort`; `Roll Short Call →`
- `src/renderer/src/pages/usePositionDetailSheets.ts` — `rollPmccShortOpen`, `handleRollPmccShort`, `handleCloseRollPmccShort`, `pmccRollRecorded`, `handlePmccRollRecorded`; `overlayOpen` includes the new sheet
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — new cases for the hook's behaviour through the page

**Red — tests to write:**

- `FormButton.test.tsx`: `disabled` renders `aria-disabled`/`disabled` with classes `opacity-40` and `cursor-not-allowed`; an enabled primary has neither; `isPending` still shows `pendingLabel`.
- `PositionDetailActions.test.tsx`: `strategyType 'PMCC'` + `hasOpenShortCall` → `roll-pmcc-short-btn` with text `Roll Short Call →` and no wheel buttons; `strategyType 'PMCC'` + `hasOpenShortCall: false` → no roll button at all; `strategyType 'WHEEL'` + `phase 'CC_OPEN'` → `roll-cc-btn` present and `roll-pmcc-short-btn` absent (regression).
- `PositionDetailPage.test.tsx`: on a PMCC detail with `pmccOpenLegs.short`, clicking `Roll Short Call →` opens `role=dialog[name="Roll Short Call"]` and blurs the content (`overlayOpen`); on a PMCC detail with `pmccOpenLegs.short === null` the button is absent; `handlePmccRollRecorded` closes the sheet and shows `pmcc-roll-recorded-banner`; opening the sheet again clears the banner.

**Green — implementation:**

- `FormButton`: `className` gains `disabled:opacity-40 disabled:cursor-not-allowed`; the cursor term becomes `isPending || disabled ? 'cursor-not-allowed' : 'cursor-pointer'`. Tailwind only.
- `PositionDetailActions`: `{strategyType === 'PMCC' && hasOpenShortCall && <ActionButton testId="roll-pmcc-short-btn" label="Roll Short Call →" onClick={onRollPmccShort} />}`; the wheel branches are untouched. `PositionDetailPage` passes `strategyType={position.strategyType}` and `hasOpenShortCall={Boolean(data.pmccOpenLegs?.short)}`.
- `usePositionDetailSheets`: `const [rollPmccShortOpen, setRollPmccShortOpen] = useState(false)`, `const [pmccRollRecorded, setPmccRollRecorded] = useState<RollPmccShortCallResponse | null>(null)`; `handleRollPmccShort` opens and clears the banner; `handlePmccRollRecorded(res)` sets the banner and closes.

**Refactor — cleanup to consider:**

- `usePositionDetailSheets` now holds three independent roll booleans; if a single `openSheet: 'rollCsp' | 'rollCc' | 'rollPmccShort' | null` reads simpler and the existing tests stay green, fold them — otherwise leave the wheel's two alone.

**Acceptance criteria covered:**

- Entry point for every UI scenario; "the confirm action is disabled" (four scenarios) now reads as disabled; "Reject a roll when the PMCC has no open short call" at the UI level (no `Roll Short Call →`); "Leave a classic wheel covered-call roll unaffected" (wheel header unchanged).

### 9. The `Roll Short Call` sheet, coverage ruler, page wiring, banner, leg reference

**Files to create or modify:**

- `src/renderer/src/components/RollPmccShortCallSheet.tsx` + `.test.tsx` — portal sheet owning the RHF instance, server-error mapping, `onRecorded`
- `src/renderer/src/components/RollPmccShortCallForm.tsx` + `.test.tsx` — presentational
- `src/renderer/src/components/PmccCoverageRuler.tsx` + `.test.tsx` — today / current short / replacement / LEAPS on one axis
- `src/renderer/src/pages/PositionDetailPage.tsx` — mount the sheet and the success banner
- `src/renderer/src/components/position-cockpit/PmccLegReference.tsx` + `.spec.tsx` — render `openLegs`
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` + `.spec.tsx` — pass `detail.pmccOpenLegs`

**Red — tests to write:**

- `RollPmccShortCallForm.test.tsx` (props: ticker `XYZ`, open short `108.0000` / exp / `1.8000` / 1 contract, LEAPS `80.0000` / exp, `basisPerShare '21.2000'`, `effectiveShareCost '101.2000'`):
  - Header: eyebrow `ROLL SHORT CALL`, title `Roll Short Call`, subtitle `XYZ CALL $108.00 · exp <date> · <n> DTE` (DTE via `computeDteFromInput`).
  - `Current short call` section rows: `Contract` `XYZ $108.00 CALL`, `Expiration` `<date> (<n> DTE)`, `Sold at` `$1.80 / share`, `LEAPS · read-only` `$80.00 · <leaps date>`, `Effective share cost` `$101.20` highlighted, and the note containing `Not a guaranteed breakeven`.
  - Inputs by id: `pmcc-roll-cost-to-close`, `pmcc-roll-strike`, `pmcc-roll-premium`, `pmcc-roll-expiration` (DatePicker), `pmcc-roll-fill-date` (DatePicker defaulting to today); `Contracts` shown read-only.
  - With no cash entered the dashed placeholder `Enter a cost to close and a premium to preview the net.` renders and `pmcc-roll-net` does not.
  - `UP_OUT` values → `pmcc-roll-net` text `Net Debit: $0.60 per share ($60.00 total)`, amount span has `text-wb-red`; `pmcc-roll-label` text `Roll Up & Out: $108 to $112 strike, <Mon> to <Mon> expiration`; the expiration `Field` hint and the label suffix read `<n> DTE`; rows `Cost basis after roll` `$21.80 / share (from $21.20)` and `Effective share cost after roll` `$101.80 (from $101.20)`; `pmcc-roll-confirm` enabled.
  - `OUT_CREDIT` → `Net Credit: $1.20 per share ($120.00 total)` in `text-wb-green`; label `Roll Out: same $108 strike, …`.
  - `BELOW_EFF` → `pmcc-roll-warning` (`AlertBox warning`) text contains `Short strike $98.00 is below your effective share cost of $101.70 after this roll. If assigned, covering from the LEAPS realizes roughly $3.70 per share of loss.`; confirm enabled.
  - `NO_CHANGE` → `AlertBox error` `Roll must change the strike, the expiration, or both`; confirm disabled.
  - `ROLLS_IN` → the expiration `Field` error `Replacement expiration must be on or after the current expiration (<Mon d, yyyy>)`; confirm disabled.
  - `OUTLASTS` → the expiration `Field` error `Short call must expire before the LEAPS call.`; the ruler has `data-blocked="true"`; the footer note `The XYZ $108.00 short call stays open at <date>. No close or replacement leg is recorded.`; confirm disabled.
  - `ZERO_COST` → `Cost to close must be greater than zero` beside the field, confirm disabled; `ZERO_PREMIUM` → `Replacement premium must be greater than zero`.
  - Footer always shows `Your draft is kept until the roll is valid. No order is placed.`; Cancel calls `onClose`.
- `PmccCoverageRuler.test.tsx`: renders three/four marks with `data-mark="today|current|replacement|leaps"`; no replacement → note `Current short call expires in <n> days. The LEAPS covers <m> days.`; replacement before LEAPS → `Replacement short at <n> DTE. The LEAPS still covers it by <k> days.`; replacement ≥ LEAPS → `data-blocked="true"` and `The replacement short reaches the LEAPS. Past this point the short call is naked.`; replacement before current → `The replacement expires before the current short call — that is a buyback, not a roll.` Percent widths are the only inline styles.
- `RollPmccShortCallSheet.test.tsx` (mock `useRollPmccShortCall`): renders `role=dialog[aria-label="Roll Short Call"]` in the sheet portal; Escape and the scrim call `onClose`; a valid submit calls `mutate` with `toRollPmccShortCallPayload` output and, on success, `onRecorded(response)`; a 400 `ApiError` with `field: 'newExpiration'` lands on the expiration `Field`, `__roll__` on the no-change alert, `costToClosePerContract` on the cost field, and `__root__` / `__phase__` as `root.save` → `AlertBox error` `Could not record the roll. Your entries are preserved. Try again.`; the draft survives a failure; a double click while pending is ignored (`isPending` → `Recording…`).
- `PositionDetailPage.test.tsx`: `pmcc-roll-recorded-banner` text for the `UP_OUT` response: `Rolled — bought to close XYZ $108.00 CALL <exp> at $3.00, sold XYZ $112.00 CALL <exp> at $2.40. Short-call roll #1 debit · $0.60 per share ($60.00 total). Both legs share one roll chain.`; a credit response reads `… credit · $1.20 per share ($120.00 total)`.
- `PmccLegReference.spec.tsx`: given `openLegs` whose `short` is a `ROLL_TO` ($112 @ 2.4000), the short card header is still `Sell short call` and shows `$112.00` / `$2.40`; `short: null` → only the LEAPS card and the net-debit card render; `Initial net debit` unchanged.
- `PositionCockpit.spec.tsx`: the PMCC branch passes `detail.pmccOpenLegs` through.

**Green — implementation (the mockup's `RollShortSheet`, top to bottom):**

- `RollPmccShortCallSheet`: `createPortal(<SheetOverlay onClose><SheetPanel width={440}><div role="dialog" aria-label="Roll Short Call" tabIndex={-1} onKeyDown={Escape → onClose}>…` — `useForm<RollPmccShortCallFormValues>({ mode: 'onChange', resolver: zodResolver(rollPmccShortCallSchema({ currentStrike, currentExpiration, leapsExpiration })), defaultValues: EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today) })`; `useWatch` on the five fields; `useRollPmccShortCall({ onSuccess: onRecorded })`; `onError` → `showRollErrors(error, setError)` modelled on `PmccEntryForm#showSaveErrors` with the field map `costToClosePerContract → costToClose`, `newPremiumPerContract → newPremium`, `newStrike`, `newExpiration`, `__roll__`, else `root.save`.
- `RollPmccShortCallForm` sections, in order: `SheetHeader eyebrow="ROLL SHORT CALL" title="Roll Short Call" subtitle=…`; `SectionCard header="Coverage" headerVariant="emphasized"` → `PmccCoverageRuler`; `SectionCard header="Current short call"` with the five `SummaryRow`s and the muted note; `SectionCard header="Replacement short call"` with a two-column grid of `Field`s (`Cost to close / share`, `Premium / share`, `Strike`, `Expiration` with the `N DTE` hint, `Fill date`, read-only `Contracts`) using `NumberInput prefix="$"` and `Controller` + `DatePicker`; the dashed placeholder or `SectionCard header="Net" headerVariant="emphasized"` containing `data-testid="pmcc-roll-net"` (label `Net Debit` / `Net Credit` + amount `text-wb-red` / `text-wb-green`), `data-testid="pmcc-roll-label"` (label` · N DTE`), and the two `SummaryRow`s (`Cost basis after roll` highlighted, `Effective share cost after roll`); `AlertBox variant="warning" data-testid="pmcc-roll-warning"` when `pmccStrikeShortfall` is non-null; `AlertBox variant="error"` for `errors.__roll__`; `AlertBox variant="error"` for `errors.root?.save`; `SheetFooter` with the red blocked note when the expiration error is the coverage message, `FormButton Cancel` (secondary) + `FormButton label="Confirm roll" pendingLabel="Recording…" disabled={!isValid} data-testid="pmcc-roll-confirm"`, and the muted draft note. Tailwind `wb-*` tokens throughout; the ruler's percentage offsets are the only inline styles.
- `PmccCoverageRuler({ today, currentExpiration, replacementExpiration, leapsExpiration, blocked })`: DTE via `computeDteFromInput`; positions as `% = dte / leapsDte`; tone `bg-wb-red` when `blocked`, `bg-wb-gold` otherwise, `bg-wb-green` for the LEAPS mark; `data-blocked` and `data-mark` attributes for tests.
- `PositionDetailPage`: `{rollPmccShortOpen && data.pmccOpenLegs?.short && data.pmccLedger && <RollPmccShortCallSheet positionId ticker openShort={data.pmccOpenLegs.short} leaps={data.pmccOpenLegs.long} basisPerShare={data.pmccLedger.basisPerShare} effectiveShareCost={data.pmccLedger.effectiveShareCost} onClose onRecorded />}`; above `PositionDetailContent`, `{pmccRollRecorded && <AlertBox variant="success" data-testid="pmcc-roll-recorded-banner">…</AlertBox>}` built from `rollFromLeg`, `rollToLeg`, `shortCallRollNumber` and `pmccRollNet`.
- `PmccLegReference({ openLegs, initialNetDebit })`: `[openLegs.long, openLegs.short]` with fixed headers `Buy LEAPS call` / `Sell short call`; `PositionCockpit` passes `detail.pmccOpenLegs` (renders the reference only when non-null, as it already does for the ledger).

**Refactor — cleanup to consider:**

- `RollCcSheet` / `RollCspSheet` / `RollPmccShortCallSheet` share the portal + RHF + mutation skeleton; note the duplication for a later `useRollSheetForm` only if all three would be byte-for-byte except the schema and the form component — do not refactor the wheel sheets in this story.
- `showSaveErrors` in `PmccEntryForm` and the new `showRollErrors` are the same routing with a different field map; a shared `applyIpcFieldErrors(error, setError, fieldMap)` in `src/renderer/src/lib/` is worth it if the second copy is otherwise identical.

**Acceptance criteria covered:**

- "The roll form shows the decision context for the open short call", "Net debit preview for a roll up and out" (label, 42 DTE, confirm enabled), "Net credit preview for a roll out at the same strike", "Recording the roll …" (the banner's one net line; the refreshed `Leg reference` and `Cost basis` drawer), "Warning when the replacement strike sits below the effective share cost", and the UI half of the four rejection scenarios (message beside the field, confirm disabled, the $108 short stays open).

### 10. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-short-call-roll.spec.ts` — new; one `it` per AC scenario, one `it` per Scenario Outline row, names mirroring the Gherkin
- `e2e/pmcc-roll-helpers.ts` — new: `reachXyzShortTwo(page)` (= `createXyzPmcc` → `recordEvents([EXPIRE_1(), SHORT_2()])` → `openXyzDetail`), `reachXyzLeapsOnly(page)` (`EXPIRE_1` only), `openRollShortSheet(page)` (`roll-pmcc-short-btn` → `role=dialog[name="Roll Short Call"]`), `fillRoll(page, { costToClose, strike, premium, expiration })` (`#pmcc-roll-*`, `selectDate` for the expiration), `rollSheet(page)`, `netText(page)`, `fieldError(page, id)`, `confirmButton(page)`, `rollShortCall(page, payload)` (`window.api.rollPmccShortCall`), `monthLabel(iso)` / `longDate(iso)` (`date-fns`), the date constants `CURRENT_SHORT_EXP = localDate(67)`, `REPLACEMENT_EXP = localDate(95)`, `LEAPS_EXP = localDate(368)`, `ROLLS_IN_EXP = localDate(60)`
- Existing specs and helpers: **unchanged** (`cc-roll.spec.ts`, `pmcc-cost-basis.spec.ts`, `open-pmcc-position.spec.ts`, `position-cockpit.spec.ts` must still pass)

**Red — tests to write (AC audit — every AC scenario appears exactly once):**

- `The roll form shows the decision context for the open short call` — Background → open the sheet; the dialog text contains `$108.00`, `CURRENT_SHORT_EXP`, `${computeDte(CURRENT_SHORT_EXP)} DTE`, `$1.80 / share`, `LEAPS · read-only`, `$80.00 · ${LEAPS_EXP}`, `Effective share cost` with `$101.20`; the five inputs `#pmcc-roll-cost-to-close`, `#pmcc-roll-strike`, `#pmcc-roll-expiration`, `#pmcc-roll-premium`, `#pmcc-roll-fill-date` are visible; `pmcc-roll-net` is absent and the placeholder text is present.
- `Net debit preview for a roll up and out` — fill `3.00` / `112` / `REPLACEMENT_EXP` / `2.40`; `pmcc-roll-net` text is `Net Debit: $0.60 per share ($60.00 total)`; `pmcc-roll-label` text starts `Roll Up & Out: $108 to $112 strike, ${monthLabel(CURRENT_SHORT_EXP)} to ${monthLabel(REPLACEMENT_EXP)} expiration` and ends `${dte} DTE`; `pmcc-roll-confirm` is enabled.
- `Net credit preview for a roll out at the same strike` — fill `1.10` / `108` / `REPLACEMENT_EXP` / `2.30`; net text `Net Credit: $1.20 per share ($120.00 total)`; label `Roll Out: same $108 strike, … expiration`.
- `Recording the roll creates a linked leg pair and one net cost-basis line` — fill the up-and-out values, click confirm; the dialog detaches; `pmcc-roll-recorded-banner` contains `Short-call roll #1 debit` and `$0.60 per share`; `window.api.getPosition(id)`: `legs` has a `ROLL_FROM` with `action 'BUY'`, `strike '108.0000'`, `expiration CURRENT_SHORT_EXP`, `premiumPerContract '3.0000'` and a `ROLL_TO` with `action 'SELL'`, `strike '112.0000'`, `expiration REPLACEMENT_EXP`, `premiumPerContract '2.4000'`, and `rollFrom.rollChainId === rollTo.rollChainId !== null`; `pmccLedger.basisPerShare === '21.8000'`; `allSnapshots` has 4 rows, the last with `triggerEvent 'PMCC_SHORT_ROLL'` and `basisPerShare '21.8000'`; `pmccOpenLegs.long.strike === '80.0000'` and `pmccOpenLegs.short.strike === '112.0000'`; on the page, the `Cost basis` drawer cell `Cost basis / share` reads `$21.80` (reuse `cell` from `pmcc-ledger-helpers`) and the `Sell short call` card shows `$112.00`.
- `Warning when the replacement strike sits below the effective share cost` — fill `3.00` / `98` / `REPLACEMENT_EXP` / `2.50`; `pmcc-roll-warning` text contains `Short strike $98.00 is below your effective share cost of $101.70 after this roll. If assigned, covering from the LEAPS realizes roughly $3.70 per share of loss.`; confirm enabled.
- `Reject a replacement expiration that would outlast the LEAPS` — fill `3.00` / `112` / `LEAPS_EXP` / `6.80`; `fieldError('pmcc-roll-expiration')` is `Short call must expire before the LEAPS call.`; confirm disabled; then bypass: `rollShortCall(page, { positionId, costToClosePerContract: 3, newPremiumPerContract: 6.8, newStrike: 112, newExpiration: LEAPS_EXP })` → `{ ok: false }` with `errors[0]` `{ field: 'newExpiration', code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }`; `tableCount(dbPath, 'legs') === 4`; `getPosition(id).pmccOpenLegs.short.strike === '108.0000'`.
- `Reject a roll that changes neither strike nor expiration` — fill `3.00` / `108` / `CURRENT_SHORT_EXP` / `2.40`; the dialog contains `Roll must change the strike, the expiration, or both`; confirm disabled.
- `Reject a replacement expiration earlier than the current short call` — fill `3.00` / `112` / `ROLLS_IN_EXP` / `0.90`; `fieldError('pmcc-roll-expiration')` is `Replacement expiration must be on or after the current expiration (${longDate(CURRENT_SHORT_EXP)})`; confirm disabled.
- `Reject a non-positive cost to close` — fill `0.00` / `112` / `REPLACEMENT_EXP` / `2.40`; `fieldError('pmcc-roll-cost-to-close')` is `Cost to close must be greater than zero`; confirm disabled.
- `Reject a non-positive replacement premium` — fill `3.00` / `112` / `REPLACEMENT_EXP` / `0.00`; `fieldError('pmcc-roll-premium')` is `Replacement premium must be greater than zero`; confirm disabled.
- `Reject a roll when the PMCC has no open short call` — `reachXyzLeapsOnly`; `roll-pmcc-short-btn` count is 0; bypass `rollShortCall(page, { positionId, costToClosePerContract: 3, newPremiumPerContract: 2.4, newStrike: 112, newExpiration: REPLACEMENT_EXP })` → `{ ok: false }` with `errors[0].message === 'This PMCC has no open short call to roll.'`; `tableCount(dbPath, 'legs') === 3`; `snapshots(page, id)` has length 2.
- `Leave a classic wheel covered-call roll unaffected` — `reachCcOpenState(page, '185', '2.50', localDate(30))`; `roll-pmcc-short-btn` absent; click `roll-cc-btn`; the sheet text contains `Roll Covered Call` and does not contain `Effective share cost`, `LEAPS` or `Roll Short Call`.

**Green — implementation:**

- Only test code: the spec and helper files above. Launch with `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })` so the US-103 seam is registered; `afterEach` → `closePmcc`.

**Refactor — cleanup to consider:**

- `pmcc-helpers.ts`, `pmcc-ledger-helpers.ts` and `pmcc-roll-helpers.ts` are now three PMCC helper files; if `pmcc-roll-helpers.ts` only re-exports two things from the others plus the sheet selectors, fold the selectors into `pmcc-ledger-helpers.ts` instead of adding a file.

**Acceptance criteria covered:**

- All thirteen (eleven scenarios, the outline's two rows), one `it` each — see the AC Audit.

## AC Audit

| Linear AC (Gherkin)                                                      | E2e test (Area 10)                                                         | Unit / integration coverage                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| The roll form shows the decision context for the open short call         | `The roll form shows the decision context for the open short call`         | Areas 3, 9                                            |
| Net debit preview for a roll up and out                                  | `Net debit preview for a roll up and out`                                  | Areas 7, 9                                            |
| Net credit preview for a roll out at the same strike                     | `Net credit preview for a roll out at the same strike`                     | Areas 7, 9                                            |
| Recording the roll creates a linked leg pair and one net cost-basis line | `Recording the roll creates a linked leg pair and one net cost-basis line` | Areas 2, 4, 5, 6, 8, 9                                |
| Warning when the replacement strike sits below the effective share cost  | `Warning when the replacement strike sits below the effective share cost`  | Areas 7, 9                                            |
| Reject a replacement expiration that would outlast the LEAPS             | `Reject a replacement expiration that would outlast the LEAPS`             | Areas 1, 2, 5, 7, 9                                   |
| Reject a roll that changes neither strike nor expiration                 | `Reject a roll that changes neither strike nor expiration`                 | Areas 2, 7, 9                                         |
| Reject a replacement expiration earlier than the current short call      | `Reject a replacement expiration earlier than the current short call`      | Areas 2, 7, 9                                         |
| Outline: cost to close $0.00                                             | `Reject a non-positive cost to close`                                      | Areas 2, 7, 9                                         |
| Outline: replacement premium $0.00                                       | `Reject a non-positive replacement premium`                                | Areas 2, 7, 9                                         |
| Reject a roll when the PMCC has no open short call                       | `Reject a roll when the PMCC has no open short call`                       | Areas 2, 3, 5, 8                                      |
| Leave a classic wheel covered-call roll unaffected                       | `Leave a classic wheel covered-call roll unaffected`                       | Area 8 (actions regression); untouched `rollCc` suite |

Every AC scenario maps to exactly one e2e test. No uncovered ACs.

## Out of scope (per Linear, restated so tasks do not drift)

- Rolling the LEAPS (US-105), selling a new short call when none is open (US-115), short-call
  assignment (US-111), retiring the short (US-119).
- The comparator's inverse message and the US-105 / US-115 boundaries (US-102); the cost-basis
  formula, labels and snapshot chain (US-103); rendering the history line (US-109).
- IVR context inside the sheet (US-114); IV term-structure guidance (US-113); alerts (US-106, US-107).
- Chain-driven strike selection, Greeks, liquidity checks; broker-executed rolls (Epic 10).
- Partial rolls that change quantity; multi-fill rolls; adjusted contracts; editing a recorded roll.
- Fees on the roll legs (no input in the AC or mockup; legs write `fees = '0.0000'`).
- The final PMCC header-action set and two-lane hero (US-118); this story adds one button.
