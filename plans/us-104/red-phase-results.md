## Area 1 — Shared coverage comparator (Red)

- `src/main/core/pmcc-rules.test.ts`: +5 cases (`shortExpiresBeforeLeaps` ×3, `SHORT_NOT_BEFORE_LONG` constant, cross-leg rule reports `{ field, ...SHORT_NOT_BEFORE_LONG }`); existing regression cases unchanged and passing
- `src/main/core/pmcc-rules.property.test.ts` (new): comparator ≡ calendar-day `<` (oracle via `Date`); cross-leg issues contain `short_not_before_long` iff `!shortExpiresBeforeLeaps`
- `pnpm test src/main/core/pmcc-rules`: 7 failed / 12 passed — every failure is the missing export (`shortExpiresBeforeLeaps is not a function`, `SHORT_NOT_BEFORE_LONG` undefined)

## Area 3 — Open-leg selectors and `pmccOpenLegs` on `positions:get`

- **Plan**: `plans/us-104/plan.md` § 3; contract `plans/us-104/contracts/positions-get.md`
- **Test files**: `src/main/services/pmcc-ledger.test.ts` (describe `currentShortCallLeg`, `currentLeapsLeg`, `pmccOpenLegs`), `src/main/services/get-position.test.ts` (describe `getPosition — PMCC open legs (US-104)`), `src/main/ipc/positions.test.ts` (`positions:get success envelope carries pmccOpenLegs for a PMCC`)

### Interfaces under test

```typescript
// src/main/services/pmcc-ledger.ts
export function currentLeapsLeg(legs: LegRecord[], chains?: RollChain[]): LegRecord | null
export function currentShortCallLeg(legs: LegRecord[]): LegRecord | null
export type PmccOpenLegs = { long: LegRecord; short: LegRecord | null }
export function pmccOpenLegs(legs: LegRecord[]): PmccOpenLegs | null
// src/main/schemas.ts
GetPositionResult.pmccOpenLegs: PmccOpenLegs | null
```

### Results

`pnpm test src/main/services/pmcc-ledger src/main/services/get-position src/main/ipc/positions`
→ 19 failed / 105 passed. 16 ledger failures are `TypeError: … is not a function` (selectors not
exported); 3 get-position failures are `expected undefined …` (field not returned).

The IPC test passes at runtime because the handler already passes the service result through
unchanged; its red is the type gate — `tsc` reports `Property 'pmccOpenLegs' does not exist on
type 'GetPositionResult'`. No property test: these are service selectors, not `src/main/core/`
engines; the order-independence case is covered by an example (`does not depend on input order`).

All failures are due to missing implementation, not test bugs.

## Area 4 — Payload schema and result type

- Test file: `/Users/johnteague/my-stuff/wb-104/src/main/schemas.pmcc.test.ts` (extended)
- Runtime: `RollPmccShortCallPayloadSchema` accepts the contract example; rejects `costToClosePerContract: 0`, non-ISO `newExpiration`, missing `positionId` (each asserted at its path); `newStrike` / `fillDate` optional.
- Type-level (`expectTypeOf`, enforced by `pnpm typecheck`): `position.phase` is `'PMCC_OPEN'`, `status` `'ACTIVE'`; `costBasisSnapshot.triggerEvent` is `'PMCC_SHORT_ROLL'`, `finalPnl` `null`; result extends `RollResultBase`; `ledger` is `PmccLedgerResult`; `shortCallRollNumber` is `number`.
- Interfaces under test (`src/main/schemas.ts`): `RollPmccShortCallPayloadSchema`, `RollPmccShortCallPayload`, `RollPmccShortCallResult`, and `RollResultBase` must become an exported type.
- Result: 5 runtime tests fail with `Cannot read properties of undefined (reading 'parse'/'safeParse')` (schema not exported); tsc reports the three missing exports and `RollResultBase` declared locally but not exported. All failures are missing implementation; no property test (schema/type declarations, no engine logic).

