# US-104 — Roll the PMCC short call with net credit/debit preview — Tasks

Plan: `plans/us-104/plan.md` · Story: Linear [OPT-12](https://linear.app/optionswheel/issue/OPT-12/us-104-roll-the-pmcc-short-call-with-net-creditdebit-preview) · Layout of record: `mockups/epic-09-pmcc-position-detail.mdx` (`RollShortSheet`, `rs-*` presets)

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Area numbers match `plan.md`. Two deviations from the plan's grouping:
  - **Area 8 is split.** `FormButton` + `PositionDetailActions` have no dependencies and run in Layer 1 (8a).
    The `usePositionDetailSheets` state and its `PositionDetailPage` tests move into Area 9, because
    "clicking `Roll Short Call →` opens the dialog" cannot pass before the sheet exists.
  - **Areas 3 and 4 both edit `src/main/schemas.ts`** (`GetPositionResult.pmccOpenLegs` vs the roll
    payload/result types). They are in the same layer; the agents must touch disjoint regions and the
    second to finish rebases onto the first.
- Shared Vitest fixtures: `src/main/services/test-fixtures/pmcc-legs.ts` (`OPEN`, `EXPIRE_1`, `SHORT_2`,
  `SHORT_ROLL`, `LEAPS_ROLL`). AC money: Background basis $21.20 / eff. $101.20; up & out → $21.80 / $101.80.

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Shared coverage comparator (short-side half of US-102's extraction)

- [x] **[Red]** Write failing tests — `src/main/core/pmcc-rules.test.ts`, `src/main/core/pmcc-rules.property.test.ts` (new)
  - Test cases: `shortExpiresBeforeLeaps('2026-10-16', '2027-09-17')` → `true`; equal dates → `false`; later short → `false`. `SHORT_NOT_BEFORE_LONG` equals `{ code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }`. Regression: `pmccCrossLegIssues` still reports `('short.expiration', 'short_not_before_long', …)` for short ≥ long and `[]` for the valid pair
  - Property cases: for any two `isoDay`, `shortExpiresBeforeLeaps(a, b) === (a < b)`; `pmccCrossLegIssues` over a valid pair with only the expirations varied contains `short_not_before_long` **iff** `!shortExpiresBeforeLeaps(short, long)` — `pmcc-rules.property.test.ts`
  - Run `pnpm test src/main/core/pmcc-rules` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Red ✓)_
  - `export const SHORT_NOT_BEFORE_LONG = { code, message } as const satisfies Pick<PmccIssue, 'code' | 'message'>`
  - `export const shortExpiresBeforeLeaps = (shortExpiration: string, longExpiration: string): boolean => shortExpiration < longExpiration`
  - `pmccCrossLegIssues` uses both instead of the inline `>=` rule (message exists once)
  - Run `pnpm test src/main/core/pmcc-rules` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: `issueIf` taking a `{ code, message }` pair — change all seven rules at once or none
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Open-leg selectors and `pmccOpenLegs` on `positions:get`

- [x] **[Red]** Write failing tests — `src/main/services/pmcc-ledger.test.ts`, `src/main/services/get-position.test.ts`, `src/main/ipc/positions.test.ts`
  - `pmcc-ledger.test.ts`: `currentShortCallLeg(OPEN)` = the `SHORT_CALL_OPEN`; + `EXPIRE_1` → `null`; + `SHORT_2` → the $108 `SHORT_CALL_OPEN`; + `SHORT_ROLL` → the $112 `ROLL_TO`; + `LEAPS_ROLL` → short unchanged; `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` close it. `currentLeapsLeg` after `LEAPS_ROLL` = the $85 `ROLL_TO`. `pmccOpenLegs([])` → `null`; `pmccOpenLegs(OPEN + EXPIRE_1)` → `{ long: LEAPS_OPEN, short: null }`
  - `get-position.test.ts`: PMCC from `createPmccPosition` → `pmccOpenLegs.long.legRole === 'LEAPS_OPEN'`, `.short.legRole === 'SHORT_CALL_OPEN'`; after inserting `SHORT_ROLL` rows `.short` is the `ROLL_TO` with `strike '112.0000'`; wheel → `pmccOpenLegs: null`
  - `ipc/positions.test.ts`: `positions:get` carries `pmccOpenLegs` unchanged
  - Run `pnpm test src/main/services/pmcc-ledger src/main/services/get-position src/main/ipc/positions` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pmcc-ledger.ts`, `src/main/services/get-position.ts`, `src/main/schemas.ts`, `src/renderer/src/api/positions.ts` _(depends on: Area 3 Red ✓)_
  - Export `currentLeapsLeg` (the existing private `newestLongBuy`, renamed)
  - `currentShortCallLeg(legs): LegRecord | null` — `reduce` over non-roll legs merged with `groupRollChains(legs)` in `byFillThenCreated` order: `SHORT_CALL_OPEN` opens; `SHORT_CALL_EXPIRED | SHORT_CALL_CLOSE | SHORT_CALL_ASSIGNED` close; a short-side chain (`rollFrom.action === 'BUY'`) → its `rollTo`. No imperative loop
  - `type PmccOpenLegs = { long: LegRecord; short: LegRecord | null }`; `pmccOpenLegs(legs)` → `null` when no long leg
  - `GetPositionResult.pmccOpenLegs: PmccOpenLegs | null`; `getPosition` computes it beside `pmccLedger` (`isPmcc ? … : null`)
  - Renderer: re-export `PmccOpenLegs`; renderer test fixtures building a `PositionDetail` gain `pmccOpenLegs: null`
  - Run `pnpm test src/main/services src/main/ipc src/renderer` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/pmcc-ledger.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: `contributionsFrom`, `currentLeapsLeg` and `currentShortCallLeg` all merge legs with chains and sort by fill then created — extract `orderedLedgerEvents(legs, chains)` if it removes the triplication
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Payload schema and result type

- [x] **[Red]** Write failing tests — `src/main/schemas.pmcc.test.ts`
  - `RollPmccShortCallPayloadSchema.parse` accepts the contract example; rejects `costToClosePerContract: 0`, a non-ISO `newExpiration`, a missing `positionId`; `newStrike` and `fillDate` optional
  - `expectTypeOf`: `RollPmccShortCallResult['position']['phase']` is `'PMCC_OPEN'`; `['costBasisSnapshot']['triggerEvent']` is `'PMCC_SHORT_ROLL'`; `RollPmccShortCallResult` extends `RollResultBase`
  - Run `pnpm test src/main/schemas.pmcc` — all new tests must fail (and `pnpm typecheck` fails on the missing types)
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 4 Red ✓)_
  - `export const RollPmccShortCallPayloadSchema = RollPayloadBaseSchema` (beside `RollCcPayloadSchema`); `RollPmccShortCallPayload = z.infer<…>`
  - `export interface RollPmccShortCallResult extends RollResultBase { position: { id; ticker; phase: 'PMCC_OPEN'; status: 'ACTIVE' }; costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_ROLL'; finalPnl: null }; ledger: PmccLedgerResult; shortCallRollNumber: number }`
  - Edit only the roll-types region — Area 3 edits `GetPositionResult` in the same file
  - Run `pnpm test src/main/schemas.pmcc && pnpm typecheck` — all must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: naming/shape consistency with `RollCspResult` / `RollCcResult`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8a — `FormButton` disabled treatment and the header action

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ui/FormButton.test.tsx`, `src/renderer/src/components/PositionDetailActions.test.tsx`
  - `FormButton`: `disabled` → `disabled` attribute plus classes `opacity-40` and `cursor-not-allowed`; enabled primary has neither; `isPending` still shows `pendingLabel`
  - `PositionDetailActions`: `strategyType 'PMCC'` + `hasOpenShortCall` → `roll-pmcc-short-btn` with text `Roll Short Call →` and no wheel buttons; `PMCC` + `hasOpenShortCall: false` → no roll button; `WHEEL` + `CC_OPEN` → `roll-cc-btn` present, `roll-pmcc-short-btn` absent (regression)
  - Run `pnpm test src/renderer/src/components/ui/FormButton src/renderer/src/components/PositionDetailActions` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ui/FormButton.tsx`, `src/renderer/src/components/PositionDetailActions.tsx`, `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 8a Red ✓)_
  - `FormButton`: `disabled:opacity-40 disabled:cursor-not-allowed`; cursor `isPending || disabled ? 'cursor-not-allowed' : 'cursor-pointer'`. Tailwind only
  - `PositionDetailActions` props gain `strategyType: StrategyType`, `hasOpenShortCall: boolean`, `onRollPmccShort: () => void`; renders `<ActionButton testId="roll-pmcc-short-btn" label="Roll Short Call →" …>` only for `PMCC && hasOpenShortCall`; wheel branches untouched
  - `PositionDetailPage` passes `strategyType={position.strategyType}`, `hasOpenShortCall={Boolean(data.pmccOpenLegs?.short)}` (use `false` until Area 3 Green lands if it has not), and a no-op `onRollPmccShort` that Area 9 wires up
  - Run `pnpm test src/renderer` — all tests must pass
- [x] **[Refactor]** `/refactor` — `FormButton.tsx`, `PositionDetailActions.tsx` _(depends on: Area 8a Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Engine rules and renderer pure logic (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 2 — Pure lifecycle rule set: `rollPmccShortCall`

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`, `src/main/core/lifecycle.property.test.ts` _(depends on: Area 1 Green ✓)_
  - Fixture: phase `PMCC_OPEN`, `openShort { strike '108.0000', expiration '2026-11-20' }`, `leapsExpiration '2027-09-17'`
  - Accepts: up & out (`112.0000`, `2026-12-18`, `3.0000`, `2.4000` — a debit) → `{ phase: 'PMCC_OPEN' }`; out at same strike (`108.0000`, `2026-12-18`, `1.1000`, `2.3000`); same expiration, different strike (Roll Up)
  - Rejects (`ValidationError` `{ field, code, message }`): `CC_OPEN` → `__phase__`/`invalid_phase`; `openShort: null` → `__root__`/`no_open_short_call`/`This PMCC has no open short call to roll.`; cost `0.0000` → `costToClosePerContract`/`must_be_positive`/`Cost to close must be greater than zero`; premium `0.0000` → `newPremiumPerContract`/`must_be_positive`/`Replacement premium must be greater than zero`; strike `0.0000` → `newStrike`/`must_be_positive`; exp `2027-09-17` and `2027-10-15` → `newExpiration`/`short_not_before_long`/`Short call must expire before the LEAPS call.`; exp `2026-11-13` → `newExpiration`/`must_be_on_or_after_current`/`Replacement expiration must be on or after the current expiration (Nov 20, 2026)`; `108.0000` + `2026-11-20` → `__roll__`/`no_change`/`Roll must change the strike, the expiration, or both`
  - Order: null short + `CC_OPEN` → phase; cost `0` + exp `2027-09-17` → cost; exp `2027-09-17` + same strike → comparator, not no-change
  - Property cases — `lifecycle.property.test.ts`: **guard** — add `rollPmccShortCall` to the `phase guards` table with `requiredPhase: 'PMCC_OPEN'`; **guard (coverage)** — `orderedDays(2)` as `[leaps, replacement]` + any positive money → `newExpiration`/`short_not_before_long` regardless of the current expiration; **invariant** — `orderedDays(3)` as `[current, replacement, leaps]` with `replacement < leaps`, `positiveMoney()` cost/premium/strike, strike ≠ current → `{ phase: 'PMCC_OPEN' }`
  - Run `pnpm test src/main/core/lifecycle` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 2 Red ✓)_
  - `RollPmccShortCallInput { currentPhase; openShort: { strike; expiration } | null; leapsExpiration; newStrike; newExpiration; costToClosePerContract; newPremiumPerContract }`, `RollPmccShortCallResult { phase: 'PMCC_OPEN' }`
  - Eight rules in research.md order, first failure throws; reuse `requirePositiveDecimal`, `requirePositiveStrike(strike, 'newStrike')`, `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG`; rule 7 date via `format(parseISO(…), 'MMM d, yyyy')`; strike equality `new Decimal(a).eq(b)`. No logging, no I/O
  - Run `pnpm test src/main/core/lifecycle` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: a private `requireRollChanges` shared with `rollCc` — only if `rollCc`'s messages stay byte-identical
  - Stress the new properties once (`numRuns: 500`, a few seeds, `endOnFailure: true`) before trusting them
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 7 — Renderer pure helpers and the form schema

**Requires:** Area 1 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-roll.test.ts`, `src/renderer/src/schemas/roll-pmcc-short-call.test.ts` _(depends on: Area 1 Green ✓, Area 4 Green ✓)_
  - `pmccRollNet`: (`3.00`, `2.40`, 1) → `{ isDebit: true, perShare: '0.60', total: '60.00' }`; (`1.10`, `2.30`) → credit `1.20` / `120.00`; 3 contracts → `180.00`; `''`, `'2.'`, `'0'` in either field → `null`
  - `pmccRollLabel`: `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration`; `Roll Out: same $108 strike, Nov to Dec expiration`; `Roll Up: $108 to $112 strike, same Nov expiration`; `Roll Down & Out: …`; same month different day → `Nov 20 to Nov 27 expiration`; nothing changed → `null`; `112.5000` prints `$112.5`
  - `pmccPostRollEffectiveCost({ basisPerShare: '21.2000', leapsStrike: '80.0000', net })` → `{ postBasis: '21.80', effectiveAfter: '101.80' }` (debit), `'20.00' / '100.00'` (credit)
  - `pmccStrikeShortfall('98', '101.70')` → `'3.70'`; `('112', '101.80')` → `null`; `('101.70', '101.70')` → `null`
  - Schema (ctx: `108.0000` / `2026-11-20`, LEAPS `2027-09-17`): `UP_OUT` parses; `newExpiration '2027-09-17'` → `['newExpiration']` with `SHORT_NOT_BEFORE_LONG.message`; `'2026-11-13'` → `Replacement expiration must be on or after the current expiration (Nov 20, 2026)`; `108` + `'2026-11-20'` → `['__roll__']` `Roll must change the strike, the expiration, or both`; `costToClose '0.00'` → `Cost to close must be greater than zero`; `newPremium '0'` → `Replacement premium must be greater than zero`; `''` expiration → only the ISO-date message
  - `toRollPmccShortCallPayload` → `{ positionId, costToClosePerContract: 3, newPremiumPerContract: 2.4, newStrike: 112, newExpiration, fillDate }` as numbers; `fillDate` omitted when empty
  - Run `pnpm test src/renderer/src/lib/pmcc-roll src/renderer/src/schemas/roll-pmcc-short-call` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-roll.ts`, `src/renderer/src/schemas/roll-pmcc-short-call.ts` _(depends on: Area 7 Red ✓)_
  - `pmcc-roll.ts`: `Decimal` (`ROUND_HALF_UP`, `toFixed(2)` for display) + `parseInputDecimal`; months via `format(parseISO(d), 'MMM' | 'MMM d')`; strikes via `new Decimal(s).toString()`. Pure, no React
  - Schema: `RollPmccShortCallContext`, `rollPmccShortCallSchema(ctx)` = `z.object({ costToClose, newStrike, newPremium, newExpiration, fillDate, __roll__: z.string().optional() }).superRefine(…)` reusing `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG`; comparator skipped while the date is incomplete; `RollPmccShortCallFormValues`; `EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today)` (no `.default()`); `toRollPmccShortCallPayload(values, positionId)` typed with `RollPayloadBase`-shaped output (switch to the renderer `RollPmccShortCallPayload` once Area 6 lands)
  - Run `pnpm test src/renderer/src/lib/pmcc-roll src/renderer/src/schemas/roll-pmcc-short-call` — all tests must pass
- [x] **[Refactor]** `/refactor` — `pmcc-roll.ts`, `roll-pmcc-short-call.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: move `moneySchema` / `required` from `pmcc-entry.ts` to `schemas/common.ts` if the roll schema needs both
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service (depends on Layers 1–2)

### Area 5 — `rollPmccShortCallPosition` service

**Requires:** Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-pmcc-short-call-position.test.ts` (new), `src/main/services/pmcc-cost-basis-chain.test.ts` _(depends on: Areas 2, 3, 4 Green ✓)_
  - Background: `createPmccPosition` + `EXPIRE_1` and `SHORT_2` rows, snapshots via `appendPmccSnapshot`
  - Happy path (cost `3.0`, premium `2.4`, strike `112`, exp +95d): `rollFromLeg` `ROLL_FROM`/`BUY`/`CALL`/`108.0000`/current exp/`3.0000`/`fees '0.0000'`; `rollToLeg` `ROLL_TO`/`SELL`/`112.0000`/new exp/`2.4000`; equal non-null `rollChainId`; snapshot `PMCC_SHORT_ROLL`, `basisPerShare '21.8000'`, `totalPremiumCollected '320.0000'`; `ledger.basisTotal '2180.0000'`, `ledger.effectiveShareCost '101.8000'`; `shortCallRollNumber === 1`; `position.phase 'PMCC_OPEN'`
  - DB after: `legs` +2; newest snapshot row matches the result; `positions.phase` and `updated_at` unchanged; `getPosition(...).pmccOpenLegs.short.strike === '112.0000'`
  - Credit roll (cost `1.1`, premium `2.3`, strike omitted → `108.0000`) → `basisPerShare '20.0000'`; a second roll → `shortCallRollNumber === 2`, two chains; `fillDate` omitted → `localToday()`
  - Rejections write nothing (leg + snapshot counts unchanged): no open short → `no_open_short_call`; replacement = LEAPS exp → `short_not_before_long`; unknown id → `not_found`; wheel id → `__phase__`/`invalid_phase`
  - Rollback: `CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT, …)` → throws; no orphan `ROLL_FROM`; snapshot count unchanged
  - `pmcc-cost-basis-chain.test.ts`: OPEN → EXPIRE_1 → SHORT_2 → `rollPmccShortCallPosition` → snapshots `23.0000, 23.0000, 21.2000, 21.8000` with triggers `PMCC_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_OPEN, PMCC_SHORT_ROLL`
  - Run `pnpm test src/main/services/roll-pmcc-short-call-position src/main/services/pmcc-cost-basis-chain` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/roll-pmcc-short-call-position.ts` _(depends on: Area 5 Red ✓)_
  - `rollPmccShortCallPosition(db, positionId, payload): RollPmccShortCallResult`: `getPosition` (→ `not_found`) → `pmccOpenLegs(detail.legs)` (→ `no_active_leg` when null) → 4-dp formatting, `newStrike ?? openShort.strike` → `rollPmccShortCall(...)` → one `db.transaction`: insert `ROLL_FROM`, insert `ROLL_TO` (shared new `roll_chain_id`, `fees '0.0000'`), `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_SHORT_ROLL', eventDate: fillDate, now })`. Position row untouched
  - `shortCallRollNumber = groupRollChains(detail.legs).filter((c) => c.rollFrom.action === 'BUY').length + 1`
  - Logging: DEBUG `roll_pmcc_short_call_inputs`, `roll_pmcc_short_call_tx_start` / `_tx_committed`; INFO `pmcc_short_call_rolled`; INFO `pmcc_short_roll_rejected` on `ValidationError`
  - Run `pnpm test src/main/services` — all tests must pass
- [x] **[Refactor]** `/refactor` — `roll-pmcc-short-call-position.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: `insertLegRow(db, row)` in `leg-rows.ts` shared with the US-103 test seam (`test-pmcc-ledger.ts#INSERT_LEG_SQL`); leave wheel roll services alone unless mechanical
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Transport (depends on Layer 3)

### Area 6 — IPC handler, preload, renderer adapter and hook

**Requires:** Area 4 Green ✓, Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts`, `src/renderer/src/api/positions.test.ts` _(depends on: Area 5 Green ✓)_
  - IPC: `positions:roll-pmcc-short` registered; valid payload → `rollPmccShortCallPosition(db, positionId, parsed)` → `{ ok: true, ...result }`; `costToClosePerContract: 0` → `{ ok: false, errors: [{ field: 'costToClosePerContract', … }] }` without calling the service; service `ValidationError('newExpiration', 'short_not_before_long', …)` → that envelope; generic throw → `internal_error`
  - Adapter: `rollPmccShortCall` passes the payload through unchanged; `{ ok: false }` → `ApiError` status 400 with field errors; success → body
  - Run `pnpm test src/main/ipc/positions src/renderer/src/api/positions` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/hooks/useRollPmccShortCall.ts` (new) _(depends on: Area 6 Red ✓)_
  - `registerParsedPositionHandler(db, 'positions:roll-pmcc-short', 'positions_roll_pmcc_short_unhandled_error', RollPmccShortCallPayloadSchema, rollPmccShortCallPosition)` — nothing else
  - Preload `rollPmccShortCall`; `IpcRollPmccShortCallResult = IpcResult<RollPmccShortCallResult>`; renderer `RollPmccShortCallPayload = IpcPayload<'rollPmccShortCall'>`, `RollPmccShortCallResponse = IpcSuccess<'rollPmccShortCall'>`, `rollPmccShortCall()`; hook = one-liner over `usePositionMutation`, mirroring `useRollCc`
  - Point Area 7's `toRollPmccShortCallPayload` return type at the renderer `RollPmccShortCallPayload`
  - Run `pnpm test src/main/ipc src/renderer/src/api` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Sheet and page (depends on Layers 1–4)

### Area 9 — `Roll Short Call` sheet, coverage ruler, sheet state, page wiring, banner, leg reference

**Requires:** Area 3 Green ✓, Area 6 Green ✓, Area 7 Green ✓, Area 8a Green ✓

- [x] **[Red]** Write failing tests _(depends on: Areas 3, 6, 7, 8a Green ✓)_
  - `src/renderer/src/components/RollPmccShortCallForm.test.tsx` (ticker `XYZ`, short `108.0000` / exp / `1.8000` / 1 contract, LEAPS `80.0000` / exp, basis `21.2000`, eff. `101.2000`):
    - Header eyebrow `ROLL SHORT CALL`, title `Roll Short Call`, subtitle `XYZ CALL $108.00 · exp <date> · <n> DTE`
    - `Current short call` rows: `Contract` `XYZ $108.00 CALL`, `Expiration` `<date> (<n> DTE)`, `Sold at` `$1.80 / share`, `LEAPS · read-only` `$80.00 · <date>`, `Effective share cost` `$101.20` highlighted, note with `Not a guaranteed breakeven`
    - Inputs `#pmcc-roll-cost-to-close`, `#pmcc-roll-strike`, `#pmcc-roll-premium`, `#pmcc-roll-expiration`, `#pmcc-roll-fill-date` (defaults today); `Contracts` read-only
    - Empty cash → placeholder `Enter a cost to close and a premium to preview the net.`, no `pmcc-roll-net`
    - `UP_OUT` → `Net Debit: $0.60 per share ($60.00 total)` (amount `text-wb-red`); label `Roll Up & Out: $108 to $112 strike, <Mon> to <Mon> expiration` + `<n> DTE` (also the expiration hint); `Cost basis after roll` `$21.80 / share (from $21.20)`; `Effective share cost after roll` `$101.80 (from $101.20)`; confirm enabled
    - `OUT_CREDIT` → `Net Credit: $1.20 per share ($120.00 total)` (`text-wb-green`), label `Roll Out: same $108 strike, …`
    - `BELOW_EFF` → `pmcc-roll-warning` contains `Short strike $98.00 is below your effective share cost of $101.70 after this roll. If assigned, covering from the LEAPS realizes roughly $3.70 per share of loss.`; confirm enabled
    - `NO_CHANGE` → error alert `Roll must change the strike, the expiration, or both`; confirm disabled
    - `ROLLS_IN` → expiration field error `Replacement expiration must be on or after the current expiration (<Mon d, yyyy>)`; confirm disabled
    - `OUTLASTS` → expiration field error `Short call must expire before the LEAPS call.`; ruler `data-blocked="true"`; footer `The XYZ $108.00 short call stays open at <date>. No close or replacement leg is recorded.`; confirm disabled
    - `ZERO_COST` / `ZERO_PREMIUM` → field messages, confirm disabled
    - Footer always `Your draft is kept until the roll is valid. No order is placed.`; Cancel → `onClose`
  - `src/renderer/src/components/PmccCoverageRuler.test.tsx`: `data-mark="today|current|replacement|leaps"`; no replacement → `Current short call expires in <n> days. The LEAPS covers <m> days.`; replacement < LEAPS → `Replacement short at <n> DTE. The LEAPS still covers it by <k> days.`; replacement ≥ LEAPS → `data-blocked="true"` + `The replacement short reaches the LEAPS. Past this point the short call is naked.`; replacement < current → `The replacement expires before the current short call — that is a buyback, not a roll.`
  - `src/renderer/src/components/RollPmccShortCallSheet.test.tsx` (mock `useRollPmccShortCall`): `role=dialog[aria-label="Roll Short Call"]` in the portal; Escape / scrim → `onClose`; valid submit → `mutate(toRollPmccShortCallPayload(...))`, success → `onRecorded(response)`; 400 `ApiError` routing: `newExpiration` → expiration field, `__roll__` → no-change alert, `costToClosePerContract` → cost field, `__root__`/`__phase__` → `Could not record the roll. Your entries are preserved. Try again.`; draft survives failure; double click while pending ignored (`Recording…`)
  - `src/renderer/src/pages/PositionDetailPage.test.tsx` (sheet state moved here from plan Area 8): PMCC with `pmccOpenLegs.short` → clicking `Roll Short Call →` opens `role=dialog[name="Roll Short Call"]` and blurs content (`overlayOpen`); `pmccOpenLegs.short === null` → button absent; recorded → sheet closes and `pmcc-roll-recorded-banner` reads `Rolled — bought to close XYZ $108.00 CALL <exp> at $3.00, sold XYZ $112.00 CALL <exp> at $2.40. Short-call roll #1 debit · $0.60 per share ($60.00 total). Both legs share one roll chain.`; credit → `… credit · $1.20 per share ($120.00 total)`; reopening the sheet clears the banner
  - `src/renderer/src/components/position-cockpit/PmccLegReference.spec.tsx`: `short` as `ROLL_TO` ($112 @ 2.4000) → header still `Sell short call`, shows `$112.00` / `$2.40`; `short: null` → LEAPS card + net-debit card only; `Initial net debit` unchanged
  - `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`: PMCC branch passes `detail.pmccOpenLegs`
  - Run `pnpm test src/renderer` — all new tests must fail
- [x] **[Green]** Implement _(depends on: Area 9 Red ✓)_
  - `PmccCoverageRuler.tsx` — DTE via `computeDteFromInput`; `% = dte / leapsDte` (the only inline styles); `bg-wb-red` when blocked, `bg-wb-gold` otherwise, `bg-wb-green` LEAPS mark; `data-blocked` / `data-mark`
  - `RollPmccShortCallForm.tsx` — mockup `RollShortSheet` top to bottom: `SheetHeader`; `Coverage` `SectionCard` → ruler; `Current short call` `SummaryRow`s + note; `Replacement short call` field grid (`NumberInput prefix="$"`, `Controller` + `DatePicker`); placeholder or `Net` card (`pmcc-roll-net`, `pmcc-roll-label`, post-roll rows); `AlertBox warning` `pmcc-roll-warning`; `AlertBox error` for `__roll__` and `root.save`; `SheetFooter` with blocked note, Cancel + `FormButton label="Confirm roll" pendingLabel="Recording…" disabled={!isValid} data-testid="pmcc-roll-confirm"`, draft note. `wb-*` tokens only
  - `RollPmccShortCallSheet.tsx` — portal + `SheetPanel width={440}` + dialog; `useForm({ mode: 'onChange', resolver: zodResolver(rollPmccShortCallSchema(ctx)), defaultValues: EMPTY_…(today) })`; `useWatch`; `useRollPmccShortCall({ onSuccess: onRecorded })`; `showRollErrors` field map
  - `usePositionDetailSheets.ts` — `rollPmccShortOpen`, `handleRollPmccShort` (opens + clears banner), `handleCloseRollPmccShort`, `pmccRollRecorded`, `handlePmccRollRecorded`; `overlayOpen` includes the sheet
  - `PositionDetailPage.tsx` — wire `onRollPmccShort`; mount the sheet when `rollPmccShortOpen && data.pmccOpenLegs?.short && data.pmccLedger`; success banner above the content built from `rollFromLeg`, `rollToLeg`, `shortCallRollNumber`, `pmccRollNet`
  - `PmccLegReference.tsx` takes `openLegs: PmccOpenLegs` + `initialNetDebit`, fixed headers `Buy LEAPS call` / `Sell short call`; `PositionCockpit.tsx` passes `detail.pmccOpenLegs`
  - Run `pnpm test src/renderer` — all tests must pass
- [x] **[Refactor]** `/refactor` — the Area 9 components and page _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: shared `applyIpcFieldErrors(error, setError, fieldMap)` in `src/renderer/src/lib/` if `showRollErrors` and `PmccEntryForm#showSaveErrors` differ only by map; collapsing the roll-sheet booleans into one `openSheet` union only if existing tests stay green. Do **not** refactor `RollCcSheet` / `RollCspSheet` in this story
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from previous layers ✓. Switch ABI first: `pnpm rebuild:electron` (and `pnpm rebuild:node` before going back to Vitest).

### Area 10 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-short-call-roll.spec.ts`, `e2e/pmcc-roll-helpers.ts` _(depends on: all Green tasks ✓)_
  - Launch `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })`; Background = `createXyzPmcc` → `recordEvents([EXPIRE_1(), SHORT_2()])` → `openXyzDetail`. Dates: `CURRENT_SHORT_EXP = localDate(67)`, `REPLACEMENT_EXP = localDate(95)`, `LEAPS_EXP = localDate(368)`, `ROLLS_IN_EXP = localDate(60)`; month/date labels and DTE computed with `date-fns` in the spec
  - One `it()` per AC bullet — names mirror the Gherkin:
    - AC-1: The roll form shows the decision context for the open short call → `it('The roll form shows the decision context for the open short call')`
    - AC-2: Net debit preview for a roll up and out → `it('Net debit preview for a roll up and out')`
    - AC-3: Net credit preview for a roll out at the same strike → `it('Net credit preview for a roll out at the same strike')`
    - AC-4: Recording the roll creates a linked leg pair and one net cost-basis line → `it('Recording the roll creates a linked leg pair and one net cost-basis line')` (UI confirm + banner + `getPosition` legs/chain/ledger $21.80/4 snapshots/open legs + drawer $21.80 + `Sell short call` $112.00)
    - AC-5: Warning when the replacement strike sits below the effective share cost → `it('Warning when the replacement strike sits below the effective share cost')`
    - AC-6: Reject a replacement expiration that would outlast the LEAPS → `it('Reject a replacement expiration that would outlast the LEAPS')` (UI field error + disabled confirm, then bypass via `window.api.rollPmccShortCall` → `short_not_before_long`, `legs` count 4, short still $108)
    - AC-7: Reject a roll that changes neither strike nor expiration → `it('Reject a roll that changes neither strike nor expiration')`
    - AC-8: Reject a replacement expiration earlier than the current short call → `it('Reject a replacement expiration earlier than the current short call')`
    - AC-9 (Outline row): cost to close $0.00 → `it('Reject a non-positive cost to close')`
    - AC-10 (Outline row): replacement premium $0.00 → `it('Reject a non-positive replacement premium')`
    - AC-11: Reject a roll when the PMCC has no open short call → `it('Reject a roll when the PMCC has no open short call')` (`EXPIRE_1` only; no button; bypass → message; `legs` 3; 2 snapshots)
    - AC-12: Leave a classic wheel covered-call roll unaffected → `it('Leave a classic wheel covered-call roll unaffected')` (`reachCcOpenState(page, '185', '2.50', localDate(30))`; no `roll-pmcc-short-btn`; `Roll Covered Call` sheet without `Effective share cost` / `LEAPS` / `Roll Short Call`)
  - Assertions must be falsifiable: each locator renders on that page, and no fallback text can satisfy it
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Test code only; existing `cc-roll.spec.ts`, `pmcc-cost-basis.spec.ts`, `open-pmcc-position.spec.ts`, `position-cockpit.spec.ts` must still pass unchanged
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: fold `pmcc-roll-helpers.ts` into `pmcc-ledger-helpers.ts` if it is only sheet selectors plus re-exports

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests (Area 1 `pmcc-rules.property.test.ts`, Area 2 `lifecycle.property.test.ts`)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (12 `it`s, one per scenario / outline row)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean (`pnpm rebuild:node` first if e2e ran last)
- [ ] `/update-spec us-104` once the story is done
