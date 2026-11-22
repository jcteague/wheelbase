# US-120 — Close a PMCC by selling the LEAPS — Tasks

Plan: `plans/us-120/plan.md`; the area numbers below match it. Story: Linear
[OPT-26](https://linear.app/optionswheel/issue/OPT-26). Read `research.md`, `data-model.md` and
`contracts/` before starting an area.

## How to Use

- Check off each task when it is complete: change `[ ]` to `[x]`.
- Within an area, tasks run **in sequence**: Red → Green → Refactor.
- Areas in the same layer run **in parallel**; dispatch a separate agent for each.
- Cross-area dependencies are noted inline. Do not start a task until its dependency is checked off.
- Every expected value in a test is a literal from `plan.md` or `data-model.md` § 7. It is never the output of the function under test.
- `better-sqlite3` ABI:
  - run `pnpm rebuild:node` before Vitest work;
  - run `pnpm rebuild:electron` before Layer 8;
  - never run a Vitest agent and an e2e agent at the same time.

Shared files to watch when areas run in parallel:

| File                                                                                                                                             | Areas                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/main/core/types.ts`, `src/main/schemas.ts`                                                                                                  | 1 (Layer 1), then 6 (Layer 3)                                                                                  |
| `src/main/services/pmcc-ledger.ts`, `pmcc-ledger.test.ts`                                                                                        | 4 then 5: **one agent, in sequence** (both Layer 2)                                                            |
| `src/main/core/costbasis.ts`                                                                                                                     | 2 (Layer 1); Area 9 only imports it                                                                            |
| `src/renderer/src/lib/phase.ts`, `api/positions.ts`                                                                                              | 1 (Layer 1), then 8 (Layer 5)                                                                                  |
| `src/renderer/src/components/PositionDetailActions.tsx`                                                                                          | 11. US-115 and US-119 edit it too; rebase onto whichever lands first and keep the `phase === 'PMCC_OPEN'` gate |
| Shared with US-115: `lastShortRetiredOn` (`pmcc-ledger.ts`), `pmccFillDateFloor` (`pmcc-rules.ts`), `pmccCoverageLabel` (`lib/pmcc-coverage.ts`) | 4, 3, 11. Reuse if US-115 landed first; create per US-115's plan otherwise. Never a second copy                |

---

## Layer 1 — Foundation (no dependencies)

> These areas can start immediately and run in parallel.

### Area 1 — Vocabulary: terminal phase, settlement role and terminal trigger

- [ ] **[Red]** Write failing tests in `src/main/core/types.test.ts`, `src/main/pmcc-phase.test.ts` and `src/renderer/src/lib/phase.test.ts`.
  - Test cases:
    - `WheelPhase.options` has `'PMCC_CLOSED'` exactly once.
    - `isPmccBasisLegRole('LEAPS_CLOSE')` is `false`; it is `true` for `LEAPS_OPEN` and the four `SHORT_CALL_*` roles.
    - `PmccTriggerEvent.options` has `'PMCC_LEAPS_CLOSED'`.
    - `isKnownPmccPhase('PMCC_CLOSED')` is `true`.
    - `PHASE_LABEL.PMCC_CLOSED` is `'PMCC Closed'`, `PHASE_LABEL_SHORT.PMCC_CLOSED` is `'Closed'`, and `PHASE_TOKEN.PMCC_CLOSED` is `'text-muted'`.
    - `expectTypeOf` checks on `PmccClosedPhase`, `PmccBasisLegRole` and `PmccTerminalTriggerEvent`.
  - Property cases: none. This area is vocabulary only (stated in `plan.md` Area 1).
  - Run `pnpm test src/main/core/types.test.ts src/main/pmcc-phase.test.ts src/renderer/src/lib/phase.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement in `src/main/core/types.ts`, `src/main/schemas.ts`, `src/main/pmcc-phase.ts`, `src/renderer/src/api/positions.ts` and `src/renderer/src/lib/phase.ts` _(depends on: Area 1 Red ✓)_.
  - Types, as `data-model.md` § Type Design gives them:
    - `PmccPhase` / `PmccOpenPhase` / `PmccClosedPhase`, an `Extract` chain;
    - `PmccSettlementLegRole` / `PmccBasisLegRole`, `Extract` / `Exclude`;
    - `isPmccBasisLegRole`;
    - `PmccTerminalTriggerEvent`, an `Extract`.
  - Fill every `Record<WheelPhase, …>` / `Record<PmccPhase, …>` that `pnpm typecheck` reports.
  - Leave `requirePmccOpenPhase` and the `phase = 'PMCC_OPEN'` SQL filters unchanged.
  - Run the same tests; all must pass. Then run `pnpm typecheck`.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 1 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: narrow `requirePmccOpenPhase` to `asserts phase is PmccOpenPhase`.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

### Area 2 — Core engine: `settlePmccClose`

- [ ] **[Red]** Write failing tests in `src/main/core/costbasis.test.ts` and `src/main/core/costbasis.property.test.ts`.
  - Test cases (full list in `plan.md` Area 2 Red):
    - Happy path: `24.10` × 1, basis `850` → `2410.0000` / `2410.0000` / `1560.0000` / `183.5294`.
    - Fees `0.65` → `2409.3500` / `1559.3500`.
    - Losing: `6.40` → `-210.0000` / `-24.7059`.
    - Three contracts → `7230.0000` / `4680.0000`.
    - No cycles: `21.00`, basis `1980` → `120.0000`.
    - Basis `0` or `-150` → `percentOfBasis: null`.
    - Rounding: `20.0001`, fees `0.0090`, basis `2000.0000` → `2000.0100` / `2000.0010` / `0.0010` / `0.0001`. This is the `ROUND_HALF_UP` literal; `HALF_EVEN` gives `0.0000`.
    - A bad contract count or price throws `RangeError`.
  - Property cases (`costbasis.property.test.ts`):
    - Reconciliation: `finalPnl = proceeds − fees − basisTotal`, and `settlementCash = proceeds − fees`.
    - Scaling: with contracts × k and basis × k, proceeds and P&L scale by k and `percentOfBasis` is unchanged.
    - Monotonicity: non-decreasing in the price, non-increasing in fees.
    - Sign: null exactly when basis ≤ 0, otherwise the same sign as `finalPnl`.
  - Run `pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement `settlePmccClose` in `src/main/core/costbasis.ts` _(depends on: Area 2 Red ✓)_.
  - `settlePmccClose(input: PmccCloseSettlementInput): PmccCloseSettlement`, per `data-model.md` § 2.4.
  - Use `sharesFromContracts` and `Decimal`, with `money4` on every output.
  - No I/O and no logging.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` on `src/main/core/costbasis.ts` _(depends on: Area 2 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: share arithmetic with `calculateCallAway` only if the two are identical.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.
  - Run `pnpm test:mutation --mutate src/main/core/costbasis.ts`. No surviving, reproducible, non-equivalent mutant in `settlePmccClose`.

---

## Layer 2 — Engines and helpers (depend on Layer 1)

> Areas 3, 4+5 (one agent) and 9 run in parallel.

### Area 3 — Core engine: close rules and `closePmccLeaps`

- [ ] **[Red]** Write failing tests in `src/main/core/pmcc-rules.test.ts`, `pmcc-rules.property.test.ts`, `lifecycle.test.ts` and `lifecycle.property.test.ts` _(depends on: Area 1 Green ✓)_.
  - Test cases (full list in `plan.md` Area 3 Red):
    - Floor:
      - `{ previousShortRetiredOn: '2027-07-16', leapsFillDate: '2027-07-09' }` → `previousShort` on `2027-07-16`;
      - `{ previousShortRetiredOn: null, leapsFillDate: '2027-06-01' }` → `leaps`;
      - a tie → `previousShort` (as US-115).
    - Issues, each asserted on field, code and the full message:
      - sale `0` → `must_be_positive`;
      - fees `-1` → `must_be_non_negative`;
      - `2027-07-15` → `before_short_retired (2027-07-16)`;
      - `2027-05-31` → `before_leaps_open (2027-06-01)`;
      - tie on `2027-07-16`, fill `2027-07-15` → `before_short_retired (2027-07-16)`, not `before_leaps_open`;
      - `2027-07-20` → `cannot_be_future`.
    - Boundaries: the floor day and today pass.
    - An `undefined` field gives no issue.
    - The order is price → fees → floor → future.
    - Engine:
      - valid input → `{ phase: 'PMCC_CLOSED' }`;
      - a wheel or `PMCC_CLOSED` phase → `invalid_phase`;
      - an open short → `short_call_open` with the story's message, even when the price is also invalid.
  - Property cases:
    - Floor = max of the two dates; `kind` is `previousShort` exactly when retired ≥ LEAPS.
    - The issues list is empty exactly when every rule holds.
    - An `undefined` field never adds an issue.
    - Naked-call rule: any `PMCC_OPEN` input with a non-null `openShort` throws `short_call_open`.
  - Run `pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement in `src/main/core/pmcc-rules.ts` and `src/main/core/lifecycle.ts` _(depends on: Area 3 Red ✓)_.
  - `PmccFillDateFloor`, a discriminated union on `kind` (US-115's type).
  - `pmccFillDateFloor`, shared with US-115 (reuse it if it exists): `lastShortRetiredOn !== null && lastShortRetiredOn >= leapsFillDate` binds on the short.
  - `PmccLeapsCloseField`, a string-literal union.
  - `pmccLeapsCloseIssues`, built from `issueIf` with an exhaustive `switch (floor.kind)`; export each message as a `satisfies PmccRule` constant.
  - `closePmccLeaps`: `requirePmccOpenPhase` → open-short guard → `throwIssue(first)` → `{ phase: 'PMCC_CLOSED' }`.
  - Reuse the existing `Fill date cannot be in the future` string.
  - No I/O and no logging.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` on `src/main/core/pmcc-rules.ts` and `src/main/core/lifecycle.ts` _(depends on: Area 3 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: `pmccFillDateFloor` is the only floor tie-break (US-115's rows 9a / 9b call it).
  - Run `pnpm test && pnpm lint && pnpm typecheck`.
  - Run `pnpm test:mutation --mutate src/main/core/pmcc-rules.ts,src/main/core/lifecycle.ts`. Leave no surviving, reproducible, non-equivalent mutant in the new functions.

### Area 4 — Ledger: the LEAPS sale is a settlement, not a contribution

- [ ] **[Red]** Write failing tests in `src/main/services/pmcc-ledger.test.ts`, `src/main/core/pmcc-timeline.test.ts`, `src/main/core/pmcc-timeline.property.test.ts` and `src/main/services/pmcc-timeline.test.ts` _(depends on: Area 1 Green ✓)_.
  - Replace "records a LEAPS sale as a negative LONG contribution" with "a LEAPS sale contributes nothing to the ledger".
  - Test cases:
    - The XYZ ledger is unchanged by a `LEAPS_CLOSE` `SELL` 24.10: `8.5000` / `850.0000` / `22.5000` / `93.5000` / `62.2222`. This holds with and without a `0.65` fee.
    - The timeline `CLOSE` row has `fees '0.6500'` and `total '2410.0000'`; every `basisAfter` and `summary` field is unchanged.
    - `legEvent` gives `LEAPS_CLOSE` with `fees` and no `contribution` key.
    - Only if US-115 has not landed: `lastShortRetiredOn` — `null` with no closing leg; `2027-07-16` for the Background without cycle 9; a later `SHORT_CALL_CLOSE` and a `SHORT_CALL_ASSIGNED` count; `LEAPS_CLOSE` and `ROLL_FROM` do not.
  - Property cases (`pmcc-timeline.property.test.ts`):
    - Sale invariance: appending a `LEAPS_CLOSE` event changes no `basisAfter`, `costPerShare` or `summary` field, and adds exactly one `CLOSE` row.
  - Update the `LEAPS_CLOSE` arbitrary in `src/main/core/test-fixtures/arbitraries.ts` to carry `fees`.
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts src/main/core/pmcc-timeline.test.ts src/main/core/pmcc-timeline.property.test.ts src/main/services/pmcc-timeline.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement in `src/main/services/pmcc-ledger.ts`, `src/main/core/pmcc-timeline-types.ts`, `src/main/core/pmcc-timeline.ts` and `src/main/services/pmcc-timeline.ts` _(depends on: Area 4 Red ✓)_.
  - `PMCC_LEG_SIDE: Record<PmccBasisLegRole, PmccLedgerSide>`.
  - `legContribution` takes `LegWithRole<PmccBasisLegRole>`.
  - `pmccLedgerFromLegs` and `orderedLedgerEvents` filter with `isPmccBasisLegRole`.
  - The timeline's `LEAPS_CLOSE` union member gets `fees` and no `LedgerEventBase`.
  - `applyEvent` appends the `CLOSE` row without touching the contribution prefix.
  - `lastShortRetiredOn(legs)` per US-115's plan Area 4, only if absent.
  - Run the same tests, then the whole US-103 and US-109 suites. All must pass.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 4 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: `isPmccBasisLegRole` as the only place that names settlement roles.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.
  - Run `pnpm test:mutation --mutate src/main/core/pmcc-timeline.ts`. No new survivor may appear.

### Area 5 — Terminal snapshot writer

Same agent as Area 4, after it.

- [ ] **[Red]** Write failing tests in `src/main/services/pmcc-ledger.test.ts` _(depends on: Area 4 Refactor ✓)_.
  - Test cases:
    - `PMCC_LEAPS_CLOSED` with `finalPnl '1560.0000'` writes `final_pnl '1560.0000'`, `basis_per_share '8.5000'`, `total_premium_collected '1400.0000'` and `snapshot_at '2027-07-19'`.
    - The result's `snapshot.finalPnl` is `'1560.0000'`.
    - A non-terminal trigger still writes `NULL`.
    - The prior snapshot row is unchanged, and the row count goes up by 1.
    - `// @ts-expect-error` for a terminal trigger with no `finalPnl`, and for `finalPnl` on `PMCC_SHORT_ROLL`.
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement `appendPmccSnapshot<T>` in `src/main/services/pmcc-ledger.ts` _(depends on: Area 5 Red ✓)_.
  - Add `AppendPmccSnapshotOptions<T>` and `AppendedPmccSnapshot<T>`, conditional types over `PmccTerminalTriggerEvent`, per `data-model.md` § 3.3.
  - Bind `finalPnl ?? null`. The existing callers stay unchanged.
  - Run the same tests; all must pass. Then run `pnpm typecheck`.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 5 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

### Area 9 — Renderer: close view helpers

- [ ] **[Red]** Write failing tests in `src/renderer/src/lib/pmcc-close-view.test.ts` _(depends on: Area 2 Green ✓)_.
  - Test cases (full list in `plan.md` Area 9 Red):
    - LEAPS card: `2028-01-21 · 186 DTE`, `2027-07-09 at $23.50`, `$22.50 / share`, `$24.10 ($23.80 × $24.40)`, `0.81` and `$18.10 · $6.00`; `saleHint` `defaults to the mid · bid $23.80 · ask $24.40`. Each reads `—` with no snapshot or price, and `saleHint` is `no quote — type your fill`.
    - Position card:
      - the XYZ line `8 cycles · $14.00 / share credits realized · 62.2% of LEAPS cost recovered · held since 2026-09-14`;
      - `$8.50 / share ($850.00)` and `$93.50`;
      - the LEAPS-only line `0 cycles · no short call was ever sold · held since 2027-06-01`.
    - Result:
      - the cash lines for 24.10, fees 0.65, 3 contracts and no cycles;
      - `+$1,560.00` / `gain` / `+183.5% of basis`;
      - the reconciliation line;
      - 6.40 → `−$210.00` / `loss` and the loss note;
      - unpriced → `null`;
      - basis ≤ 0 → `percentOfBasis null`;
      - a loss from fees alone → `lossNote null`;
      - credits ≤ 0 → `lossNote null`: `LEAPS_ONLY` sale `15.00` (`−$480.00`, credits `0`), and credits `-0.5000` with sale `6.40`; the XYZ 6.40 case (credits `14.00`) is the positive control;
      - no field equals `+$160.00`.
    - Success: `held 308 days · 8 cycles · 62.2% of LEAPS cost recovered by credits`.
  - Run `pnpm test src/renderer/src/lib/pmcc-close-view.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement `src/renderer/src/lib/pmcc-close-view.ts` _(depends on: Area 9 Red ✓)_.
  - Builders `closePmccLeapsCard`, `closePmccPositionCard`, `closePmccResult` and `closePmccSuccess`, typed per `data-model.md` § 6. `ClosePmccResultView` is the object `| null`.
  - `closePmccResult` calls `settlePmccClose`; `lossNote` only when `finalPnl < 0`, sale < LEAPS cost and `shortCreditsPerShare > 0`.
  - Intrinsic comes from `shortExtrinsic`.
  - Money is formatted with `fmtMoneyGrouped` / `signedMoneyGrouped`, using U+2212 for the minus.
  - Days are computed with `differenceInCalendarDays`.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` on `src/renderer/src/lib/pmcc-close-view.ts` _(depends on: Area 9 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: reuse the `pmcc-leaps-roll-view.ts` formatters.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 3 — Service (depends on Areas 2, 3, 4 and 5)

### Area 6 — Service: `closePmccPosition`

- [ ] **[Red]** Write failing tests in `src/main/services/close-pmcc-position.test.ts` _(depends on: Area 3 Green ✓, Area 5 Green ✓)_.
  - Seed with `seedPmccPosition` from `src/main/services/test-pmcc-seed.ts`. The fixture is the XYZ Background without cycle 9, with today `2027-07-19`.
  - Test cases (full list in `plan.md` Area 6 Red):
    - Happy path:
      - the leg row exactly as in `data-model.md` § 3.1;
      - the position is `PMCC_CLOSED` / `CLOSED` / `2027-07-19`;
      - the snapshot is `PMCC_LEAPS_CLOSED` / `8.5000` / `1560.0000`;
      - the result's `settlement` and `ledger`.
    - Defaults: the fill date is today and fees are `0.0000`.
    - Rounding: `24.12345` → `24.1235`; fees `0.65` → `1559.3500`.
    - Three contracts → `4680.0000`.
    - LEAPS only (today `2027-08-13`): `120.0000`, and `2027-05-31` → `before_leaps_open`.
    - Open short: `short_call_open`, nothing written, and the INFO log `pmcc_close_rejected`.
    - Rejections: closing twice → `invalid_phase`; a wheel → `invalid_phase`; an unknown id → `not_found`.
    - Storage failure through the `RAISE(ABORT)` trigger: no leg, still `PMCC_OPEN` / `ACTIVE`, `closed_date NULL`, and the ledger is still `8.5000`.
    - The INFO log `pmcc_position_closed`, with `finalPnl`.
  - Run `pnpm test src/main/services/close-pmcc-position.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement `src/main/services/close-pmcc-position.ts`, plus `ClosePmccPayloadSchema`, `ClosePmccPayload` and `ClosePmccPositionResult` in `src/main/schemas.ts` _(depends on: Area 6 Red ✓)_.
  - Signature: `closePmccPosition(db, positionId, payload, { today })`.
  - Load, compute the defaults, `money4`:
    - `loadPmccRollContext`;
    - the defaults and `money4`;
    - the floor from `pmccFillDateFloor`.
  - Validate and settle:
    - `closePmccLeaps`, inside `logPmccRollRejection(…, 'pmcc_close_rejected', …)`;
    - `pmccLedgerFromLegs`;
    - `settlePmccClose`.
  - Write, in one `db.transaction`: `insertLegRow`, then `UPDATE positions`, then `appendPmccSnapshot`, last.
  - Log at INFO and DEBUG.
  - Payload money is numbers, with no `.positive()` (`contracts/positions-close-pmcc.md`).
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` on `src/main/services/close-pmcc-position.ts` _(depends on: Area 6 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: move the "last short retired on" lookup into `pmcc-ledger.ts` beside `currentShortCallLeg`, where US-119 can use it.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 4 — IPC (depends on Area 6)

### Area 7 — IPC: `positions:close-pmcc` and preload

- [ ] **[Red]** Write failing tests in `src/main/ipc/positions.test.ts` _(depends on: Area 6 Green ✓)_.
  - Test cases:
    - The channel is registered.
    - With the clock at `2027-07-19T16:00:00Z` and no `fillDate`, the result is `ok: true` with `closedDate '2027-07-19'`.
    - With the clock at `2027-07-20T03:00:00Z`, a fill on `2027-07-20` → `cannot_be_future`.
    - A bad UUID → a `positionId` error.
    - `salePricePerShare: 0` → `must_be_positive`.
    - An open short → `short_call_open`.
  - Run `pnpm test src/main/ipc/positions.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement in `src/main/ipc/positions.ts`, `src/preload/index.ts` and `src/preload/index.d.ts` _(depends on: Area 7 Red ✓)_.
  - `registerParsedPositionHandler(…'positions:close-pmcc'…)`, with the `today` closure on `etDateOf(getCurrentDate())`.
  - Add `closePmcc` to the preload and its typings.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 7 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 5 — Renderer data (depends on Areas 3 and 7)

### Area 8 — Renderer: API adapter, mutation hook and form schema

- [ ] **[Red]** Write failing tests in `src/renderer/src/schemas/close-pmcc.test.ts` and `src/renderer/src/hooks/useClosePmccPosition.test.ts` _(depends on: Area 3 Green ✓, Area 7 Green ✓)_.
  - Test cases (full list in `plan.md` Area 8 Red):
    - The four field messages, each on its form path, each equal to the exported `pmcc-rules.ts` constant.
    - An empty sale is required, with no engine message.
    - Defaults: with the mid → `24.10`; with no mid → `''`; plus `2027-07-19` and `0.00`.
    - `toClosePmccPayload` → numbers.
    - The hook invalidates `positions` and `position(id)`, maps field errors, and treats `internal_error` as a save failure.
  - Run `pnpm test src/renderer/src/schemas/close-pmcc.test.ts src/renderer/src/hooks/useClosePmccPosition.test.ts`. Every new test must fail.
- [ ] **[Green]** Implement in `src/renderer/src/api/positions.ts`, `src/renderer/src/schemas/close-pmcc.ts`, `src/renderer/src/hooks/useClosePmccPosition.ts` and `src/renderer/src/hooks/useClosePmccForm.ts` _(depends on: Area 8 Red ✓)_.
  - The `closePmcc` adapter uses `throwMappedIpcErrors`.
  - `closePmccSchema(ctx)` calls `pmccLeapsCloseIssues` in `superRefine`, taking the first issue per path.
  - `useClosePmccForm` mirrors `useRollPmccLeapsForm`.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 8 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: share the decimal-string field helpers with `schemas/roll-pmcc-leaps.ts`.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 6 — Sheet (depends on Areas 8 and 9)

### Area 10 — Renderer: Close Position sheet

- [ ] **[Red]** Write failing tests in `src/renderer/src/components/ClosePmccSheet.test.tsx`, `ClosePmccForm.test.tsx` and `ClosePmccSuccess.test.tsx` _(depends on: Area 8 Green ✓, Area 9 Green ✓)_.
  - Mockup: `ClosePositionSheet`, presets `close-*`.
  - Test cases (full list in `plan.md` Area 10 Red):
    - Header and card texts.
    - Defaults: `24.10` / `2027-07-19` / `0.00`; the sale hint shows bid and ask (`defaults to the mid · bid $23.80 · ask $24.40`).
    - Editing to `6.40`: `−$210.00` in `text-wb-red`, the gold loss note, and confirm enabled.
    - Each invalid input shows its error beside the field and disables confirm.
    - No snapshot: an empty sale, the `no quote — type your fill` hint, the placeholder, then figures once a price is typed.
    - Submit sends a single payload and stays single-flight.
    - `short_call_open` goes to the alert; `before_short_retired` goes to `Fill date`.
    - A save failure shows its message, and the entries are kept.
    - Success: `PMCC closed`, `+$1,560.00`, the summary line, no `annualized` / `/yr`, and `Back to positions` → `/`.
    - Width 460, and the roll dialogs stay at 440.
  - Run `pnpm test src/renderer/src/components/ClosePmcc`. Every new test must fail.
- [ ] **[Green]** Implement `ClosePmccSheet.tsx`, `ClosePmccForm.tsx` and `ClosePmccSuccess.tsx`, plus a `width` prop on `PmccRollSheetDialog.tsx` _(depends on: Area 10 Red ✓)_.
  - Follow the mockup anatomy in `plan.md` Area 10, with `wb-*` tokens only.
  - Fetch the LEAPS snapshot with `useOptionSnapshots` and `buildOccSymbol`.
  - The `today` prop defaults to `newYorkToday()`.
  - Submit through `useRollSheetSubmit`, with error routing keyed by `Record<CloseErrorField, keyof ClosePmccFormValues>`.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` on the three sheet files _(depends on: Area 10 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: a shared `LeapsStatGrid` with the Roll LEAPS sheet, if the two match.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 7 — Page wiring (depends on Area 10)

### Area 11 — Header action and page wiring

- [ ] **[Red]** Write failing tests in `src/renderer/src/components/PositionDetailActions.test.tsx`, `src/renderer/src/pages/PositionDetailPage.test.tsx` and `src/renderer/src/pages/PositionDetailContent.test.tsx` _(depends on: Area 10 Green ✓)_.
  - Test cases:
    - LEAPS-only `PMCC_OPEN` shows `close-pmcc-btn` and `roll-pmcc-leaps-btn`.
    - With a short open there is no `close-pmcc-btn`; `roll-pmcc-short-btn` is the positive control.
    - `PMCC_CLOSED` shows no buttons, only the `PMCC Closed` badge.
    - Wheel phases show no `close-pmcc-btn` and keep their existing buttons.
    - The page opens the sheet with today taken from `pmccTimeline.valuationDate`.
    - The closed-PMCC banner reads `Closed on 2027-07-19 · Final P&L +$1,560.00`; the wheel banner is unchanged.
    - Badge: LEAPS-only `PMCC_OPEN` reads `LEAPS open · no short call` via `pmccCoverageLabel`; with a short open, `LEAPS + short call open`.
    - Closed labels: `PmccCostBasis` `closed` → `Cost basis at close / share`; closed `PmccCard` → `Cost basis at close`; open ones keep `Cost basis / share` / `Cost basis`.
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx src/renderer/src/components/position-cockpit/PmccCostBasis.spec.tsx src/renderer/src/components/position-card src/renderer/src/pages`. Every new test must fail.
- [ ] **[Green]** Implement in `PositionDetailActions.tsx`, `usePositionDetailSheets.ts`, `PositionDetailPage.tsx`, `PositionDetailContent.tsx`, `PmccCostBasis.tsx` and `PmccCard.tsx` _(depends on: Area 11 Red ✓)_.
  - `PhaseBadge label={pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })}` for `PMCC_OPEN` (create `lib/pmcc-coverage.ts` per US-115 Area 9 if absent); `PMCC_CLOSED` keeps `PHASE_LABEL`.
  - The "at close" basis labels on closed surfaces.
  - Gate every PMCC button on `phase === 'PMCC_OPEN'`.
  - Add the `onClosePmcc` prop and the `closePmcc` sheet kind.
  - Pass `pmccOpenLegs.long`, `pmccLedger`, `pmccTimeline` and `underlyingPrice`.
  - Do not change `pmccOpenLegs`.
  - Run the same tests; all must pass.
- [ ] **[Refactor]** Run `/refactor` _(depends on: Area 11 Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Consider: one `strategyType === 'PMCC' && phase === 'PMCC_OPEN'` fragment, as the precursor of US-118's `pmccActionsFor`.
  - Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Layer 8 — E2E Tests

**Requires:** every Green task in the earlier layers ✓

### Area 12 — E2E Tests

- [ ] **[Red]** Write failing e2e tests in `e2e/pmcc-close-position.spec.ts` and `e2e/pmcc-close-helpers.ts` _(depends on: all Green tasks ✓)_.
  - Run `pnpm rebuild:electron` first.
  - Helpers:
    - `launchClose({ fakeNow, quotes })`, with `WHEELBASE_FAKE_NOW=2027-07-19T16:00:00Z` by default;
    - quote presets `XYZ_HEALTHY`, `XYZ_BROKEN` and `NO_LEAPS_QUOTE` (LEAPS OCC `XYZ280121C00085000`);
    - sheet locators;
    - `dbRows`.
  - In `e2e/pmcc-timeline-helpers.ts`: export `seedPmcc` and add `VARIANTS.leapsOnlyAfterCycle8 = { patch: { c9Sell: null } }`.
  - One `it()` per scenario or outline row. Names mirror the AC, and assertions are the literals in `plan.md` Area 12.
  - AC coverage:
    - AC-1: Close the position by selling the LEAPS → `it('Close the position by selling the LEAPS')`. It asserts `+$1,560.00` and the absence of `+$160.00`, and checks no `broker:` channel.
    - AC-2: The sheet shows what is being sold and what it settles against → `it('The sheet shows what is being sold and what it settles against')`. The sale hint shows bid and ask beside the mid.
    - AC-3: The preview reconciles proceeds to the cost basis before confirming → `it('The preview reconciles proceeds to the cost basis before confirming')`
    - AC-4: Fees reduce the realized figure and are counted once → `it('Fees reduce the realized figure and are counted once')`
    - AC-5: A losing close is allowed and shown as one → `it('A losing close is allowed and shown as one')`. Relaunch with `XYZ_BROKEN`; the BROKEN lane is an `it.todo` pending US-118.
    - AC-6: Proceeds scale with contracts, per-share figures do not → `it('Proceeds scale with contracts, per-share figures do not')`
    - AC-7: A LEAPS that never had a short call closes against its own cost → `it('A LEAPS that never had a short call closes against its own cost')`. Relaunch at 2027-08-13.
    - AC-8: Selling the LEAPS under an open short call is refused → `it('Selling the LEAPS under an open short call is refused')`. The button is absent on `healthy` and present on `leaps-only`; a direct `closePmcc` is rejected and nothing is written.
    - AC-9: Reject invalid close input, sale price $0.00 → `it('Reject invalid close input — sale price $0.00')`
    - AC-10: Reject invalid close input, fill date 2027-07-15 → `it('Reject invalid close input — fill date 2027-07-15')`
    - AC-11: Reject invalid close input, fill date 2027-07-20 → `it('Reject invalid close input — fill date 2027-07-20')`
    - AC-12: Reject invalid close input, fees −$1.00 → `it('Reject invalid close input — fees −$1.00')`
    - AC-13: The sheet works with no quote → `it('The sheet works with no quote')`
    - AC-14: A failed save leaves the position open → `it('A failed save leaves the position open')`. Use the `RAISE(ABORT)` trigger on `cost_basis_snapshots`.
    - AC-15: Success state closes the loop → `it('Success state closes the loop')`
    - AC-16: The closed position renders from the terminal snapshot → `it('The closed position renders from the terminal snapshot')`. The drawer and list card label the basis `Cost basis at close`; the CLOSED lanes and `0 open` are an `it.todo` pending US-118.
    - AC-17: The wheel is unchanged → `it('The wheel is unchanged')`
  - Run `pnpm test:e2e e2e/pmcc-close-position.spec.ts`. Every new test must fail for the right reason. Because Layers 1–7 are complete, a test that already passes must be shown falsifiable: break its fixture or expected literal once and confirm it fails.
- [ ] **[Green]** Make the e2e tests pass _(depends on: E2E Red ✓)_.
  - A failure means an earlier area is incomplete. Fix it there, not in the spec.
  - Run `pnpm test:e2e`. All tests must pass, including `pmcc-cost-basis`, `pmcc-leg-timeline`, `pmcc-leaps-roll`, `pmcc-short-call-roll`, `pmcc-position-card`, `csp-flow` and `call-away`.
- [ ] **[Refactor]** Run `/refactor` on the e2e tests _(depends on: E2E Green ✓)_.
  - **Invoke the `/refactor` skill.** Do not skip it or treat it as a visual review.
  - Keep the variants as patches over US-109's Background literal.

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] Core-engine areas have property tests, or a stated "no property" reason:
  - Area 1: vocabulary only;
  - Areas 2, 3 and 4: properties named in `plan.md`.
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint and typecheck clean)
- [ ] No reproducible, non-equivalent surviving mutant in `settlePmccClose`, `pmccFillDateFloor`, `pmccLeapsCloseIssues` or `closePmccLeaps`
- [ ] E2E tests cover every AC: 17 of 17 (14 scenarios, the outline as 4). The US-118-dependent clauses are named `it.todo`s.
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format`, all clean
- [ ] `/update-spec us-120` run before the plan directory is removed. It must cover:
  - `PMCC_CLOSED` in `docs/spec/domain/wheel-lifecycle.md`;
  - retiring `PMCC_LEAPS_ONLY` in the `pmcc-phase-and-leg-role-names` ADR;
  - the `LEAPS_CLOSE` exclusion in `pmcc-contributions-by-role-and-action`.