## Area 2 — Pure lifecycle rule set `rollPmccShortCall` (Red)

- `src/main/core/lifecycle.test.ts`: new `describe('rollPmccShortCall')` (fixture `PMCC_OPEN`, short `108.0000` / `2026-11-20`, LEAPS `2027-09-17`) — 3 accepts (up & out debit, out at same strike, up at same expiration), 10 rejections asserting `{ field, code, message }` for every rule in research.md's table (plus `108` vs `108.0000` → `no_change`, pinning Decimal strike equality), 3 rule-order cases
- `src/main/core/lifecycle.property.test.ts`: `rollPmccShortCall` added to the `phase guards` table (`requiredPhase: 'PMCC_OPEN'`); **coverage guard** — `orderedDays(2)` as `[leaps, replacement]` + any current expiration + positive money → `newExpiration` / `short_not_before_long`; **invariant** — `[earlier, replacement, leaps]` strictly ordered, current = `earlier` or `replacement`, two distinct strikes → `{ phase: 'PMCC_OPEN' }`
- `src/main/core/test-fixtures/arbitraries.ts`: + `strictlyOrderedDays(count)` (`fc.uniqueArray` sorted) so the invariant's `replacement < leaps` lives in the generator, not `fc.pre`
- `pnpm test src/main/core/lifecycle`: 20 failed / 166 passed — every failure is `rollPmccShortCall is not a function`

## Area 7 — Renderer pure helpers and the form schema (Red)

- `src/renderer/src/lib/pmcc-roll.test.ts` (new): `pmccRollNet` debit `0.60`/`60.00`, credit `1.20`/`120.00`, 3 contracts → `180.00`, `''`/`'2.'`/`'0'` in either field → `null`; `pmccRollLabel` Up & Out / Out / Up / Down / Down & Out, same-month → `Nov 20 to Nov 27`, `112.5000` → `$112.5`, no change → `null`, undecided strike/expiration → `null`; `pmccPostRollEffectiveCost` debit `21.80`/`101.80`, credit `20.00`/`100.00`; `pmccStrikeShortfall` `3.70` / `null` (above, equal, undecided)
- `src/renderer/src/schemas/roll-pmcc-short-call.test.ts` (new; ctx `108.0000` / `2026-11-20`, LEAPS `2027-09-17`): `UP_OUT` and a debit roll parse; LEAPS-day and post-LEAPS expiration → `newExpiration` `SHORT_NOT_BEFORE_LONG.message`; `2026-11-13` → `… (Nov 20, 2026)`; `108`/`108.00` + current exp → `__roll__`; zero cost / premium / strike messages; `''` expiration → only `Date must be YYYY-MM-DD`, no `__roll__`; defaults; payload numbers, `fillDate` omitted when empty
- Interfaces under test:
  ```ts
  // lib/pmcc-roll.ts
  pmccRollNet({ costToClose, premium, contracts }): PmccRollNet  // { net: Decimal; isDebit; perShare; total } | null
  pmccRollLabel({ currentStrike, currentExpiration, newStrike, newExpiration }): string | null
  pmccPostRollEffectiveCost({ basisPerShare, leapsStrike, net: Decimal }): { postBasis; effectiveAfter }
  pmccStrikeShortfall(strike, effectiveAfter): string | null
  // schemas/roll-pmcc-short-call.ts
  RollPmccShortCallContext, rollPmccShortCallSchema(ctx), RollPmccShortCallFormValues,
  EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today), toRollPmccShortCallPayload(values, positionId)
  ```
