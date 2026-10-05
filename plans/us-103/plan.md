---
story: us-103
kind: feature
parent: null
topics:
  [
    cost-basis,
    wheel-lifecycle,
    ipc-handlers,
    zod-schemas,
    tables,
    position-list,
    position-detail,
    pmcc
  ]
status: planned
---

# Implementation Plan: US-103 — Calculate and display PMCC cost basis

## Summary

Add the running PMCC cost-basis ledger: a pure `calculatePmccLedger` over signed per-share
contributions, a service-layer writer (`appendPmccSnapshot`) that every PMCC leg event calls inside
its own transaction, a shared roll-chain helper extracted from the assignment service, and the
`Cost basis` drawer (six `StatGrid` cells) on the PMCC detail page plus the running total on the
PMCC list row. Done when every Linear scenario passes end to end against the two opening legs US-101
creates and against seeded expiration / subsequent-short / short-roll / LEAPS-roll events, the five-row
snapshot chain is auditable, and a classic wheel's detail page, list row and services are unchanged.

Estimated at **5 points**. Areas 1–8 are main-process; 9–10 are the renderer; 11 is the AC-driven
e2e suite.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-9](https://linear.app/optionswheel/issue/OPT-9/us-103-calculate-and-display-pmcc-cost-basis) (the archived `docs/epics/09-stories/US-103-pmcc-cost-basis.md` is a copy; Linear wins)
- **Layout of record:** `mockups/epic-09-pmcc-position-detail.mdx` — the `Cost basis` drawer (`healthy`, `rs-recorded`, `rl-recorded` presets)
- **Research & Design Decisions:** `plans/us-103/research.md`
- **Data Model & Type Design:** `plans/us-103/data-model.md`
- **API Contracts:** `plans/us-103/contracts/positions-get.md`, `plans/us-103/contracts/positions-list.md`, `plans/us-103/contracts/test-pmcc-record-leg-event.md`
- **Quickstart & Verification:** `plans/us-103/quickstart.md`
- **Spec pages this builds on:** `docs/spec/domain/cost-basis.md`, `docs/spec/features/us-101-open-pmcc-position.md`, `docs/spec/features/us-16-cost-basis-sequential-rolls.md`, ADRs `pmcc-opening-snapshot-ledger-convention`, `pmcc-phase-and-leg-role-names`, `append-only-cost-basis-snapshots`, `dev-only-test-scheduler-ipc`

## Prerequisites

Already in place (verified in `src/`):

- US-101: `createPmccPosition` writes `LEAPS_OPEN` / `SHORT_CALL_OPEN` legs with per-leg `fees`
  (migration 017) and a `PMCC_OPEN` snapshot already in this story's convention
  (`basis_per_share = 23.0200`, `total_premium_collected = 199.0000` for the fee example).
- `cost_basis_snapshots.trigger_event` (migration 004) and `legs.roll_chain_id` (001). **No new
  migration**: `leg_role` and `trigger_event` carry no CHECK constraint and `basis_per_share` is TEXT.
- `getPosition` returns `legs` and `allSnapshots`; `PositionCockpit` already branches on
  `strategyType === 'PMCC'`; `CollapsedDrawer`, `StatGrid`, `Caption`, `fmtMoney`, `fmtMoneyGrouped` exist.
- `_test:` IPC gate (`NODE_ENV === 'test'` block in `src/main/index.ts`) and `e2e/pmcc-helpers.ts`
  (`launchPmcc`, `listPositions`, `sqlite`, `tableCount`).

## Implementation Areas

### 1. PMCC leg roles and trigger events in the shared enums

**Files to create or modify:**

- `src/main/core/types.ts` — add `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED` to `LegRole`; add `PmccLegRole` and `isPmccLegRole`
- `src/main/schemas.ts` — split `TriggerEvent` into `WheelTriggerEvent | PmccTriggerEvent`; add the `PmccTriggerEvent` Zod enum
- `src/main/core/types.test.ts` (create if absent) — enum and guard tests

**Red — tests to write:**

- `types.test.ts`: `LegRole.options` contains each of the six PMCC roles (`LEAPS_OPEN`, `LEAPS_CLOSE`, `SHORT_CALL_OPEN`, `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `SHORT_CALL_ASSIGNED`) and still contains every wheel role listed today.
- `types.test.ts`: `isPmccLegRole` returns true for each of the six and false for `CSP_OPEN`, `ROLL_FROM`, `ROLL_TO`, `ASSIGN`.
- `schemas.test.ts` (or a new `schemas.pmcc.test.ts`): `PmccTriggerEvent.options` equals `['PMCC_OPEN','PMCC_SHORT_OPEN','PMCC_SHORT_EXPIRED','PMCC_SHORT_CLOSED','PMCC_SHORT_ROLL','PMCC_LEAPS_ROLL']`; `PmccTriggerEvent.safeParse('CSP_ROLL').success` is false.
- No property — enums are closed lists, not functions over a domain.

**Green — implementation:**

- `LegRole` enum gains the four reserved values (`src/main/core/types.ts`); `PmccLegRole = Extract<LegRole, …six…>` and `isPmccLegRole(role: LegRole): role is PmccLegRole` per data-model § Type Design.
- `PmccTriggerEvent = z.enum([...])` in `src/main/schemas.ts`; `type WheelTriggerEvent = 'CSP_OPEN' | … | 'CALL_AWAY'`; `export type TriggerEvent = WheelTriggerEvent | z.infer<typeof PmccTriggerEvent>` (so `CostBasisSnapshotRecord.triggerEvent` widens without other edits).
- No renderer label text for the new roles (`LEG_ROLE_LABEL` is `Record<string,string>`; nothing renders them yet).

**Refactor — cleanup to consider:**

- Check that no `Record<LegRole, …>` or `Record<TriggerEvent, …>` exists (research found none); if one appears, prefer `Partial`/`string` keys over inventing labels.

**Acceptance criteria covered:**

- Enabler for "The audit chain records one snapshot per leg event … with their trigger events" and for every seeded post-entry scenario.

### 2. Pure engine: `calculatePmccLedger`

**Files to create or modify:**

- `src/main/core/costbasis.ts` — `PmccLedgerSide`, `PmccContribution`, `PmccLedgerInput`, `PmccLedgerResult`, `calculatePmccLedger`
- `src/main/core/costbasis.test.ts` — worked examples
- `src/main/core/costbasis.property.test.ts` — properties
- `src/main/core/test-fixtures/arbitraries.ts` — `pmccContribution` arbitrary

**Red — tests to write (`costbasis.test.ts`, one `describe('calculatePmccLedger')`):**

- Entry: `[LONG +25.0000 ×1, SHORT −2.0000 ×1]`, `leapsContracts 1`, `longStrike '80.0000'` → `basisPerShare '23.0000'`, `basisTotal '2300.0000'`, `leapsCostPerShare '25.0000'`, `leapsCostTotal '2500.0000'`, `shortCreditsPerShare '2.0000'`, `shortCreditsTotal '200.0000'`, `effectiveShareCost '103.0000'`, `premiumRecoveredPercent '8.0000'`.
- Expiration adds `SHORT 0.0000` → identical result to entry.
- Subsequent short adds `SHORT −1.8000` → `21.2000` / `2120.0000`, credits `3.8000`, eff `101.2000`.
- Short roll adds one `SHORT +0.6000` → `21.8000` / `2180.0000`, credits `3.2000`, eff `101.8000`, recovered `12.8000`.
- LEAPS roll adds one `LONG −2.5000` with `longStrike '85.0000'` → `19.3000` / `1930.0000`, `leapsCostPerShare '22.5000'`, eff `104.3000`; and the result is identical whether the LEAPS strike moved from 80 to 85 or stayed at 80 except for `effectiveShareCost` (no strike-delta term).
- Negative basis: LONG 22.50 vs SHORT credits 22.90 → `basisPerShare '-0.4000'`, `basisTotal '-40.0000'`, `premiumRecoveredPercent '101.7778'`, eff `84.6000` (not clamped).
- Three contracts on every contribution, `leapsContracts 3` → `23.0000` / `6900.0000`.
- Fees: entry with `fees '1.0000'` on both → `23.0200` / `2302.0000`; `leapsCostTotal '2501.0000'`; `shortCreditsTotal '199.0000'` (matches the `PMCC_OPEN` snapshot US-101 writes).
- Partial coverage: `LONG +25.0000 ×3`, `SHORT −2.0000 ×1`, `leapsContracts 3` → `basisTotal '7300.0000'`, `basisPerShare '24.3333'`.
- `premiumRecoveredPercent` is `null` when `leapsCostTotal` is `0.0000` and when negative (a LEAPS roll credit larger than the LEAPS cost); `effectiveShareCost` is `null` when `longStrike` is `null`.
- Guard: `leapsContracts` of `0`, `-1`, `1.5` throws `'leapsContracts must be a positive integer'`.
- Empty `contributions` → every total `0.0000`, recovered `null`.

**Red — properties (`costbasis.property.test.ts`, `describe('calculatePmccLedger')`):**

- **Oracle:** for generated contributions, `basisTotal` equals an independent `Decimal` fold `Σ sign(side)·(cash×contracts×100 + fees)` with LONG = +1, SHORT = −1 (exact 4-dp equality; totals are exact because inputs are 4-dp money times integers).
- **Identity:** `basisTotal === leapsCostTotal − shortCreditsTotal` and `basisPerShare === round4(basisTotal / (leapsContracts×100))` for every input.
- **Order independence:** a shuffled `contributions` array yields a deep-equal result.
- **Scale invariance:** multiplying every contribution's `contracts` and `leapsContracts` by `n` (fees at `0.0000`) multiplies every `*Total` by `n` and leaves every `*PerShare`, `effectiveShareCost` and `premiumRecoveredPercent` unchanged.
- **Guard / bound:** `premiumRecoveredPercent` is `null` exactly when `leapsCostTotal ≤ 0` (safe as an iff: totals are exact, see above); `effectiveShareCost` is `null` iff `longStrike` is `null`.
- Shared arbitrary `pmccContribution` in `test-fixtures/arbitraries.ts`: `side` from `constantFrom('LONG','SHORT')`, `cashPerShare` as signed 4-dp money (`positiveMoney` with a random sign), `contracts`, `fees` from `nonNegativeMoney(10)`.

**Green — implementation:**

- Types per data-model § Type Design in `src/main/core/costbasis.ts`; `calculatePmccLedger(input: PmccLedgerInput): PmccLedgerResult` folding in dollars with `Decimal`, dividing once by `sharesFromContracts(leapsContracts)`, rounding each output with the file's `money4`, `null` for the two undefined figures. No imports beyond `decimal.js`.

**Refactor — cleanup to consider:**

- Reuse `sharesFromContracts` / `money4`; a small `sumSide(contributions, side)` helper if the two side folds read as duplication. Keep the file free of leg vocabulary.

**Acceptance criteria covered:**

- "Cost basis after the two opening legs"; "A short call that expires worthless does not move cost basis" (arithmetic half); "A subsequent short call lowers cost basis"; "A short-call roll contributes one net amount"; "A LEAPS roll applies its net cash and re-anchors the effective share cost … no separate strike-difference adjustment"; "Credits that exceed the LEAPS cost give a negative basis"; "Cost basis is per share of contract regardless of quantity"; "Fees are counted once".

### 3. Shared roll-chain helper (`groupRollChains`)

**Files to create or modify:**

- `src/main/services/roll-chains.ts` — new: `RollChain`, `groupRollChains(legs)`
- `src/main/services/roll-chains.test.ts` — new
- `src/main/services/assign-csp-position.ts` — delete private `groupRollsByChain`; use the shared helper

**Red — tests to write (`roll-chains.test.ts`):**

- A wheel pair (`ROLL_FROM` BUY `0.8000`, `ROLL_TO` SELL `1.5000`, same `rollChainId`) → one chain with `netCreditPerShare '0.7000'`, `contracts` = `rollTo.contracts`, `fees '0.0000'`, `fillDate` = the earlier leg's.
- An inverted LEAPS pair (`ROLL_FROM` SELL `26.0000`, `ROLL_TO` BUY `23.5000`) → `netCreditPerShare '2.5000'` (SELL − BUY, not role order).
- A short-roll pair (`ROLL_FROM` BUY `3.0000`, `ROLL_TO` SELL `2.4000`) → `'-0.6000'`.
- Fees sum across both halves (`0.6500` + `0.6500` → `'1.3000'`).
- Two chains out of fill-date order in the input come back sorted by `fillDate` then `createdAt`.
- A chain with only a `ROLL_FROM` is dropped; non-roll legs are ignored; empty input → `[]`.
- `assign-csp-position.test.ts`: existing roll waterfall cases (`Roll #1 credit 0.7000`, `Roll #1 debit -0.5000`) still pass unchanged after the swap.

**Green — implementation:**

- `groupRollChains` in `src/main/services/roll-chains.ts` grouping by `rollChainId`, netting `Σ SELL premiumPerContract − Σ BUY premiumPerContract` with `Decimal`, returning the `RollChain` shape from data-model § 1.
- `assignCspPosition` maps `groupRollChains(positionDetail.legs)` to its `ROLL_NET` legs via `{ netCreditPerShare, contracts }`; labels and engine call unchanged.

**Refactor — cleanup to consider:**

- Remove the now-unused `RollChainEntry` interface and `Decimal` import from `assign-csp-position.ts` if nothing else uses them.

**Acceptance criteria covered:**

- "A short-call roll contributes one net amount, not two gross amounts" (grouping half); "A LEAPS roll applies its net cash" (inverted pair). Also the story's technical note to extract `groupRollsByChain` rather than write a third copy.

### 4. Shared legs reader (`leg-rows.ts`) and pure opening-leg selectors

**Files to create or modify:**

- `src/main/services/leg-rows.ts` — new: `readLegs(db, positionId)`, `readLegsByPosition(db, positionIds)` (move `GET_LEGS_QUERY`, `LegRow`, `mapLegRow` out of `get-position.ts`)
- `src/main/services/leg-rows.test.ts` — new
- `src/main/services/pmcc-opening-legs.ts` — becomes pure over `LegRecord[]`: `pmccOpeningLegs(legs)`, `pmccInitialNetDebit(legs)`; delete `readPmccOpeningLegs` and the `PmccOpeningLegRow` DB shape
- `src/main/services/get-position.ts`, `src/main/services/list-positions.ts` — read legs through the new reader (behaviour unchanged in this area)

**Red — tests to write (`leg-rows.test.ts`):**

- `readLegs` returns every leg of the position mapped to `LegRecord` (camelCase, `rollChainId` null-coalesced, `fees`), ordered `fill_date ASC, created_at ASC`.
- `readLegsByPosition([a, b])` returns a map with both positions' legs, each in the same order; a position with no legs is absent; `[]` → empty map with no query.
- `pmcc-opening-legs.test.ts` (update): `pmccOpeningLegs(legs)` picks the latest `LEAPS_OPEN` and `SHORT_CALL_OPEN` by order ("later rows win"); `pmccInitialNetDebit` still gives `'2300.0000'` and `'6900.0200'` (3 contracts, $0.01 fees) and `null` when a leg or fill is missing.
- Existing `get-position.test.ts` and `list-positions.test.ts` stay green.

**Green — implementation:**

- `leg-rows.ts` with the two readers (one `IN (...)` query for the batch, same `ORDER BY`).
- `pmcc-opening-legs.ts` keeps `calculatePmccOpeningDebit` as the only arithmetic; inputs become `LegRecord`s.
- `getPosition` calls `readLegs` once and passes the result to `pmccInitialNetDebit`; `listPositions` calls `readLegsByPosition` for the PMCC ids.

**Refactor — cleanup to consider:**

- `get-position.ts` shrinks by the leg query + mapper; confirm no other private `legs` SQL remains in services that could share `readLegs`.

**Acceptance criteria covered:**

- Enabler for the detail and list read paths (areas 6–7); no AC of its own.

### 5. Ledger service: contributions, current strike, `appendPmccSnapshot`, chain

**Files to create or modify:**

- `src/main/services/pmcc-ledger.ts` — new: `PMCC_LEG_SIDE`, `buildPmccContributions(legs)`, `currentLongStrike(legs)`, `leapsContracts(legs)`, `pmccLedgerFromLegs(legs): PmccLedgerResult | null`, `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now })`
- `src/main/services/pmcc-ledger.test.ts` — new
- `src/main/services/pmcc-cost-basis-chain.test.ts` — new (sibling of `cost-basis-chain.test.ts`)
- `src/main/services/create-pmcc-position.ts` — opening snapshot through `appendPmccSnapshot`
- `src/main/services/create-pmcc-position.test.ts` — unchanged expectations prove the refactor

**Red — tests to write (`pmcc-ledger.test.ts`):**

- `buildPmccContributions` on the `OPEN` fixture → `[{LONG, '25.0000', 1, '0.0000'}, {SHORT, '-2.0000', 1, '0.0000'}]`; with fees → fees carried per leg.
- `SHORT_CALL_EXPIRED` (EXPIRE, `0.0000`) → `{SHORT, '0.0000'}`; `SHORT_CALL_CLOSE` BUY `0.5500` → `{SHORT, '0.5500'}`; `LEAPS_CLOSE` SELL `24.1000` → `{LONG, '-24.1000'}`.
- The `SHORT_ROLL` chain → one `{SHORT, '0.6000', 1, fees Σ}`; the `LEAPS_ROLL` chain → one `{LONG, '-2.5000'}`; side decided by `rollFrom.action`.
- Output is ordered by `fillDate` then `createdAt` with a chain placed at its earliest leg.
- A leg with a wheel role on a PMCC (`CSP_OPEN`) is excluded and `logger.warn` is called with `pmcc_ledger_unknown_leg_role`.
- `currentLongStrike`: `'80.0000'` after `OPEN`; `'85.0000'` after `LEAPS_ROLL`; `null` with no long BUY leg. `leapsContracts`: the newest long BUY leg's contracts.
- `pmccLedgerFromLegs(OPEN + … + LEAPS_ROLL)` → `basisPerShare '19.3000'`, `effectiveShareCost '104.3000'`; `[]` → `null`.
- `appendPmccSnapshot` after inserting `SHORT_2` → inserts one row with `basis_per_share '21.2000'`, `total_premium_collected '380.0000'`, `final_pnl NULL`, `trigger_event 'PMCC_SHORT_OPEN'`, `snapshot_at` starting with the `eventDate`; returns `{ ledger, snapshot }` whose `snapshot.basisPerShare === ledger.basisPerShare`.
- The writer sees a leg inserted earlier **in the same `db.transaction`** (ledger reflects it).
- Rollback: `db.transaction(() => { insert SHORT_2; appendPmccSnapshot(...); throw new Error('boom') })()` → leg count and snapshot count unchanged. Variant: `DROP TABLE cost_basis_snapshots` before the call inside the transaction → the leg is rolled back too.
- Logging: `logger.info` called with `pmcc_basis_recalculated` and `{ positionId, triggerEvent, basisPerShare, basisTotal }`; `logger.debug` with `pmcc_ledger_contributions` and `pmcc_roll_chains`.
- Agreement: after each fixture event, the newest snapshot's `basis_per_share` equals `pmccLedgerFromLegs(readLegs(...)).basisPerShare`.

**Red — tests to write (`pmcc-cost-basis-chain.test.ts`):**

- `createPmccPosition` then four `db.transaction` blocks (insert `EXPIRE_1` → `PMCC_SHORT_EXPIRED`; `SHORT_2` → `PMCC_SHORT_OPEN`; `SHORT_ROLL` pair → `PMCC_SHORT_ROLL`; `LEAPS_ROLL` pair → `PMCC_LEAPS_ROLL`) → `SELECT … ORDER BY snapshot_at ASC` returns exactly five rows with `basis_per_share` `['23.0000','23.0000','21.2000','21.8000','19.3000']` and the five triggers in order; `snapshot_at` strictly ascending.
- The short roll produced **one** snapshot (count went 3 → 4), and its basis moved by exactly `0.6000` from the previous row.
- `create-pmcc-position.test.ts`: all existing cases pass unchanged (`23.0000`/`200.0000`, `23.0200`/`199.0000`, `rolls back … when the snapshot insert fails`).

**Green — implementation:**

- `PMCC_LEG_SIDE: Record<PmccLegRole, PmccLedgerSide>` and `buildPmccContributions` per research ADR "Contributions are classified by leg role → side"; roll chains through `groupRollChains` (area 3).
- `currentLongStrike` / `leapsContracts` from the newest `LONG` + `BUY` leg (`LEAPS_OPEN` or long `ROLL_TO`).
- `pmccLedgerFromLegs` → `calculatePmccLedger({ leapsContracts, longStrike, contributions })`, `null` when no long BUY leg exists.
- `appendPmccSnapshot` per research ADR "`appendPmccSnapshot` is the one writer": `readLegs` → ledger → one `INSERT INTO cost_basis_snapshots` (`basis_per_share`, `total_premium_collected = shortCreditsTotal`, `final_pnl NULL`, `trigger_event`, `snapshot_at = makeSnapshotAt(eventDate)`, `created_at = now`) → return `{ ledger, snapshot: CostBasisSnapshotRecord }`. No `db.transaction` of its own.
- `createPmccPosition`: inside its transaction, after the two leg inserts, `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_OPEN', eventDate: long.fillDate, now })`; drop its local `basisPerShare` / `totalPremiumCollected` computation; keep `openingDebit` for the response and the INFO log.

**Refactor — cleanup to consider:**

- `create-pmcc-position.ts` loses `money4`-on-snapshot code; check `Decimal` import is still needed there.
- If `appendPmccSnapshot`'s INSERT reads the same as the five wheel services' snapshot INSERTs, leave the wheel ones alone (out of scope); note the duplication only.

**Acceptance criteria covered:**

- "A short call that expires worthless … a snapshot is recorded for the expiration with the basis unchanged"; "the snapshot chain records the roll as one net debit of $0.60 … does not record separate gross close and open contributions"; "The audit chain records one snapshot per leg event … five snapshots … $23.00, $23.00, $21.20, $21.80, and $19.30"; "A failed leg event leaves no cost-basis change … no snapshot … no partial leg".

### 6. Detail read path: `pmccLedger` on `positions:get`

**Files to create or modify:**

- `src/main/schemas.ts` — `GetPositionResult.pmccLedger: PmccLedgerResult | null`
- `src/main/services/get-position.ts` — compute it for `strategyType === 'PMCC'`
- `src/main/services/get-position.test.ts`

**Red — tests to write (`get-position.test.ts`, `describe('getPosition — PMCC ledger (US-103)')`):**

- After `createPmccPosition` → `pmccLedger` deep-equals the entry result from area 2 (`'23.0000'`, `'2300.0000'`, `'103.0000'`, `'8.0000'`).
- After seeding `SHORT_ROLL` + `LEAPS_ROLL` through `appendPmccSnapshot` → `basisPerShare '19.3000'`, `effectiveShareCost '104.3000'`, `leapsCostPerShare '22.5000'`.
- For a wheel position → `pmccLedger` is `null`; for a PMCC whose legs were deleted → `null`.
- `legs` returned by `getPosition` include a `SHORT_CALL_EXPIRED` leg with `action 'EXPIRE'` when one exists (no filtering by role).
- `src/main/ipc/positions.test.ts`: `positions:get` envelope carries `pmccLedger` (one case).

**Green — implementation:**

- `getPosition` passes the already-read `legs` to `pmccLedgerFromLegs` when `strategyType === 'PMCC'`, else `null`; result field named `pmccLedger` per `contracts/positions-get.md`.

**Refactor — cleanup to consider:**

- `initialNetDebit` and `pmccLedger` are both derived from the same `legs`; a single `pmccDetailFields(legs)` helper in `pmcc-ledger.ts` if the two calls read as noise.

**Acceptance criteria covered:**

- Read-side half of every detail-page scenario (opening legs, expiration, subsequent short, short roll, LEAPS roll, negative basis, quantity, fees).

### 7. List read path: running basis on `PmccListSummary`

**Files to create or modify:**

- `src/main/schemas.ts` — `PmccListSummary` = `{ long; short } & Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'>` (remove `initialNetDebit`)
- `src/main/services/list-positions.ts` — `readPmccSummaries` builds from `readLegsByPosition` + `pmccLedgerFromLegs`
- `src/main/services/list-positions.test.ts`
- `src/renderer/src/lib/position-list-items.ts`, `.test.ts` — `toPmccListItem` fills `basisPerShare` / `basisTotal`

**Red — tests to write:**

- `list-positions.test.ts`: a PMCC lists with `pmcc.basisPerShare '23.0000'` and `pmcc.basisTotal '2300.0000'`; after a seeded short roll (`appendPmccSnapshot`) → `'21.8000'` / `'2180.0000'`; `pmcc.long` / `pmcc.short` summaries unchanged (strike, expiration, dte, contracts); 3 contracts + $0.01 fees → `basisTotal '6900.0200'` (not `basis_per_share × 300`).
- `list-positions.test.ts`: wheel items are deep-equal to today's shape (regression case already present must still pass); a PMCC with no legs is dropped with WARN `pmcc_list_summary_incomplete`.
- `position-list-items.test.ts`: `toPmccListItem(createResponse)` → `pmcc.basisPerShare === costBasisSnapshot.basisPerShare` and `pmcc.basisTotal === openingDebit.initialNetDebit`.

**Green — implementation:**

- `PmccListSummary` per data-model § Type Design; `readPmccSummaries` reads all PMCC legs once, derives `long` / `short` through `pmccOpeningLegs`, and `basisPerShare` / `basisTotal` through `pmccLedgerFromLegs`; drop a position with no ledger (WARN as today).
- `toPmccListItem` in `src/renderer/src/lib/position-list-items.ts` per contract.

**Refactor — cleanup to consider:**

- `readPmccSummaries` and `getPosition` now share "legs → opening summary + ledger"; keep the shared piece in `pmcc-ledger.ts`.

**Acceptance criteria covered:**

- "The positions list shows the running cost basis … $2,180.00 in place of the initial net debit" (data half).

### 8. Dev-only `_test:pmcc-record-leg-event` seam

**Files to create or modify:**

- `src/main/schemas.ts` — `TestLegRowSchema`, `TestPmccLegEventPayloadSchema` (test section)
- `src/main/ipc/test-pmcc-ledger.ts` — new handler
- `src/main/ipc/test-pmcc-ledger.test.ts` — new
- `src/main/index.ts` — register inside the existing `NODE_ENV === 'test'` block
- `src/preload/index.ts` — `testPmccRecordLegEvent(payload)`

**Red — tests to write (`test-pmcc-ledger.test.ts`, mocking `electron.ipcMain` like `test-scheduler.test.ts`):**

- Registers exactly one channel, `_test:pmcc-record-leg-event`.
- Valid payload with the `SHORT_2` row → `{ ok: true, ledger.basisPerShare '21.2000', snapshot.triggerEvent 'PMCC_SHORT_OPEN' }`; `legs` gained one row and `cost_basis_snapshots` one row.
- Payload with the `SHORT_ROLL` pair (two rows sharing `rollChainId`) → one snapshot, basis `21.8000`.
- Empty `legs` with `PMCC_SHORT_EXPIRED` → snapshot written, basis unchanged.
- Invalid `triggerEvent 'CSP_ROLL'` → `{ ok: false, errors: [{ field: 'triggerEvent', … }] }` and no rows written.
- Storage failure (`DROP TABLE cost_basis_snapshots` first) → `{ ok: false, errors: [{ code: 'internal_error' }] }` and the leg row was rolled back.

**Green — implementation:**

- Schemas per `contracts/test-pmcc-record-leg-event.md`, reusing `LegRole`, `LegAction`, `PmccTriggerEvent`, `IsoDateSchema`, `PositionIdSchema`.
- `registerTestPmccLedgerIpc(db)` in `src/main/ipc/test-pmcc-ledger.ts`: `handleIpcCall('test_pmcc_record_leg_event_unhandled_error', () => { parse; db.transaction(() => { insert rows (randomUUID ids, now timestamps, instrument_type 'CALL', fill_price = premiumPerContract); return appendPmccSnapshot(...) })() })`.
- Registration next to `registerTestIvHistoryIpc(db)` in `src/main/index.ts`; preload entry next to `testIvSeriesSet`.

**Refactor — cleanup to consider:**

- If the handler's leg INSERT is byte-identical to `insertPmccLeg` in `create-pmcc-position.ts`, generalise that into `leg-rows.ts#insertLegRow` and use it from both; otherwise leave the test seam self-contained.

**Acceptance criteria covered:**

- Test enabler for every post-entry scenario and the chain / failed-event scenarios at e2e.

### 9. Renderer: `fmtPct1`, `PmccCostBasis` drawer, cockpit stack

**Files to create or modify:**

- `src/renderer/src/lib/format.ts`, `format.test.ts` — `fmtPct1`
- `src/renderer/src/api/positions.ts` — re-export `PmccLedgerResult`
- `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx`, `PmccCostBasis.spec.tsx` — new
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx`, `PositionCockpit.spec.tsx`

**Red — tests to write:**

- `format.test.ts`: `fmtPct1('8.0000') === '8.0%'`, `fmtPct1('101.7778') === '101.8%'`, `fmtPct1('12.8000') === '12.8%'`, `fmtPct1('0.0500') === '0.1%'` (half-up).
- `PmccCostBasis.spec.tsx` (fixture = the `rs-recorded` ledger `21.8000 / 2180.0000 / 25.0000 / 3.2000 / 101.8000 / 12.8000`):
  - renders a drawer titled `Cost basis` with `6 fields`, `aria-expanded="true"` on mount (open by default), and the caption `US-103 · cash ledger, never a quote`;
  - the six labels in order: `Cost basis / share`, `Total`, `LEAPS cost to date`, `Short-call credits to date`, `Effective share cost`, `Premium recovered`;
  - values `$21.80`, `$2,180.00`, `$25.00`, `-$3.20`, `$101.80`, `12.8%` (each asserted via the label's parent, e.g. `toHaveTextContent('Short-call credits to date-$3.20')`);
  - negative ledger (`-0.4000 / -40.0000 / … / 101.7778`) → `-$0.40`, `-$40.00`, `101.8%`;
  - `premiumRecoveredPercent: null` → `—`; `effectiveShareCost: null` → `—`;
  - the drawer text contains none of `profit`, `realized`, `Effective Basis / Share`, `Shares`, `Max profit`, `Breakeven`, `Annualized` (case-insensitive);
  - the `Short-call credits to date` value has no `text-wb-green` class; `Cost basis / share` value has `text-wb-sky`.
- `PositionCockpit.spec.tsx` (`describe('PMCC position')`): with `pmccLedger` set, `Buy LEAPS call` appears **before** `Cost basis` in document order (`compareDocumentPosition`), `Cost basis / share` is visible; with `pmccLedger: null` no `Cost basis` drawer renders; existing assertion that `Cost basis & history` is absent stays; the wheel describes still pass and no wheel case renders `Cost basis / share` or `Effective share cost`.

**Green — implementation:**

- `fmtPct1(value: string): string` in `lib/format.ts` using `Decimal(value).toDecimalPlaces(1, ROUND_HALF_UP).toFixed(1) + '%'`.
- `PmccCostBasis({ ledger }: { ledger: PmccLedgerResult })` per research ADR "`PmccCostBasis` is its own drawer component" and ADR "Display formatting": `<CollapsedDrawer title="Cost basis" fieldCount={6} defaultOpen>` → `<div className="px-5 pt-3"><Caption>US-103 · cash ledger, never a quote</Caption></div>` → `<StatGrid minWidth={150} items=[…six…]>` with `fmtMoney(basisPerShare)` in `text-wb-sky`, `fmtMoneyGrouped(basisTotal)`, `fmtMoney(leapsCostPerShare)`, `fmtMoney(negated shortCreditsPerShare)` (neutral colour), `effectiveShareCost ? fmtMoney : '—'`, `premiumRecoveredPercent ? fmtPct1 : '—'`. Tailwind + `wb-*` only.
- `PositionCockpit` PMCC branch: `<div className="flex flex-col gap-3"><PmccLegReference … />{pmccLedger ? <PmccCostBasis ledger={pmccLedger} /> : null}</div>`; the wheel branches untouched.
- `api/positions.ts`: `export type { PmccLedgerResult } from '../../../main/core/costbasis'`.

**Refactor — cleanup to consider:**

- `PmccLegReference` already wraps in `flex flex-col gap-3`; either lift its wrapper into the cockpit stack or keep both (one extra `div`). Naming consistency with the wheel's `CostBasisDrawer`.

**Acceptance criteria covered:**

- Display half of "Cost basis after the two opening legs" (drawer below Leg reference, open by default, six cells, no max profit / breakeven / annualized); "The open short-call credit is cash in the ledger, not profit" (no profit/realized label, no wheel label, no share count); "Credits that exceed the LEAPS cost give a negative basis … not clamped"; "Leave a classic wheel unaffected" (no PMCC drawer on a wheel).

### 10. Renderer: PMCC list row shows the running cost basis

**Files to create or modify:**

- `src/renderer/src/components/PmccPositionRow.tsx`, `PmccPositionRow.test.tsx`

**Red — tests to write (`PmccPositionRow.test.tsx`):**

- Fixture `pmcc: { long, short, basisPerShare: '21.8000', basisTotal: '2180.0000' }` → cell 10 `toHaveTextContent('$2,180.00')` and `not.toHaveTextContent('net debit')`.
- `basisTotal '-40.0000'` → `-$40.00` (signed, not clamped).
- The other nine cells' assertions unchanged.

**Green — implementation:**

- `PmccPositionRow` destructures `basisTotal` from `item.pmcc` and renders `fmtMoneyGrouped(basisTotal)` in the last `TableCell`; delete the `net debit` suffix.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency (`VALUE_CLASS` usage matches the wheel row's cost-basis cell).

**Acceptance criteria covered:**

- "The positions list shows the running cost basis" (row half).

### 11. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-ledger-helpers.ts` — new: `createXyzPmcc(page, { contracts?, fees? })` (via `window.api.createPmccPosition` with the `pmccFixture` values), `recordEvent(page, positionId, event)` (via `window.api.testPmccRecordLegEvent`), the fixture events `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `LEAPS_ROLL`, `CYCLES` with run-day-relative dates, `drawer(page)` (`button:has-text("Cost basis")` + its following sibling), `cell(page, label)` → the stat's value text, `snapshots(page, id)` (`window.api.getPosition` → `allSnapshots`)
- `e2e/pmcc-cost-basis.spec.ts` — new, launched with `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })`

**Red — tests to write (one `it` per AC scenario, names mirror the Gherkin):**

- `Cost basis after the two opening legs` — create, reload, open detail: the `Cost basis` drawer trigger exists with `aria-expanded="true"` without a click; the `Buy LEAPS call` section precedes the drawer in the DOM; cells read `$23.00`, `$2,300.00`, `$25.00`, `-$2.00`, `$103.00`, `8.0%`; the drawer text contains none of `Max profit`, `Breakeven`, `Annualized`.
- `The open short-call credit is cash in the ledger, not profit` — same page: `Short-call credits to date` reads `-$2.00`; the drawer text contains neither `profit` nor `realized` (case-insensitive), nor `Effective Basis / Share`, nor the word `Shares`.
- `A short call that expires worthless does not move cost basis` — record `EXPIRE_1` (`PMCC_SHORT_EXPIRED`), reload: `$23.00` / `$2,300.00`; `snapshots()` has two rows, the last with `triggerEvent 'PMCC_SHORT_EXPIRED'` and `basisPerShare '23.0000'`.
- `A subsequent short call lowers cost basis` — `EXPIRE_1` + `SHORT_2`: `$21.20`, `$2,120.00`, credits `-$3.80`, effective `$101.20` (fails against the `$23.00` entry fixture).
- `A short-call roll contributes one net amount, not two gross amounts` — + `SHORT_ROLL`: `$21.80`, `$2,180.00`; `snapshots()` grew by exactly one row with `triggerEvent 'PMCC_SHORT_ROLL'` and `basisPerShare '21.8000'` whose difference from the previous row is `0.6000`.
- `A LEAPS roll applies its net cash and re-anchors the effective share cost` — + `LEAPS_ROLL`: `$19.30`, `$1,930.00`, `LEAPS cost to date` `$22.50`, `Effective share cost` `$104.30` (would read `$99.30` / `$109.30` if a strike-delta term were applied).
- `Credits that exceed the LEAPS cost give a negative basis` — + `CYCLES`: `-$0.40`, `-$40.00`, `101.8%`; the text is not `$0.00`.
- `Cost basis is per share of contract regardless of quantity` — create with `contracts 3`: `$23.00` and `$6,900.00`.
- `Fees are counted once, in the leg that incurred them` — create with `fees 1.00` on each leg: `$23.02` and `$2,302.00` (fails against `$23.04` double-counting and against `$23.00`).
- `The audit chain records one snapshot per leg event` — full chain: `snapshots()` returns five rows, `triggerEvent` `['PMCC_OPEN','PMCC_SHORT_EXPIRED','PMCC_SHORT_OPEN','PMCC_SHORT_ROLL','PMCC_LEAPS_ROLL']`, `basisPerShare` `['23.0000','23.0000','21.2000','21.8000','19.3000']`, `snapshotAt` ascending.
- `A failed leg event leaves no cost-basis change` — create; install an SQLite trigger (via the `sqlite3` CLI on the temp DB) that `RAISE(ABORT)`s any insert into `cost_basis_snapshots`; `recordEvent(SHORT_2)` resolves `{ ok: false }`; drop the trigger; reload: `$23.00`; `tableCount(dbPath,'legs') === 2`; `snapshots().length === 1`. (A `chmod 0o444` on the DB does **not** work: the app already holds the files open read-write, so the write succeeds.)
- `The positions list shows the running cost basis` — after `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`: the XYZ `position-card` row text contains `$2,180.00` and contains neither `$2,300.00` nor `net debit`.
- `Leave a classic wheel unaffected` — `reachHoldingSharesState` for a wheel with a $46.50 basis (strike `48.50`, premium `2.00`, assigned); its detail page shows the `Cost basis & history` drawer and contains neither `Cost basis / share` nor `Effective share cost`.

**Green — implementation:**

- Helpers and spec as above; reuse `launchPmcc`, `pmccFixture`, `tableCount`, `openDetailFor`, `reachHoldingSharesState`. Dates: `localDate(n)` offsets from `data-model.md § 5`.

**Refactor — cleanup to consider:**

- Share the OCC/launch pieces with `open-pmcc-position.spec.ts` through `pmcc-helpers.ts` rather than copying; keep each `it` to one scenario.

**Acceptance criteria covered:**

- All thirteen scenarios of OPT-9 (see AC Audit).

## AC Audit

| #   | Linear scenario                                                           | E2e test (area 11)                                                          | Also covered in |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| 1   | Cost basis after the two opening legs                                     | `Cost basis after the two opening legs`                                     | 2, 6, 9         |
| 2   | The open short-call credit is cash in the ledger, not profit              | `The open short-call credit is cash in the ledger, not profit`              | 9               |
| 3   | A short call that expires worthless does not move cost basis              | `A short call that expires worthless does not move cost basis`              | 2, 5            |
| 4   | A subsequent short call lowers cost basis                                 | `A subsequent short call lowers cost basis`                                 | 2, 5, 6         |
| 5   | A short-call roll contributes one net amount, not two gross amounts       | `A short-call roll contributes one net amount, not two gross amounts`       | 2, 3, 5         |
| 6   | A LEAPS roll applies its net cash and re-anchors the effective share cost | `A LEAPS roll applies its net cash and re-anchors the effective share cost` | 2, 3, 5, 6      |
| 7   | Credits that exceed the LEAPS cost give a negative basis                  | `Credits that exceed the LEAPS cost give a negative basis`                  | 2, 9, 10        |
| 8   | Cost basis is per share of contract regardless of quantity                | `Cost basis is per share of contract regardless of quantity`                | 2               |
| 9   | Fees are counted once, in the leg that incurred them                      | `Fees are counted once, in the leg that incurred them`                      | 2, 5            |
| 10  | The audit chain records one snapshot per leg event                        | `The audit chain records one snapshot per leg event`                        | 5               |
| 11  | A failed leg event leaves no cost-basis change                            | `A failed leg event leaves no cost-basis change`                            | 5, 8            |
| 12  | The positions list shows the running cost basis                           | `The positions list shows the running cost basis`                           | 7, 10           |
| 13  | Leave a classic wheel unaffected                                          | `Leave a classic wheel unaffected`                                          | 3, 7, 9         |

Every scenario has exactly one named e2e test; none is lumped.

## Out of scope (per Linear, restated so tasks do not drift)

Rendering the snapshot history (US-109); recording the leg events in production (US-104/105/111/115/119);
live/unrealized P&L; max profit, breakeven, annualized return; the "LEAPS fully paid for" state,
naming the strike inside the Effective share cost cell, and green credits (mockup cleanup pending);
final P&L on close; alerts; tax lots; editing fills.
