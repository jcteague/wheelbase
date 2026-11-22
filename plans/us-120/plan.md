---
story: us-120
kind: feature
parent: null
topics: [pmcc, cost-basis, lifecycle, ipc-handlers, sheets]
status: planned
---

# Implementation Plan: US-120 — Close a PMCC by selling the LEAPS

## Summary

A PMCC holding only its LEAPS gains a `Close Position →` header action. It opens a 460 px sheet
where the trader records the LEAPS sale (price, date, fees) and sees the realized result
reconciled to the US-103 cost basis before confirming. Confirming writes one `LEAPS_CLOSE`
`SELL` leg, moves the position to the new terminal phase `PMCC_CLOSED` (`status = 'CLOSED'`,
`closed_date`), and appends a terminal snapshot carrying `final_pnl`, all in one transaction.
This mirrors the wheel's US-4 / US-10 close paths. Two pure engines do the work:
`closePmccLeaps`, which checks the naked-call rule and the input rules, and `settlePmccClose`,
which computes proceeds and the final P&L. The renderer's preview calls the same
`settlePmccClose`. The sale is excluded from the US-103 ledger, so every read surface keeps
the $8.50 basis after the close. Done means all 17 e2e tests pass (13 scenarios plus the 4
outline rows) and the wheel close path is unchanged.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** Linear [OPT-26](https://linear.app/optionswheel/issue/OPT-26) (`US-120`). Linear is the source; there is no story file.
- **Mockup:** `mockups/epic-09-pmcc-position-detail.mdx`:
  - `ClosePositionSheet`.
  - Presets `close-position`, `close-losing`, `close-3ct`, `close-no-cycles`, `close-no-quote` and `close-success`, all in the `close` group.
  - Page presets `leaps-only` and `closed-sold`.
- **Research & Design Decisions:** `plans/us-120/research.md`
- **Data Model & Type Design:** `plans/us-120/data-model.md`
- **API Contracts:** `plans/us-120/contracts/positions-close-pmcc.md`
- **Quickstart & Verification:** `plans/us-120/quickstart.md`

Four decisions differ from the story's Technical Notes. All four are recorded in `research.md`, and Linear was not edited:

- The final P&L settles against the recomputed ledger's `basisTotal` instead of `snapshot × 100 × contracts`.
- Money crosses IPC as numbers.
- `settlePmccClose` also returns `percentOfBasis`.
- `LEAPS_CLOSE` leaves the US-103 ledger.

## Prerequisites

Already on `main`:

- US-101 PMCC positions and the `LEAPS_CLOSE` role.
- US-103 `calculatePmccLedger`, `pmccLedgerFromLegs`, `appendPmccSnapshot` and `currentLeapsLeg`.
- US-104 / US-105 `loadPmccRollContext`, `requirePmccOpenLegs`, `logPmccRollRejection`, `PmccRollSheetDialog` and `useRollSheetSubmit`.
- US-109 `pmccTimeline` on `positions:get`, `etDateOf(getCurrentDate())`, `_test:pmcc-seed-position` and `e2e/pmcc-timeline-helpers.ts`.
- US-4 / US-10 close services (the pattern to mirror).
- `shortExtrinsic`, `fmtMoneyGrouped`, `signedMoneyGrouped` and `fmtPct1`.

Not blocking:

- **US-119.** It is the real route to the LEAPS-only state. E2e seeds that state directly.
- **US-118.** It owns the action map and the CLOSED lanes. Until it lands, the button goes in `PositionDetailActions`.
- **US-111.** It shares `PMCC_CLOSED` and `LEAPS_CLOSE`. Whichever story lands first names them.

No migration.

## Implementation Areas

### 1. Vocabulary — terminal phase, settlement role and terminal trigger

**Files to create or modify:**

- `src/main/core/types.ts`:
  - add `PMCC_CLOSED` to `WheelPhase`;
  - widen `PmccPhase`;
  - add `PmccOpenPhase`, `PmccClosedPhase`, `PmccSettlementLegRole`, `PmccBasisLegRole` and `isPmccBasisLegRole`.
- `src/main/core/types.test.ts`
- `src/main/schemas.ts`: add `PMCC_LEAPS_CLOSED` to `PmccTriggerEvent`; add `PmccTerminalTriggerEvent`.
- `src/main/pmcc-phase.ts` and `src/main/pmcc-phase.test.ts`: add `PMCC_CLOSED: true`.
- `src/renderer/src/api/positions.ts`: add `PMCC_CLOSED` to the `WheelPhase` mirror.
- `src/renderer/src/lib/phase.ts` and `src/renderer/src/lib/phase.test.ts`: add the four map entries.

**Red — tests to write:**

- `WheelPhase.options` contains `'PMCC_CLOSED'` exactly once.
- `isPmccLegRole('LEAPS_CLOSE')` is `true`, and `isPmccBasisLegRole('LEAPS_CLOSE')` is `false`.
- `isPmccBasisLegRole` is `true` for `LEAPS_OPEN` and each of the four `SHORT_CALL_*` roles.
- `PmccTriggerEvent.options` contains `'PMCC_LEAPS_CLOSED'`.
- `isKnownPmccPhase('PMCC_CLOSED')` is `true`. `toPmccListPhase('PMCC_CLOSED')` keeps the literal.
- `PHASE_LABEL.PMCC_CLOSED` is `'PMCC Closed'`, `PHASE_LABEL_SHORT.PMCC_CLOSED` is `'Closed'`, and `PHASE_TOKEN.PMCC_CLOSED` is `'text-muted'`.
- Type-level (`expectTypeOf`):
  - `PmccClosedPhase` is `'PMCC_CLOSED'`;
  - `PmccBasisLegRole` excludes `'LEAPS_CLOSE'`;
  - `PmccTerminalTriggerEvent` is `'PMCC_LEAPS_CLOSED'`.
- Properties: none. This area is vocabulary only and has no behaviour to generate inputs for.

**Green — implementation:**

- Add these types, named as `data-model.md` § Type Design gives them:
  - `PmccPhase` / `PmccOpenPhase` / `PmccClosedPhase`, an `Extract` chain;
  - `PmccSettlementLegRole` / `PmccBasisLegRole`, `Extract` / `Exclude`;
  - `PmccTerminalTriggerEvent`, an `Extract`.
- Let `pnpm typecheck` find every exhaustive `Record<WheelPhase, …>` / `Record<PmccPhase, …>` and fill in each one.
- Leave `requirePmccOpenPhase` and the `phase = 'PMCC_OPEN'` filters (alerts, jobs) unchanged. A closed PMCC must stay outside them.

**Refactor — cleanup to consider:**

- Type `requirePmccOpenPhase`'s guard as `asserts phase is PmccOpenPhase`, if it is not already narrowed.

**Acceptance criteria covered:**

- "The closed position renders from the terminal snapshot" (phase badge), as groundwork.
- "Close the position by selling the LEAPS" (terminal phase).

### 2. Core engine — `settlePmccClose`

**Files to create or modify:**

- `src/main/core/costbasis.ts`: add `settlePmccClose`, `PmccCloseSettlementInput` and `PmccCloseSettlement`.
- `src/main/core/costbasis.test.ts`
- `src/main/core/costbasis.property.test.ts`

**Red — tests to write.** Every expected value is a literal from `data-model.md` § 7.

- Happy path. Inputs: `24.10` × 1, fees `0`, basis `850`. Expect:
  - `proceeds` `2410.0000`;
  - `settlementCash` `2410.0000`;
  - `finalPnl` `1560.0000`;
  - `percentOfBasis` `183.5294`.
- Fees `0.65`: `settlementCash` `2409.3500` and `finalPnl` `1559.3500`.
- Losing close, `6.40`: `finalPnl` `-210.0000` and `percentOfBasis` `-24.7059`.
- Three contracts, basis `2550`: `proceeds` `7230.0000` and `finalPnl` `4680.0000`.
- No cycles, `21.00`, basis `1980`: `finalPnl` `120.0000`.
- Basis `0` or `-150` gives `percentOfBasis: null`, and `finalPnl` is still computed.
- Rounding. Inputs: `20.0001`, fees `0.0090`, basis `2000.0000`. Expect:
  - `proceeds` `2000.0100`;
  - `settlementCash` `2000.0010`;
  - `finalPnl` `0.0010`;
  - `percentOfBasis` `0.0001`. This is the `ROUND_HALF_UP` literal; `ROUND_HALF_EVEN` gives `0.0000`.
- `contracts` `0`, `1.5` or `-1`, and a non-numeric price, each throw `RangeError`.

**Property** (`costbasis.property.test.ts`; arbitraries use 4-dp decimal strings and contracts 1–50):

- **Reconciliation.** `finalPnl = proceeds − fees − basisTotal` exactly, and `settlementCash = proceeds − fees`.
- **Scaling.** With contracts × k and basis × k: `proceeds` and `finalPnl` scale by exactly k, and `percentOfBasis` is unchanged.
- **Monotonicity.** `finalPnl` is non-decreasing in the sale price and non-increasing in fees.
- **Sign.** `percentOfBasis` is null exactly when `basisTotal ≤ 0`. When it is non-null, its sign equals `finalPnl`'s.

**Green — implementation:**

- `settlePmccClose(input: PmccCloseSettlementInput): PmccCloseSettlement`, per `data-model.md` § 2.4.
  - Shares come from `sharesFromContracts`.
  - All arithmetic uses `Decimal`, and every output goes through `money4`.
  - `percentOfBasis` is `finalPnl ÷ basisTotal × 100` when `basisTotal > 0`, otherwise `null`.
- No I/O and no logging.

**Refactor — cleanup to consider:**

- Compare with `calculateCallAway`'s final-P&L arithmetic. Extract a shared `realizedAgainstBasis` only if the two become identical.

**Acceptance criteria covered:**

- Engine half of:
  - "Close the position by selling the LEAPS";
  - "The preview reconciles proceeds to the cost basis before confirming";
  - "Fees reduce the realized figure and are counted once";
  - "A losing close is allowed and shown as one";
  - "Proceeds scale with contracts, per-share figures do not";
  - "A LEAPS that never had a short call closes against its own cost".

### 3. Core engine — close rules and `closePmccLeaps`

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts`: add `PmccCloseFloor`, `pmccCloseFillDateFloor`, `PmccLeapsCloseField`, `PmccLeapsCloseValues` and `pmccLeapsCloseIssues`, plus the message constants.
- `src/main/core/pmcc-rules.test.ts`
- `src/main/core/pmcc-rules.property.test.ts`
- `src/main/core/lifecycle.ts`: add `ClosePmccLeapsInput`, `ClosePmccLeapsAccepted` and `closePmccLeaps`.
- `src/main/core/lifecycle.test.ts`
- `src/main/core/lifecycle.property.test.ts`

**Red — tests to write:**

- **Floor:**
  - `pmccCloseFillDateFloor('2027-07-09', '2027-07-16')` gives `{ binding: 'SHORT_RETIRED', date: '2027-07-16' }`.
  - `('2027-06-01', null)` gives `{ binding: 'LEAPS_OPEN', date: '2027-06-01' }`.
  - A tie on `'2027-07-16'` gives `LEAPS_OPEN`.
  - `('2027-07-20', '2027-07-16')` gives `LEAPS_OPEN` on `2027-07-20`.
- **Issues**, each asserted on `field`, `code` and `message`:
  - Sale price `'0.0000'` and `'-1.0000'` give `salePricePerShare` / `must_be_positive` / `Sale price must be greater than zero`.
  - Fees `'-1.0000'` gives `fees` / `must_be_non_negative` / `Fees cannot be negative.`; fees `'0.0000'` passes.
  - `2027-07-15` against the short floor gives `fillDate` / `before_short_retired` / `Fill date cannot be before the last short call was retired (2027-07-16)`.
  - `2027-05-31` against the LEAPS floor gives `before_leaps_open` / `Fill date cannot be before the LEAPS was bought (2027-06-01)`.
  - On the floor date itself, no issue.
  - `2027-07-20` with today `2027-07-19` gives `fillDate` / `cannot_be_future` / `Fill date cannot be in the future`. On today itself, no issue.
  - An `undefined` sale price, fees or fill date gives no issue for that field.
  - The order is price → fees → floor → future.
- **Engine:**
  - `closePmccLeaps` with valid XYZ inputs returns `{ phase: 'PMCC_CLOSED' }`.
  - `currentPhase: 'CSP_OPEN'` or `'PMCC_CLOSED'` throws `ValidationError` `__phase__` / `invalid_phase`.
  - A non-null `openShort`, with otherwise valid inputs, throws `__root__` / `short_call_open` with the story's message.
  - With an open short and a bad sale price, it still throws `short_call_open`, because the naked-call rule comes first.
  - Each field issue above is thrown as the first issue.

**Property** (`pmcc-rules.property.test.ts`, `lifecycle.property.test.ts`):

- **Floor.** `floor.date` = max(leaps, retired). `binding` is `SHORT_RETIRED` exactly when `retired > leaps`.
- **Acceptance.** `pmccLeapsCloseIssues` is empty exactly when all of these hold: price > 0, fees ≥ 0, and `floor.date ≤ fillDate ≤ today`.
- **Undecided.** Making any field `undefined` never adds an issue.
- **Naked-call rule** (`closePmccLeaps`). For every input with `currentPhase: 'PMCC_OPEN'` and a non-null `openShort`, it throws code `short_call_open`. It never returns any value but `{ phase: 'PMCC_CLOSED' }`.

**Green — implementation:**

- `pmccCloseFillDateFloor(leapsFillDate, lastShortRetiredOn): PmccCloseFloor`. ISO dates compare as strings, and a tie goes to the LEAPS.
- `pmccLeapsCloseIssues(values): PmccIssue<PmccLeapsCloseField>[]`:
  - use `issueIf` in the order above;
  - choose the floor message with an exhaustive `switch (floor.binding)`;
  - export the messages as `const … satisfies PmccRule` so the renderer tests can import them.
- `closePmccLeaps(input: ClosePmccLeapsInput): ClosePmccLeapsAccepted`:
  - `requirePmccOpenPhase(input.currentPhase)`;
  - if `openShort !== null`, throw `ValidationError('__root__', 'short_call_open', …)`;
  - `const [first] = pmccLeapsCloseIssues(input)`, then `if (first) throwIssue(first)`;
  - return `{ phase: 'PMCC_CLOSED' }`.
- No I/O and no logging. `Fill date cannot be in the future` (no full stop) is the string `lifecycle.ts:92` uses. Reuse that constant rather than retyping it.

**Refactor — cleanup to consider:**

- Have `pmccCloseFillDateFloor` and US-105's `latestFillDate` share the "terminal short roles" list, if one already exists in `pmcc-ledger.ts`'s `currentShortCallLeg`.

**Acceptance criteria covered:**

- "Selling the LEAPS under an open short call is refused" (engine).
- "Reject invalid close input", all four rows (engine and form source).
- "A LEAPS that never had a short call closes against its own cost" (the floor message).

### 4. Ledger — the LEAPS sale is a settlement, not a contribution

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts`:
  - `PMCC_LEG_SIDE: Record<PmccBasisLegRole, …>`;
  - `legContribution(leg: LegWithRole<PmccBasisLegRole>)`;
  - `orderedLedgerEvents` / `pmccLedgerFromLegs` filter with `isPmccBasisLegRole`.
- `src/main/services/pmcc-ledger.test.ts`: replace "records a LEAPS sale as a negative LONG contribution".
- `src/main/core/pmcc-timeline-types.ts`: the `LEAPS_CLOSE` member gets `fees: string` and no `LedgerEventBase`.
- `src/main/core/pmcc-timeline.ts`: `applyEvent` handles `LEAPS_CLOSE` without touching `contributions`.
- `src/main/core/pmcc-timeline.test.ts` and `src/main/core/pmcc-timeline.property.test.ts`
- `src/main/services/pmcc-timeline.ts`: `legEvent`'s `LEAPS_CLOSE` case passes `fees: money4(leg.fees)`.
- `src/main/services/pmcc-timeline.test.ts`
- `src/main/core/test-fixtures/arbitraries.ts`: the `LEAPS_CLOSE` arbitrary carries `fees`, not `contribution`.

**Red — tests to write:**

- Ledger:
  - `pmccLedgerFromLegs` over the XYZ Background without cycle 9 gives `basisPerShare` `8.5000`, `basisTotal` `850.0000` and `leapsCostPerShare` `22.5000`. This holds with and without a `LEAPS_CLOSE` `SELL` 24.10 leg on 2027-07-19.
  - The same check passes with a $0.65 fee on the sale. The fee is counted in the settlement, not in the ledger.
  - `effectiveShareCost` `93.5000` and `premiumRecoveredPercent` `62.2222` are unchanged by the sale.
- Timeline:
  - A `LEAPS_CLOSE` event gives a `CLOSE` row with `fees '0.6500'` and `total '2410.0000'`.
  - Every `basisAfter` and every `summary` figure equals the figure without the event.
  - The existing "sorts after a same-day `SHORT_END`" test still passes.
- Service: `legEvent` maps a `LEAPS_CLOSE` leg with `fees '0.6500'` to `{ kind: 'LEAPS_CLOSE', fees: '0.6500' }` with no `contribution` key.

**Property** (`pmcc-timeline.property.test.ts`):

- **Sale invariance.** For any generated history, appending a `LEAPS_CLOSE` event on or after the last event leaves every `basisAfter`, `leapsTrack.costPerShare` and `summary` field unchanged, and adds exactly one `CLOSE` row.

**Green — implementation:**

- Make the type changes in `data-model.md` § 4, where `PmccBasisLegRole` is an `Exclude` and the timeline's `LEAPS_CLOSE` is a union member without a contribution.
- Fix each compile error the narrowed `PMCC_LEG_SIDE` raises.

**Refactor — cleanup to consider:**

- Make `isPmccBasisLegRole` the only place that names the settlement roles. US-111 adds its own settlement roles there.

**Acceptance criteria covered:**

- "Close the position by selling the LEAPS" (the basis is still $8.50).
- "Fees reduce the realized figure and are counted once" (the basis is not restated).
- "The closed position renders from the terminal snapshot" ($93.50, 62.2%, 8 cycles).
- "A failed save leaves the position open" (cost basis still $8.50).

### 5. Terminal snapshot writer

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts`: `appendPmccSnapshot<T>` with `AppendPmccSnapshotOptions<T>` / `AppendedPmccSnapshot<T>`.
- `src/main/services/pmcc-ledger.test.ts`

Areas 4 and 5 edit the same two files. Give both to one agent, Area 4 first.

**Red — tests to write:**

- Terminal snapshot:
  - `appendPmccSnapshot(db, id, { triggerEvent: 'PMCC_LEAPS_CLOSED', eventDate: '2027-07-19', now, finalPnl: '1560.0000' })` writes `final_pnl '1560.0000'`, `basis_per_share '8.5000'`, `total_premium_collected '1400.0000'` and `snapshot_at '2027-07-19'`.
  - The returned `snapshot.finalPnl` is `'1560.0000'`.
- A non-terminal trigger still writes `final_pnl NULL`, and its result is `finalPnl: null`.
- Type-level:
  - a terminal trigger without `finalPnl` is a compile error (`// @ts-expect-error`);
  - so is `finalPnl` passed with `'PMCC_SHORT_ROLL'`.
- Append-only: the prior snapshot row is unchanged and the row count rises by one.

**Green — implementation:**

- Add the conditional types `AppendPmccSnapshotOptions<T>` / `AppendedPmccSnapshot<T>`, per `data-model.md` § 3.3.
- In the `INSERT`, bind `options.finalPnl ?? null`.
- Leave the existing callers (`create-pmcc-position.ts`, `pmcc-roll-record.ts`, `test-pmcc-ledger.ts`) unchanged.

**Refactor — cleanup to consider:**

- Name the result type once, with no casts at the call sites.

**Acceptance criteria covered:**

- "Close the position by selling the LEAPS" (terminal snapshot).
- "The closed position renders from the terminal snapshot".

### 6. Service — `closePmccPosition`

**Files to create or modify:**

- `src/main/services/close-pmcc-position.ts`: new.
- `src/main/services/close-pmcc-position.test.ts`: new; in-memory DB through the migrations, legs seeded with `seedPmccPosition` (`src/main/services/test-pmcc-seed.ts`).
- `src/main/schemas.ts`: add `ClosePmccPayloadSchema`, `ClosePmccPayload` and `ClosePmccPositionResult`.

**Red — tests to write.** The fixture is the XYZ Background without cycle 9, with `today` `2027-07-19`.

- **Happy path.** Payload `{ salePricePerShare: 24.1, fillDate: '2027-07-19' }`. Expect:
  - exactly one new leg: `LEAPS_CLOSE` / `SELL` / `CALL` / `85.0000` / `2028-01-21` / 1 contract / `24.1000` / `fill_price '24.1000'` / `fees '0.0000'` / `roll_chain_id NULL`;
  - the position becomes `PMCC_CLOSED` / `CLOSED` / `closed_date '2027-07-19'`;
  - one new snapshot with `PMCC_LEAPS_CLOSED`, `basis_per_share '8.5000'` and `final_pnl '1560.0000'`;
  - a result whose `settlement.proceeds` is `'2410.0000'` and `ledger.basisPerShare` is `'8.5000'`.
- **Defaults.** With no `fillDate`, the leg and `closed_date` are `today`. With no `fees`, the fee is `0.0000`.
- **Money rounding.** Sale `24.12345` is stored as `24.1235`, and fees `0.65` as `0.6500`, with `final_pnl '1559.3500'` for 24.10.
- **Three contracts.** Leg `contracts 3`, `final_pnl '4680.0000'`.
- **LEAPS only** (`LEAPS_ONLY` legs, today `2027-08-13`):
  - sale 21 on `2027-08-13` gives `final_pnl '120.0000'`;
  - fill `2027-05-31` throws `before_leaps_open`.
- **Open short** (the full Background, today `2027-08-13`):
  - throws `short_call_open`;
  - leg count, snapshot count and the position row are unchanged;
  - an INFO log `pmcc_close_rejected` with `{ positionId, field: '__root__', code: 'short_call_open' }`.
- **Rejections.** A closed PMCC (closed a second time) throws `invalid_phase`; a wheel throws `invalid_phase`; an unknown id throws `not_found`. Nothing is written in any of these.
- **Storage failure.** A `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)` trigger makes the call throw. Afterwards there is no `LEAPS_CLOSE` leg, the phase is still `PMCC_OPEN` / `ACTIVE`, `closed_date` is `NULL`, and `pmccLedgerFromLegs` still gives `8.5000`.
- **Logging.** INFO `pmcc_position_closed` with `{ positionId, ticker, fillDate, finalPnl: '1560.0000' }`.

**Green — implementation:**

- Signature: `closePmccPosition(db, positionId, payload: ClosePmccPayload, { today }: { today: string }): ClosePmccPositionResult`.
- Steps:
  1. `loadPmccRollContext(db, positionId)` → `{ detail, openLegs }`.
  2. Compute `fillDate = payload.fillDate ?? today`, `salePrice = money4(payload.salePricePerShare)` and `fees = money4(payload.fees ?? 0)`.
  3. Compute the floor: `pmccCloseFillDateFloor(openLegs.long.fillDate, latest fillDate over SHORT_CALL_EXPIRED / _CLOSE / _ASSIGNED legs)`.
  4. Inside `logPmccRollRejection(positionId, 'pmcc_close_rejected', …)`, call `closePmccLeaps({ currentPhase: detail.position.phase, openShort: openLegs.short, salePricePerShare, fees, fillDate, floor, today })`.
  5. Read the ledger: `ledger = pmccLedgerFromLegs(detail.legs)`.
  6. Settle: `settlement = settlePmccClose({ salePricePerShare, contracts: openLegs.long.contracts, fees, basisTotal: ledger.basisTotal })`.
  7. Write, in one `db.transaction`:
     - `insertLegRow` for the leg in `data-model.md` § 3.1;
     - `UPDATE positions SET phase = 'PMCC_CLOSED', status = 'CLOSED', closed_date = ?, updated_at = ?`;
     - `appendPmccSnapshot(db, id, { triggerEvent: 'PMCC_LEAPS_CLOSED', eventDate: fillDate, now, finalPnl: settlement.finalPnl })`, last.
  8. Log at INFO, plus DEBUG checkpoints.
- `ClosePmccPayloadSchema` is per `contracts/positions-close-pmcc.md`. It is numbers only, with no `.positive()` (research ADR "Payload money as numbers").

**Refactor — cleanup to consider:**

- If the "latest terminal short fill" lookup also helps US-119's floor, move it next to `currentShortCallLeg` in `pmcc-ledger.ts` as `lastShortRetiredOn(legs)`.
- Keep the service under ~120 lines.

**Acceptance criteria covered:**

- Service half of:
  - "Close the position by selling the LEAPS";
  - "Fees reduce the realized figure and are counted once";
  - "Proceeds scale with contracts, per-share figures do not";
  - "A LEAPS that never had a short call closes against its own cost";
  - "Selling the LEAPS under an open short call is refused";
  - "A failed save leaves the position open".

### 7. IPC — `positions:close-pmcc` and preload

**Files to create or modify:**

- `src/main/ipc/positions.ts`: `registerParsedPositionHandler(…, ClosePmccPayloadSchema, (db, id, p) => closePmccPosition(db, id, p, { today: etDateOf(getCurrentDate()) }))`.
- `src/main/ipc/positions.test.ts`
- `src/preload/index.ts`: `closePmcc: (payload) => invoke('positions:close-pmcc', payload)`.
- `src/preload/index.d.ts`: `closePmcc(payload: ClosePmccPayload): Promise<IpcClosePmccResult>`.

**Red — tests to write:**

- The channel `positions:close-pmcc` is registered.
- With `getCurrentDate` fixed at `2027-07-19T16:00:00Z` and no `fillDate`, the response is `{ ok: true, … }` with `position.closedDate '2027-07-19'`.
- With the clock at `2027-07-20T03:00:00Z` (still the 19th in New York), a fill on `2027-07-20` is rejected `cannot_be_future`.
- A non-UUID `positionId` gives `ok: false` with the `positionId` field error.
- `salePricePerShare: 0` gives `ok: false`, `salePricePerShare` / `must_be_positive`.
- An open short gives `ok: false`, `__root__` / `short_call_open`.

**Green — implementation:**

- One registration. The `today` closure reads the same clock as `positions:get`.
- Add the preload and typings.

**Refactor — cleanup to consider:**

- None beyond keeping the registration next to `positions:roll-pmcc-leaps`.

**Acceptance criteria covered:**

- "Selling the LEAPS under an open short call is refused" (a direct request is rejected).
- "Reject invalid close input" (server half).

### 8. Renderer — API adapter, mutation hook and form schema

**Files to create or modify:**

- `src/renderer/src/api/positions.ts`: `closePmcc(payload)` adapter using `throwMappedIpcErrors`, as `rollPmccLeaps` does; re-export `ClosePmccPayload` and `ClosePmccResponse`.
- `src/renderer/src/hooks/useClosePmccPosition.ts` and `.test.ts`: `usePositionMutation`, invalidating `positions` and `position(id)` on success.
- `src/renderer/src/schemas/close-pmcc.ts` and `.test.ts`: `closePmccSchema(ctx)`, `ClosePmccFormValues`, `toClosePmccPayload` and `closePmccDefaults`.
- `src/renderer/src/hooks/useClosePmccForm.ts`: the form instance, mirroring `useRollPmccLeapsForm`.

**Red — tests to write:**

- **Schema.** `ctx` is `{ floor: { binding: 'SHORT_RETIRED', date: '2027-07-16' }, today: '2027-07-19' }`.
  - Sale `0` gives an error on `salePrice`: `Sale price must be greater than zero`.
  - Fill `2027-07-15` gives an error on `fillDate`: `Fill date cannot be before the last short call was retired (2027-07-16)`.
  - Fill `2027-07-20` gives `Fill date cannot be in the future`.
  - Fees `-1` gives an error on `fees`: `Fees cannot be negative.`
  - An empty sale gives `Enter a sale price` (the required-field message, so confirm stays disabled), and none of the engine's messages.
  - Each message equals the exported `pmcc-rules.ts` constant.
- **Defaults.** `closePmccDefaults({ mid: '24.1000', today })` gives `{ salePrice: '24.10', fillDate: '2027-07-19', fees: '0.00' }`. `closePmccDefaults({ mid: null, today })` gives `salePrice: ''`.
- **Payload.** `toClosePmccPayload({ salePrice: '24.10', fillDate: '2027-07-19', fees: '0.65' }, id)` gives `{ positionId: id, salePricePerShare: 24.1, fillDate: '2027-07-19', fees: 0.65 }`.
- **Hook.**
  - On success it invalidates `positions` and `position(id)`.
  - An `ok: false` with a field error rejects with mapped errors, so `useRollSheetSubmit` can route them.
  - `internal_error` rejects as a save failure.

**Green — implementation:**

- `closePmccSchema(ctx)` is a Zod object of decimal-string fields. Its `superRefine` calls `pmccLeapsCloseIssues`, maps `salePricePerShare` to `salePrice`, and adds the first issue per path.
- Undecided (unparsable) inputs are passed as `undefined`. This follows spec ADR `pmcc-validation-pure-engine-mirrored-by-form-schema`.

**Refactor — cleanup to consider:**

- Share the decimal-string field helpers with `schemas/roll-pmcc-leaps.ts` if they are copies.

**Acceptance criteria covered:**

- "Reject invalid close input", all four rows (the error beside the field, confirm disabled).
- "The sheet shows what is being sold and what it settles against" (defaults).
- "The sheet works with no quote" (empty default).

### 9. Renderer — close view helpers

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-close-view.ts`: new.
- `src/renderer/src/lib/pmcc-close-view.test.ts`: new.

**Red — tests to write.** All values are literals from `data-model.md` § 6–7.

- **`closePmccLeapsCard`.** Input is the held LEAPS, today `2027-07-19`, snapshot `{ bid '23.80', ask '24.40', mid '24.10', delta 0.81 }` and price `103.10`. Expect:
  - `expires '2028-01-21 · 186 DTE'`;
  - `bought '2027-07-09 at $23.50'`;
  - `leapsCost '$22.50 / share'`;
  - `mid '$24.10 ($23.80 × $24.40)'`;
  - `delta '0.81'`;
  - `intrinsicExtrinsic '$18.10 · $6.00'`.
- **With no snapshot**, `mid`, `delta` and `intrinsicExtrinsic` are each `'—'`. With a snapshot but no stock price, `intrinsicExtrinsic` is `'—'`.
- **`closePmccPositionCard`:**
  - XYZ: `line` `'8 cycles · $14.00 / share credits realized · 62.2% of LEAPS cost recovered · held since 2026-09-14'`;
  - `costBasis` `'$8.50 / share ($850.00)'` and `effectiveShareCost` `'$93.50'`;
  - LEAPS only: `line` `'0 cycles · no short call was ever sold · held since 2027-06-01'`;
  - one cycle reads `'1 cycle · …'`.
- **`closePmccResult`:**
  - 24.10 / 0 gives:
    - `cashLine` `'Proceeds $2,410.00 · fees $0.00 · cost basis $850.00'`;
    - `finalPnl` `'+$1,560.00'` with `tone 'gain'`;
    - `percentOfBasis` `'+183.5% of basis'`;
    - `reconciliation` `'LEAPS cost $22.50 − credits $14.00 = cost basis $8.50 / share · matches the Cost basis drawer'`;
    - `lossNote null`.
  - Fees 0.65 gives `'Proceeds $2,410.00 · fees $0.65 · cost basis $850.00'` and `'+$1,559.35'`.
  - 6.40 gives:
    - `finalPnl` `'−$210.00'` (U+2212) with `tone 'loss'`;
    - `lossNote` `'The LEAPS is being sold $16.10 / share below its cost to date; short-call credits of $14.00 recover all but $2.10'`.
  - Three contracts give `'Proceeds $7,230.00 · fees $0.00 · cost basis $2,550.00'` and `'+$4,680.00'`.
  - No cycles gives `'Proceeds $2,100.00 · fees $0.00 · cost basis $1,980.00'` and `'+$120.00'`.
  - Sale `''` or `'0'` gives `null`.
  - A basis of 0 or less gives `percentOfBasis null`.
  - A loss caused by fees alone, with the sale at or above the LEAPS cost, gives `lossNote null` (research Open Question 7).
  - The `+$160.00` trap: for 24.10, no field of the result is `'+$160.00'`.
- **`closePmccSuccess`.** Fill `2027-07-19` gives `summary` `'held 308 days · 8 cycles · 62.2% of LEAPS cost recovered by credits'`, and `finalPnl` `'+$1,560.00'`.

**Green — implementation:**

- Write the builders in `data-model.md` § 6.
  - `closePmccResult` calls `settlePmccClose` from `src/main/core/costbasis.ts`; there is no renderer arithmetic for the P&L.
  - Intrinsic comes from `shortExtrinsic`.
  - Days are computed with `differenceInCalendarDays`.
  - Figures come from `pmccLedger` and `pmccTimeline.summary` / `.start`, read rather than recomputed.

**Refactor — cleanup to consider:**

- `pmcc-leaps-roll-view.ts` may already format "bought … at …" and "N DTE". Reuse it.

**Acceptance criteria covered:**

- Display half of:
  - "The sheet shows what is being sold and what it settles against";
  - "The preview reconciles proceeds to the cost basis before confirming";
  - "Fees reduce the realized figure and are counted once";
  - "A losing close is allowed and shown as one";
  - "Proceeds scale with contracts, per-share figures do not";
  - "A LEAPS that never had a short call closes against its own cost";
  - "Success state closes the loop".

### 10. Renderer — Close Position sheet

**Files to create or modify:**

- `src/renderer/src/components/PmccRollSheetDialog.tsx`: `width?: number`, default 440.
- `src/renderer/src/components/ClosePmccSheet.tsx` and `.test.tsx`: the portal sheet; owns `useClosePmccForm`, `useClosePmccPosition` and `useRollSheetSubmit`, and fetches the LEAPS snapshot with `useOptionSnapshots`.
- `src/renderer/src/components/ClosePmccForm.tsx` and `.test.tsx`: the form state.
- `src/renderer/src/components/ClosePmccSuccess.tsx` and `.test.tsx`: the success state.

The mockup is `ClosePositionSheet` and the presets `close-*`. Its anatomy:

- Header: eyebrow `CLOSE POSITION`, title `XYZ $85.00 LEAPS · 2028-01-21`, subtitle `sell to close · position ends`.
- A `Your LEAPS` `SectionCard`, holding the `StatGrid` of the eight fields.
- A `This position` `SectionCard`, holding the position line plus `SummaryRow`s for `Cost basis` (highlighted) and `Effective share cost`.
- A two-column grid of `Sale price / share` (`$` prefix; hint `defaults to the mid` or `no quote — type your fill`), `Fill date` (`DatePicker`) and `Fees`.
- An emphasized `Result` card. Above its rows sits the `cashLine` (`data-testid="close-pmcc-cash-line"`). Its rows are `Proceeds · $24.10 × 100 sh`, `Fees` and `Cost basis`. Below them are the large `Final P&L` with `% of basis`, the reconciliation line and the gold loss note. When unpriced, it reads `Enter the sale price to preview the result.`
- `AlertBox variant="warning"`: `This closes the position. Full leg history is preserved.`
- Footer: `Cancel` · `Confirm Close` (`Closing…` while pending).

**Red — tests to write** (React Testing Library, `api` mocked):

- The header texts. Each `Your LEAPS` value from Area 9. The `This position` line, `$8.50 / share ($850.00)` and `$93.50`.
- The sale price input starts at `24.10`, the fill date at `2027-07-19` and fees at `0.00`. Editing the sale price to `6.40` updates the preview to `−$210.00` in `text-wb-red`, shows the loss note in `text-wb-gold`, and leaves `Confirm Close` enabled.
- The gain figure carries `text-wb-green`.
- Each of the four invalid inputs:
  - shows its message beside its field (`Field` error);
  - disables `Confirm Close`.
- **No snapshot.** The sale price is empty and the hint reads `no quote — type your fill`. The Result card shows the placeholder. Typing `24.10` shows the figures, and confirm is enabled.
- **Submit.** `api.closePmcc` is called once with `{ positionId, salePricePerShare: 24.1, fillDate: '2027-07-19', fees: 0 }`. A double click still calls it once (single flight).
- **Server field error.** `short_call_open` on `__root__` shows the alert. `fillDate` / `before_short_retired` lands on the `Fill date` field.
- **Internal error.** Shows `Could not close the position. Your entries are preserved. Try again.`, and the typed values remain.
- **Success.**
  - It shows `PMCC closed`, `+$1,560.00` and `held 308 days · 8 cycles · 62.2% of LEAPS cost recovered by credits`.
  - Absent: `annualized`, and any `% /yr` or `/yr` text. Positive control: `Final P&L` is found.
  - `Back to positions` navigates to `/`.
- The dialog has width 460, its `aria-label` is `Close Position`, and the roll dialogs stay at 440.
- **Wheel guard.** The sheet is not importable from any wheel close component. Assert it statically: `CloseCspForm.test.tsx` still finds no `LEAPS`, `cycle` or `Effective share cost` text.

**Green — implementation:**

- Build the components to the mockup with `wb-*` tokens only. `ClosePmccForm` reads `useWatch` and renders `closePmccResult(…)`.
- The `today` prop defaults to `newYorkToday()`, and the page passes `pmccTimeline.valuationDate` (research ADR "Today").
- The LEAPS OCC symbol comes from `buildOccSymbol`, and the mid default from the snapshot's `mid`, via `usableSnapshot`.
- Follow spec ADR `sheet-component-pattern`: past ~200 lines, split into three files.

**Refactor — cleanup to consider:**

- Run `/refactor` on the three files. Extract a `LeapsStatGrid` only if the roll sheet's `Your LEAPS` card matches.

**Acceptance criteria covered:**

- Component half of:
  - "The sheet shows what is being sold and what it settles against";
  - "The preview reconciles proceeds to the cost basis before confirming";
  - "A losing close is allowed and shown as one";
  - "Reject invalid close input";
  - "The sheet works with no quote";
  - "A failed save leaves the position open";
  - "Success state closes the loop".

### 11. Header action and page wiring

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.tsx` and `.test.tsx`:
  - every PMCC button is gated on `phase === 'PMCC_OPEN'`;
  - new `onClosePmcc` prop;
  - `Close Position →` (`data-testid="close-pmcc-btn"`) shows when `hasOpenLeaps && !hasOpenShortCall`.
- `src/renderer/src/pages/usePositionDetailSheets.ts`: a `closePmcc` sheet kind, plus `handleClosePmcc` / `handleCloseClosePmcc`.
- `src/renderer/src/pages/PositionDetailPage.tsx`: render `ClosePmccSheet` with:
  - `pmccOpenLegs.long`, `pmccLedger` and `pmccTimeline`;
  - `underlyingPrice`;
  - `today = pmccTimeline.valuationDate`.
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
- `src/renderer/src/pages/PositionDetailContent.tsx` and `.test.tsx`: for a PMCC whose latest snapshot has a non-null `finalPnl`, the closed banner reads `Closed on 2027-07-19 · Final P&L +$1,560.00`, in green or red by sign.

**Red — tests to write:**

- **`PositionDetailActions`, PMCC:**
  - `PMCC_OPEN` with LEAPS and no short shows `close-pmcc-btn` and `roll-pmcc-leaps-btn`, and no `roll-pmcc-short-btn`.
  - `PMCC_OPEN` with LEAPS and a short shows no `close-pmcc-btn`. `roll-pmcc-short-btn` is present as a positive control.
  - `PMCC_CLOSED`, with `hasOpenLeaps` still true, shows no button at all (only the phase badge, `PMCC Closed`).
  - A click calls `onClosePmcc`.
- **`PositionDetailActions`, wheel.** `CSP_OPEN`, `HOLDING_SHARES`, `CC_OPEN` and `WHEEL_COMPLETE` with strategy `WHEEL` show no `close-pmcc-btn`, and each keeps its existing buttons.
- **Page.** Clicking `Close Position →` opens the sheet with today `2027-07-19` from `pmccTimeline.valuationDate`. On success the position query is invalidated.
- **Content.** A closed PMCC shows `Final P&L +$1,560.00` in the banner. A closed wheel's banner is unchanged.

**Green — implementation:**

- Add the conditions and wiring above. `pmccOpenLegs` itself is not changed (research ADR "Header actions").

**Refactor — cleanup to consider:**

- `PositionDetailActions` now has three PMCC buttons, with US-115 / US-119 adding more. Group them in one `strategyType === 'PMCC' && phase === 'PMCC_OPEN'` fragment. This is the precursor of US-118's `pmccActionsFor`.

**Acceptance criteria covered:**

- "Selling the LEAPS under an open short call is refused" (button absent).
- "The closed position renders from the terminal snapshot" (no header actions; Final P&L).
- "The wheel is unchanged" (no button on any wheel phase).

### 12. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-close-position.spec.ts`: new.
- `e2e/pmcc-close-helpers.ts`: new. It contains:
  - `launchClose({ fakeNow, quotes })`, built on `buildLaunchEnv` with `WHEELBASE_FAKE_NOW`, `WHEELBASE_MOCK_STOCK_QUOTES` and `WHEELBASE_MOCK_OPTION_SNAPSHOTS`;
  - quote presets `XYZ_HEALTHY` (`flatStockQuote('103.10')`; `XYZ280121C00085000` → `optionSnapshot('23.80', '24.40', '24.10', { delta: 0.81 })`), `XYZ_BROKEN` (`83.10`; `6.10 × 6.70`, mid `6.40`, delta 0.42) and `NO_LEAPS_QUOTE`;
  - `openCloseSheet(page)` and `closeSheet(page)` locators;
  - `typeSale`, `typeFees` and `pickFillDate`;
  - `dbRows(dbPath)`, which reads legs, the position and snapshots through `sqlite`.
- `e2e/pmcc-timeline-helpers.ts`:
  - export `seedPmcc`;
  - add `VARIANTS.leapsOnlyAfterCycle8 = { patch: { c9Sell: null } }`.

Every PMCC test seeds through `_test:pmcc-seed-position` (research ADR "E2e seeds the LEAPS-only state directly"), opens the detail page, and reads figures as literals that no fallback can produce. The tests are numbered in AC order.

**Red — tests to write** (one `it()` per scenario or outline row; names mirror the AC):

1. **Close the position by selling the LEAPS.** At 2027-07-19 with `XYZ_HEALTHY`:
   - Click `Close Position →`, type sale `24.10` and fill `2027-07-19`, then confirm.
   - The DB holds one `LEAPS_CLOSE` / `SELL` leg at `24.1000` on `2027-07-19`.
   - The position reads `PMCC_CLOSED` / `CLOSED` / `2027-07-19`.
   - The latest snapshot holds `final_pnl '1560.0000'` and `basis_per_share '8.5000'`.
   - The success state reads `+$1,560.00`, and `+$160.00` is absent anywhere in the sheet (the LEAPS-leg-alone trap the story names).
   - The `Cost basis` drawer reads `$8.50`.
   - `invokedIpcChannels` contains `positions:close-pmcc` and no channel starting `broker:`.
2. **The sheet shows what is being sold and what it settles against.**
   - `Your LEAPS` reads `$85.00`, `2028-01-21 · 186 DTE`, `2027-07-09 at $23.50`, `1`, `$24.10 ($23.80 × $24.40)` and `$18.10 · $6.00`.
   - The position line contains `8 cycles · $14.00 / share credits realized · 62.2% of LEAPS cost recovered · held since 2026-09-14`.
   - The sale input is `24.10` and editable: retype `24.05` and it reads `24.05`.
   - The fill date is `2027-07-19` and fees are `0.00`.
3. **The preview reconciles proceeds to the cost basis before confirming.** With `24.10`:
   - `close-pmcc-cash-line` reads `Proceeds $2,410.00 · fees $0.00 · cost basis $850.00`.
   - `Final P&L` reads `+$1,560.00`, with class `text-wb-green` and `+183.5% of basis`.
   - The text contains `LEAPS cost $22.50 − credits $14.00 = cost basis $8.50 / share`.
   - `$8.50` equals the `Cost basis` drawer's `Cost basis / share`.
4. **Fees reduce the realized figure and are counted once.** With fees `0.65`:
   - The preview reads `Proceeds $2,410.00 · fees $0.65 · cost basis $850.00` and `+$1,559.35`.
   - After confirming, the new `LEAPS_CLOSE` leg carries `fees '0.6500'`, and every other leg's `fees` is unchanged.
   - The terminal snapshot's `basis_per_share` is `'8.5000'` and its `final_pnl` is `'1559.3500'`.
5. **A losing close is allowed and shown as one.** Relaunch with `XYZ_BROKEN`:
   - The sale defaults to `6.40`.
   - `Final P&L` reads `−$210.00` with class `text-wb-red`.
   - The note reads `The LEAPS is being sold $16.10 / share below its cost to date; short-call credits of $14.00 recover all but $2.10`.
   - `Confirm Close` is enabled, and confirming succeeds with `final_pnl '-210.0000'`.
   - Before the sale is typed, the LEAPS lane reads BROKEN on the page. This is asserted only if US-118's lane exists; otherwise this check is skipped with a named `it.todo`.
6. **Proceeds scale with contracts, per-share figures do not.** Seed `{ contracts: 3, patch: { c9Sell: null } }`:
   - The text contains `Proceeds $7,230.00` and `cost basis $2,550.00`, asserted separately (research Open Question 11).
   - `Final P&L` reads `+$4,680.00`.
   - `This position` reads `$8.50 / share ($2,550.00)`.
7. **A LEAPS that never had a short call closes against its own cost.** Relaunch at 2027-08-13 and seed `LEAPS_ONLY`:
   - With sale `21.00` and fill `2027-08-13`, the text contains `Proceeds $2,100.00` and `cost basis $1,980.00`, plus `+$120.00`.
   - The position line starts `0 cycles · no short call was ever sold`.
   - Fill `2027-05-31` shows `Fill date cannot be before the LEAPS was bought (2027-06-01)` beside `Fill date`, and confirm is disabled.
8. **Selling the LEAPS under an open short call is refused.** Relaunch at 2027-08-13 and seed the plain Background (the `healthy` state):
   - `close-pmcc-btn` is absent, and `roll-pmcc-short-btn` is present as a positive control.
   - In the same app, a second seed with `{ patch: { c9Sell: null } }` (`leaps-only`) shows `close-pmcc-btn`.
   - Back on the first position, `window.api.closePmcc({ positionId, salePricePerShare: 24.1 })` returns `ok: false` with `__root__` / `short_call_open` and the story's message.
   - `tableCount(legs)` and the `cost_basis_snapshots` count are unchanged, and the position is still `PMCC_OPEN` / `ACTIVE`.
9. **Reject invalid close input — sale price $0.00.** Sale `0.00` shows `Sale price must be greater than zero` beside `Sale price / share`; `Confirm Close` is disabled.
10. **Reject invalid close input — fill date 2027-07-15.** Shows `Fill date cannot be before the last short call was retired (2027-07-16)` beside `Fill date`; disabled.
11. **Reject invalid close input — fill date 2027-07-20.** Shows `Fill date cannot be in the future` beside `Fill date`; disabled.
12. **Reject invalid close input — fees −$1.00.** Fees `-1.00` shows `Fees cannot be negative.` beside `Fees`; disabled.
13. **The sheet works with no quote.** Relaunch with `NO_LEAPS_QUOTE` (XYZ quote only):
   - Mid, Δ and Intrinsic · extrinsic each read `—`.
   - The sale input is empty, and the Result card shows `Enter the sale price to preview the result.`
   - Typing `24.10` shows `Proceeds $2,410.00 · fees $0.00 · cost basis $850.00` and `+$1,560.00`.
   - Confirming succeeds: the position is `CLOSED`.
14. **A failed save leaves the position open.**
   - Install the `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)` trigger through `sqlite(dbPath, …)`, then confirm.
   - `Could not close the position. Your entries are preserved. Try again.` appears, and the sale input still reads `24.10`.
   - The DB holds no `LEAPS_CLOSE` leg, the phase is `PMCC_OPEN` / `ACTIVE` with `closed_date` null, and the snapshot count is unchanged.
   - Close the sheet: the `Cost basis` drawer still reads `$8.50`, and `Close Position →` is still offered.
15. **Success state closes the loop.** After the happy-path confirm:
   - The sheet reads `PMCC closed`, `+$1,560.00` and `held 308 days · 8 cycles · 62.2% of LEAPS cost recovered by credits`.
   - No `annualized` and no `/yr` text appears; the positive control `Final P&L` is found.
   - `Back to positions` lands on the list.
16. **The closed position renders from the terminal snapshot.** Close through the sheet, then reopen the detail page:
   - The banner reads `Closed on 2027-07-19 · Final P&L +$1,560.00`.
   - The header holds only the phase badge `PMCC Closed`. No `close-pmcc-btn`, `roll-pmcc-leaps-btn` or `roll-pmcc-short-btn`.
   - The `Cost basis` drawer reads effective share cost `$93.50` and premium recovered `62.2%`.
   - `Timeline summary` reads Cycles `8 · 8 closed`. `0 open` is asserted only once US-118 renders it; research Open Question 6.
   - With `Leg timeline` expanded, the last LEAPS track row reads `Sold to close`, `$24.10` and `2027-07-19`, and the banner reads `Position closed 2027-07-19 · the timeline is complete`.
   - The positions list shows XYZ under `position-card-closed`, with `closed — no live marks` and basis `$850.00`.
   - US-118's CLOSED lanes are a named `it.todo` until US-118 lands.
17. **The wheel is unchanged.** Open a wheel in `CSP_OPEN` with the existing helpers (`e2e/helpers.ts`):
   - The US-4 close form (`CloseCspForm`) is present.
   - The page contains none of `LEAPS`, `cycle` or `Effective share cost`, and has no `close-pmcc-btn`.
   - After closing the CSP the US-4 way, there is still no `close-pmcc-btn`.

**Green — implementation:**

- Nothing new should be needed. A failing e2e test means an earlier area is incomplete; fix it there.

**Refactor — cleanup to consider:**

- Keep the variants as patches over US-109's Background literal. Do not add a second XYZ history.

**Acceptance criteria covered:**

- All 14 scenarios in OPT-26 (the outline as four tests): 17 tests. See the AC audit below.

## AC Audit

| # | Acceptance scenario (OPT-26) | E2e test |
| --- | --- | --- |
| 1 | Close the position by selling the LEAPS | 1 |
| 2 | The sheet shows what is being sold and what it settles against | 2 |
| 3 | The preview reconciles proceeds to the cost basis before confirming | 3 |
| 4 | Fees reduce the realized figure and are counted once | 4 |
| 5 | A losing close is allowed and shown as one | 5 |
| 6 | Proceeds scale with contracts, per-share figures do not | 6 |
| 7 | A LEAPS that never had a short call closes against its own cost | 7 |
| 8 | Selling the LEAPS under an open short call is refused | 8 |
| 9 | Reject invalid close input — sale price $0.00 | 9 |
| 10 | Reject invalid close input — fill date 2027-07-15 | 10 |
| 11 | Reject invalid close input — fill date 2027-07-20 | 11 |
| 12 | Reject invalid close input — fees −$1.00 | 12 |
| 13 | The sheet works with no quote | 13 |
| 14 | A failed save leaves the position open | 14 |
| 15 | Success state closes the loop | 15 |
| 16 | The closed position renders from the terminal snapshot | 16 (US-118's CLOSED lanes and `0 open` remain `it.todo`) |
| 17 | The wheel is unchanged | 17 |

Two parts of the AC depend on US-118, which is not built:

- the BROKEN lane in scenario 5;
- "both lanes read CLOSED" and `0 open` in scenario 16.

Each is a named `it.todo` in the spec and listed in research Open Question 6. Every other clause has a passing assertion.