- Assumptions: `net` is signed premium − cost (credit positive); `newStrike` is a required input (the mockup's confirm needs it) with the entry form's `Strike must be positive`.
- No property test: renderer display helpers, not a `src/main/core/` engine.
- `pnpm test src/renderer/src/lib/pmcc-roll src/renderer/src/schemas/roll-pmcc-short-call` → 2 files failed, both `Failed to resolve import` (modules do not exist). Missing implementation only.

## Area 5 — `rollPmccShortCallPosition` service (Red)

- `src/main/services/roll-pmcc-short-call-position.test.ts` (new). Background: `createPmccPosition` (run-day dates) → `EXPIRE_1` → `SHORT_2` fixture rows, each with `appendPmccSnapshot` in one transaction (basis $21.20 before the roll). 20 cases:
  - Happy path (cost 3.0, premium 2.4, strike 112, exp +95d, fill +63d): `rollFromLeg` ROLL_FROM/BUY/CALL/`108.0000`/+67d/`3.0000`/fees `0.0000`; `rollToLeg` ROLL_TO/SELL/`112.0000`/+95d/`2.4000`; shared non-null `rollChainId`; snapshot `PMCC_SHORT_ROLL` `21.8000` / `320.0000` / `finalPnl null`; `ledger.basisTotal '2180.0000'`, `effectiveShareCost '101.8000'`; `shortCallRollNumber 1`; `position` `{ id, ticker 'XYZ', phase 'PMCC_OPEN', status 'ACTIVE' }`
  - DB: legs +2 / snapshots +1; newest snapshot row equals the result; `positions` `phase`/`status`/`updated_at` unchanged; `getPosition(...).pmccOpenLegs.short` is `112.0000` / +95d
  - Credit roll, strike omitted → `108.0000`, basis `20.0000`; second roll (from `112.0000`) → `shortCallRollNumber 2`, two distinct chain ids; `fillDate` omitted → both legs `localToday()`
  - Rejections (leg + snapshot counts unchanged): no open short (Background without `SHORT_2`) → `__root__`/`no_open_short_call`/`This PMCC has no open short call to roll.`; LEAPS-day expiration → `newExpiration`/`short_not_before_long`; unknown id → `__root__`/`not_found`; CSP wheel id → `__phase__`/`invalid_phase`
  - Rollback: `fail_snapshot` trigger → throws `simulated storage failure`, counts unchanged, no `ROLL_FROM` row
  - Logging: INFO `pmcc_short_call_rolled { positionId, rollChainId, netCreditPerShare '-0.6000', basisPerShare '21.8000', shortCallRollNumber 1 }`; INFO `pmcc_short_roll_rejected { positionId, field, code }`
- `src/main/services/pmcc-cost-basis-chain.test.ts`: + 1 case — OPEN → EXPIRE_1 → SHORT_2 → `rollPmccShortCallPosition` → bases `23.0000, 23.0000, 21.2000, 21.8000`, triggers `PMCC_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_OPEN, PMCC_SHORT_ROLL`
- Interface under test:
  ```ts
  // src/main/services/roll-pmcc-short-call-position.ts
  export function rollPmccShortCallPosition(
    db: Database.Database,
    positionId: string,
    payload: RollPmccShortCallPayload
  ): RollPmccShortCallResult
  ```
- Assumptions: `netCreditPerShare` = newPremium − costToClose at 4 dp (negative = debit); a wheel id must reach the phase rule (it has no LEAPS, so the service cannot answer `no_active_leg` first).
- No property test: a DB service, not a `src/main/core/` engine.
- Run against a throwing stub (`not implemented`) so failures land at the call, not in setup: `pnpm test src/main/services/roll-pmcc-short-call-position src/main/services/pmcc-cost-basis-chain` → 21 failed / 4 passed (the 4 pre-existing chain cases). Every failure is `not implemented` (directly, or surfaced through `toThrow` / `captureValidationError` assertions). Missing implementation only.

## Area 6 — IPC handler, preload, renderer adapter and hook (Red)

- `src/main/ipc/positions.test.ts`: `vi.mock('../services/roll-pmcc-short-call-position')` + a `positions:roll-pmcc-short` describe (5 cases, AC roll-up-and-out payload): channel registered; valid payload → `rollPmccShortCallPosition(db, positionId, parsed)` and `{ ok: true, ...result }`; `costToClosePerContract: 0` → `{ ok: false, errors: [{ field: 'costToClosePerContract', … }] }`, service not called; service `ValidationError('newExpiration', 'short_not_before_long', …)` → that envelope; generic throw → `__root__` / `internal_error`
- `src/renderer/src/api/positions.test.ts`: `rollPmccShortCall` describe (3 cases): payload passed through unchanged; `{ ok: false }` → rejects `{ status: 400, body: { detail: errors } }`; success → body
- Interfaces under test: channel `positions:roll-pmcc-short`; `window.api.rollPmccShortCall(payload)`; renderer `RollPmccShortCallPayload` + `rollPmccShortCall(payload)`
- `pnpm vitest run src/main/ipc/positions.test.ts src/renderer/src/api/positions.test.ts` → 8 failed / 63 passed. IPC failures: handler not registered (`ipcMain.handle` not called with the channel / handler `undefined`); adapter failures: `rollPmccShortCall is not a function`. Missing implementation only.

## Area 9 — `Roll Short Call` sheet, coverage ruler, sheet state, page wiring, banner, leg reference (Red)

- New test files:
  - `src/renderer/src/components/PmccCoverageRuler.test.tsx` (10 cases) — marks `today|current|leaps` (+ `replacement` once entered); the three notes; `data-blocked` for replacement ≥ LEAPS and replacement < current; percentage `left` = dte / LEAPS DTE; `bg-wb-gold` / `bg-wb-red` replacement tone, `bg-wb-green` LEAPS mark
  - `src/renderer/src/components/RollPmccShortCallForm.test.tsx` (20 cases) — header/subtitle, `Current short call` rows + breakeven note, ruler present, five inputs + read-only contracts, placeholder, draft note, Cancel, pending label; `UP_OUT` / `OUT_CREDIT` / `BELOW_EFF` previews; `NO_CHANGE` / `ROLLS_IN` / `OUTLASTS` / zero cost / zero premium rejections with confirm disabled. Typed through a `Harness` that wraps the form in a `FormProvider` built by `useRollPmccShortCallForm(ctx, today)`; `DatePicker` mocked as an `<input>` (RollCcSheet precedent)
  - `src/renderer/src/components/RollPmccShortCallSheet.test.tsx` (14 cases, `useRollPmccShortCall` mocked) — dialog name, Escape, scrim, payload, `onRecorded`, double click, pending; 400 routing `newExpiration` / `__roll__` / `costToClosePerContract` / `__root__` / `__phase__`, a non-400 failure, draft kept, retry allowed
  - `src/renderer/src/test-fixtures/pmcc-roll.ts` — `OPEN_SHORT` ($108 · 2026-11-20 @ 1.80), `OPEN_LEAPS` ($80 · 2027-09-17), `OPEN_LEGS`, `UP_OUT_RESPONSE`, `OUT_CREDIT_RESPONSE`
- Modified: `PositionDetailPage.test.tsx` (+6, the sheet mocked as a `role=dialog` stand-in whose buttons report a debit/credit roll), `PmccLegReference.spec.tsx` (props → `openLegs`; + ROLL_TO short and `short: null` cases; the "no legs" case is gone — `openLegs` cannot lack a LEAPS), `PositionCockpit.spec.tsx` (PMCC fixture carries `pmccOpenLegs`; + a rolled-short case proving `detail.pmccOpenLegs`, not `legs`, feeds the reference)
- Interfaces under test:
  ```ts
  PmccCoverageRuler({ today, currentExpiration, replacementExpiration, leapsExpiration })
  RollPmccShortCallForm({ ticker, openShort, leaps, basisPerShare, effectiveShareCost, today, isPending, onSubmit, onClose }) // inside a FormProvider
  useRollPmccShortCallForm(ctx: RollPmccShortCallContext, today: string): UseFormReturn<RollPmccShortCallFormValues>
  RollPmccShortCallSheet({ positionId, ticker, openShort, leaps, basisPerShare, effectiveShareCost, today?, onClose, onRecorded })
  PmccLegReference({ openLegs: PmccOpenLegs, initialNetDebit })
  ```
  Test ids: `pmcc-coverage-ruler`, `pmcc-roll-net`, `pmcc-roll-net-amount`, `pmcc-roll-label`, `pmcc-roll-warning`, `pmcc-roll-no-change`, `pmcc-roll-save-error`, `pmcc-roll-confirm`, `pmcc-roll-recorded-banner`; input ids `pmcc-roll-{cost-to-close,strike,premium,expiration,fill-date,contracts}`
- Design decisions: dates render ISO (mockup); the ruler derives `blocked` from the dates instead of taking a prop (the same two rules the schema states); no property test — renderer components, no core engine.
- `pnpm vitest run` on the six files → 3 files fail to import (`./PmccCoverageRuler`, `./RollPmccShortCallSheet`, `../hooks/useRollPmccShortCallForm` do not exist); `PmccLegReference.spec` 12 fail (`legs` undefined → `Cannot read properties of undefined (reading 'find')` / missing `$112.00`); `PositionCockpit.spec` 1 fails (reference still reads `legs`); `PositionDetailPage` 5 fail (no `Roll Short Call` dialog — `onRollPmccShort` is the Area 8a no-op). The sixth page case (no roll without an open short) already passes from Area 8a. Missing implementation only.

## Area 10 — E2E tests (Red)

- New: `e2e/pmcc-short-call-roll.spec.ts` (12 `it`s, one per AC scenario / outline row, names exactly as in tasks.md) and `e2e/pmcc-roll-helpers.ts` (`reachXyzShortTwo`, `reachXyzLeapsOnly`, `openRollShortSheet`, `fillRoll`, `rollSheet`, `rollButton`, `confirmButton`, `summaryValue`, `testIdText`, `fieldError`, `rollShortCall`, `positionDetail`, `dteOf`, `longDate`, `expirationSpan`; dates `CURRENT_SHORT_EXP = localDate(67)`, `REPLACEMENT_EXP = localDate(95)`, `LEAPS_EXP = localDate(368)`, `ROLLS_IN_EXP = localDate(60)`, `ROLL_FILL_DATE = localDate(63)`).
- Launch `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })`; Background = `createXyzPmcc` → `recordEvents([EXPIRE_1(), SHORT_2()])` → `openXyzDetail`.
- Roll label months: computed, not hard-coded — `expirationSpan(from, to)` uses `MMM` or, when both dates fall in one month, `MMM d` (the run day decides; 28 days apart can share a month). DTE via `differenceInCalendarDays` from today.
- Every assertion is exact (net text, label, warning, field error via the `Field`'s `role=alert`, `SummaryRow` value by exact label, `Sell short call` card's `Strike` stat), not a substring that other copy could satisfy. Rejection tests that are reachable from a valid state also assert the confirm re-enables once the offending field is corrected (no-change, zero cost, zero premium), so "disabled" is attributable to the rule.
- Written after the feature landed, so the suite was expected to pass immediately; first run: 11 passed / 1 failed — the recording test's last snapshot was `PMCC_SHORT_OPEN` / `21.2000`. Cause: the Background's events are future-dated (SHORT_2 fills at `localDate(35)`) and `allSnapshots` is ordered by `snapshot_at`, so a roll filled today (the sheet default) sorts before them. Test-data fix: the recording test picks `ROLL_FILL_DATE = localDate(63)` (US-103's `SHORT_ROLL` fill date) in `#pmcc-roll-fill-date`.
- Falsifiability: each of the 12 tests run against a mutant copy with one expectation broken (`$101.20`→`$101.21`, net `$0.60`→`$0.61`, credit `$1.20`→`$1.21`, `$112.00`→`$112.01`, shortfall `$3.70`→`$3.71`, `short_not_before_long` code, no-change text, rolls-in text, both outline messages, LEAPS-only `legs` 3→4, CC-sheet `not.toContain('Roll Short Call')` inverted) → 12/12 mutants failed.
