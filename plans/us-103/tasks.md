# US-103 — Calculate and display PMCC cost basis — Tasks

Plan: `plans/us-103/plan.md` · Story: Linear [OPT-9](https://linear.app/optionswheel/issue/OPT-9/us-103-calculate-and-display-pmcc-cost-basis) · Layout: `mockups/epic-09-pmcc-position-detail.mdx` (`Cost basis` drawer)

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Fixture rows (`OPEN`, `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `LEAPS_ROLL`, `CYCLES`, `FEES`, `THREE`, `WHEEL_46_50`) are defined in `plans/us-103/data-model.md § 5`; the worked numbers are in `plans/us-103/research.md` § Worked ledger
- Vitest needs the Node ABI (`pnpm rebuild:node`); e2e needs the Electron ABI (`pnpm rebuild:electron`) — swap by hand

---

## Layer 1 — Foundation (no cross-area dependencies)

> These four areas can be started immediately and run in parallel. None imports another's new symbols.

### Area 1 — PMCC leg roles and trigger events in the shared enums

- [x] **[Red]** Write failing tests — `src/main/core/types.test.ts` (create if absent), `src/main/schemas.test.ts` (or new `src/main/schemas.pmcc.test.ts`)
  - Test cases:
    - `LegRole.options` contains all six PMCC roles (`LEAPS_OPEN`, `LEAPS_CLOSE`, `SHORT_CALL_OPEN`, `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `SHORT_CALL_ASSIGNED`) and still every wheel role present today
    - `isPmccLegRole` → true for each of the six; false for `CSP_OPEN`, `ROLL_FROM`, `ROLL_TO`, `ASSIGN`
    - `PmccTriggerEvent.options` equals `['PMCC_OPEN','PMCC_SHORT_OPEN','PMCC_SHORT_EXPIRED','PMCC_SHORT_CLOSED','PMCC_SHORT_ROLL','PMCC_LEAPS_ROLL']`; `PmccTriggerEvent.safeParse('CSP_ROLL').success === false`
  - Property cases: no property — closed enum lists, not functions over a domain
  - Run `pnpm test src/main/core/types.test.ts src/main/schemas.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/types.ts`, `src/main/schemas.ts` _(depends on: Area 1 Red ✓)_
  - Add the four reserved values to the `LegRole` z.enum; `export type PmccLegRole = Extract<LegRole, 'LEAPS_OPEN' | 'LEAPS_CLOSE' | 'SHORT_CALL_OPEN' | 'SHORT_CALL_CLOSE' | 'SHORT_CALL_EXPIRED' | 'SHORT_CALL_ASSIGNED'>`; `export function isPmccLegRole(role: LegRole): role is PmccLegRole`
  - `export const PmccTriggerEvent = z.enum([...six...])`; `type WheelTriggerEvent = 'CSP_OPEN' | 'CSP_CLOSE' | 'CSP_EXPIRE' | 'CSP_ASSIGN' | 'CSP_ROLL' | 'CC_OPEN' | 'CC_ROLL' | 'CALL_AWAY'`; `export type TriggerEvent = WheelTriggerEvent | z.infer<typeof PmccTriggerEvent>`
  - No renderer label text for the new roles (`LEG_ROLE_LABEL` is `Record<string, string>`)
  - Run `pnpm test src/main/core/types.test.ts src/main/schemas.test.ts` — all tests must pass; `pnpm typecheck` — confirm no `Record<LegRole, …>` / `Record<TriggerEvent, …>` broke
- [x] **[Refactor]** `/refactor` — `src/main/core/types.ts`, `src/main/schemas.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Pure engine: `calculatePmccLedger`

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`, `src/main/core/costbasis.property.test.ts`, `src/main/core/test-fixtures/arbitraries.ts`
  - Test cases (`describe('calculatePmccLedger')`, all figures 4-dp strings):
    - Entry `[LONG +25.0000 ×1, SHORT −2.0000 ×1]`, `leapsContracts 1`, `longStrike '80.0000'` → `basisPerShare '23.0000'`, `basisTotal '2300.0000'`, `leapsCostPerShare '25.0000'`, `leapsCostTotal '2500.0000'`, `shortCreditsPerShare '2.0000'`, `shortCreditsTotal '200.0000'`, `effectiveShareCost '103.0000'`, `premiumRecoveredPercent '8.0000'`
    - - `SHORT 0.0000` (expiration) → identical to entry
    - - `SHORT −1.8000` → `'21.2000'` / `'2120.0000'`, credits `'3.8000'`, eff `'101.2000'`
    - - one `SHORT +0.6000` (short roll net) → `'21.8000'` / `'2180.0000'`, credits `'3.2000'`, eff `'101.8000'`, recovered `'12.8000'`
    - - one `LONG −2.5000` with `longStrike '85.0000'` → `'19.3000'` / `'1930.0000'`, `leapsCostPerShare '22.5000'`, eff `'104.3000'`; same input with `longStrike '80.0000'` differs **only** in `effectiveShareCost` (no strike-delta term)
    - Negative: LONG cost 22.50 vs SHORT credits 22.90 → `'-0.4000'` / `'-40.0000'`, recovered `'101.7778'`, eff `'84.6000'` (not clamped)
    - Three contracts everywhere, `leapsContracts 3` → `'23.0000'` / `'6900.0000'`
    - Fees `'1.0000'` on both opening contributions → `'23.0200'` / `'2302.0000'`, `leapsCostTotal '2501.0000'`, `shortCreditsTotal '199.0000'`
    - Partial coverage `LONG +25 ×3`, `SHORT −2 ×1`, `leapsContracts 3` → `basisTotal '7300.0000'`, `basisPerShare '24.3333'`
    - `premiumRecoveredPercent === null` when `leapsCostTotal` is `0.0000` or negative; `effectiveShareCost === null` when `longStrike === null`
    - Guard: `leapsContracts` `0`, `-1`, `1.5` throw `'leapsContracts must be a positive integer'`
    - Empty `contributions` → every total `'0.0000'`, recovered `null`
  - Property cases — `src/main/core/costbasis.property.test.ts` (`describe('calculatePmccLedger')`), new `pmccContribution` arbitrary in `test-fixtures/arbitraries.ts` (`side` from `constantFrom('LONG','SHORT')`, signed 4-dp `cashPerShare`, `contracts`, `fees` from `nonNegativeMoney(10)`):
    - **Oracle:** `basisTotal` equals an independent `Decimal` fold `Σ sign(side)·(cash × contracts × 100 + fees)` (LONG +1, SHORT −1), exact 4-dp
    - **Identity:** `basisTotal === leapsCostTotal − shortCreditsTotal`; `basisPerShare === round4(basisTotal / (leapsContracts × 100))`
    - **Order independence:** shuffled `contributions` → deep-equal result
    - **Scale invariance:** every `contracts` and `leapsContracts` × n (fees `0.0000`) → every `*Total` × n, every `*PerShare`, `effectiveShareCost`, `premiumRecoveredPercent` unchanged
    - **Guard / bound:** `premiumRecoveredPercent === null` iff `leapsCostTotal ≤ 0` (totals are exact, so the iff is safe); `effectiveShareCost === null` iff `longStrike === null`
  - Run `pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 2 Red ✓)_
  - `export type PmccLedgerSide = 'LONG' | 'SHORT'`; `export interface PmccContribution { side; cashPerShare: string; contracts: number; fees: string }`; `export interface PmccLedgerInput { leapsContracts: number; longStrike: string | null; contributions: PmccContribution[] }`; `export interface PmccLedgerResult { basisPerShare; basisTotal; leapsCostPerShare; leapsCostTotal; shortCreditsPerShare; shortCreditsTotal; effectiveShareCost: string | null; premiumRecoveredPercent: string | null }`
  - `export function calculatePmccLedger(input): PmccLedgerResult` — fold in dollars (`cash × contracts × 100 + fees`), `leapsCostTotal = Σ LONG`, `shortCreditsTotal = −Σ SHORT`, `basisTotal = leaps − credits`, divide once by `sharesFromContracts(leapsContracts)`, `money4` each output, `null` for the two undefined figures, throw on a non-positive-integer `leapsContracts`. Only `decimal.js` imported
  - Run `pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a `sumSide(contributions, side)` helper; keep the file free of leg vocabulary
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Shared roll-chain helper (`groupRollChains`)

- [x] **[Red]** Write failing tests — `src/main/services/roll-chains.test.ts` (new)
  - Test cases:
    - Wheel pair (`ROLL_FROM` BUY `0.8000`, `ROLL_TO` SELL `1.5000`, one `rollChainId`) → one chain: `netCreditPerShare '0.7000'`, `contracts = rollTo.contracts`, `fees '0.0000'`, `fillDate` = earlier leg's
    - Inverted LEAPS pair (`ROLL_FROM` SELL `26.0000`, `ROLL_TO` BUY `23.5000`) → `'2.5000'` (SELL − BUY, not role order)
    - Short-roll pair (`ROLL_FROM` BUY `3.0000`, `ROLL_TO` SELL `2.4000`) → `'-0.6000'`
    - Fees sum across halves (`0.6500` + `0.6500` → `'1.3000'`)
    - Two chains given out of order → sorted by `fillDate` then `createdAt`
    - Chain with only `ROLL_FROM` dropped; non-roll legs ignored; `[]` → `[]`
  - Property cases: no property — service helper over storage shapes, not a core engine
  - Run `pnpm test src/main/services/roll-chains.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/roll-chains.ts` (new), `src/main/services/assign-csp-position.ts` _(depends on: Area 3 Red ✓)_
  - `export interface RollChain { rollChainId; rollFrom: LegRecord; rollTo: LegRecord; netCreditPerShare: string; contracts: number; fees: string; fillDate: string }`; `export function groupRollChains(legs: LegRecord[]): RollChain[]` — group by `rollChainId`, net `Σ SELL premiumPerContract − Σ BUY premiumPerContract` with `Decimal`, sort by earliest `fillDate` then `createdAt`, drop incomplete chains
  - `assignCspPosition`: delete private `groupRollsByChain`; map `groupRollChains(positionDetail.legs)` to the existing `ROLL_NET` legs via `{ netCreditPerShare, contracts }`; labels unchanged
  - Run `pnpm test src/main/services/roll-chains.test.ts src/main/services/assign-csp-position.test.ts` — all tests must pass (assignment waterfall cases unchanged)
- [x] **[Refactor]** `/refactor` — `src/main/services/roll-chains.ts`, `src/main/services/assign-csp-position.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Remove the orphaned `RollChainEntry` interface / `Decimal` import from `assign-csp-position.ts` if unused
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Shared legs reader (`leg-rows.ts`) and pure opening-leg selectors

- [x] **[Red]** Write failing tests — `src/main/services/leg-rows.test.ts` (new), `src/main/services/pmcc-opening-legs.test.ts` (update)
  - Test cases:
    - `readLegs(db, positionId)` → every leg as `LegRecord` (camelCase, `rollChainId` null-coalesced, `fees`), ordered `fill_date ASC, created_at ASC`
    - `readLegsByPosition(db, [a, b])` → map with both positions' legs in the same order; a position with no legs is absent; `[]` → empty map, no query
    - `pmccOpeningLegs(legs)` picks the latest `LEAPS_OPEN` and `SHORT_CALL_OPEN` ("later rows win"); `pmccInitialNetDebit(legs)` → `'2300.0000'`, `'6900.0200'` (3 contracts, $0.01 fees per leg), `null` when a leg or fill is missing
  - Property cases: no property — DB reader and selectors over records
  - Run `pnpm test src/main/services/leg-rows.test.ts src/main/services/pmcc-opening-legs.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/leg-rows.ts` (new), `src/main/services/pmcc-opening-legs.ts`, `src/main/services/get-position.ts`, `src/main/services/list-positions.ts` _(depends on: Area 4 Red ✓)_
  - Move `GET_LEGS_QUERY`, `LegRow`, `mapLegRow` from `get-position.ts` into `leg-rows.ts`; `export function readLegs(db, positionId): LegRecord[]`; `export function readLegsByPosition(db, positionIds): Map<string, LegRecord[]>` (one `IN (...)` query, same `ORDER BY`)
  - `pmcc-opening-legs.ts` becomes pure over `LegRecord[]`: `pmccOpeningLegs(legs)`, `pmccInitialNetDebit(legs)`; delete `readPmccOpeningLegs` and `PmccOpeningLegRow`
  - `getPosition` reads legs once via `readLegs` and feeds `pmccInitialNetDebit`; `listPositions` uses `readLegsByPosition` for the PMCC ids — behaviour unchanged in this area
  - Run `pnpm test src/main/services/leg-rows.test.ts src/main/services/pmcc-opening-legs.test.ts src/main/services/get-position.test.ts src/main/services/list-positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/leg-rows.ts`, `src/main/services/pmcc-opening-legs.ts`, `src/main/services/get-position.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check no other private `legs` SQL in services could share `readLegs`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Ledger service (depends on Layer 1)

> One area. It imports the enums (Area 1), the engine (Area 2), the roll-chain helper (Area 3) and the legs reader (Area 4).

### Area 5 — Ledger service: contributions, current strike, `appendPmccSnapshot`, chain

**Requires:** Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/pmcc-ledger.test.ts` (new), `src/main/services/pmcc-cost-basis-chain.test.ts` (new) _(depends on: Areas 1–4 Green ✓)_
  - Test cases (`pmcc-ledger.test.ts`):
    - `buildPmccContributions(OPEN)` → `[{LONG,'25.0000',1,'0.0000'},{SHORT,'-2.0000',1,'0.0000'}]`; `FEES` carries each leg's fee
    - `SHORT_CALL_EXPIRED` EXPIRE `0.0000` → `{SHORT,'0.0000'}`; `SHORT_CALL_CLOSE` BUY `0.5500` → `{SHORT,'0.5500'}`; `LEAPS_CLOSE` SELL `24.1000` → `{LONG,'-24.1000'}`
    - `SHORT_ROLL` chain → one `{SHORT,'0.6000',1,Σfees}`; `LEAPS_ROLL` chain → one `{LONG,'-2.5000'}`; side from `rollFrom.action`
    - Output ordered by `fillDate` then `createdAt`; a chain placed at its earliest leg
    - A `CSP_OPEN` leg on a PMCC is excluded and `logger.warn` receives `pmcc_ledger_unknown_leg_role`
    - `currentLongStrike`: `'80.0000'` after `OPEN`, `'85.0000'` after `LEAPS_ROLL`, `null` with no long BUY; `leapsContracts(legs)` = newest long BUY leg's contracts
    - `pmccLedgerFromLegs(OPEN…LEAPS_ROLL)` → `basisPerShare '19.3000'`, `effectiveShareCost '104.3000'`; `[]` → `null`
    - `appendPmccSnapshot` after inserting `SHORT_2` → one row `basis_per_share '21.2000'`, `total_premium_collected '380.0000'`, `final_pnl NULL`, `trigger_event 'PMCC_SHORT_OPEN'`, `snapshot_at` starts with `eventDate`; returns `{ ledger, snapshot }` with `snapshot.basisPerShare === ledger.basisPerShare`
    - Writer sees a leg inserted earlier in the same `db.transaction`
    - Rollback: `db.transaction(() => { insert SHORT_2; appendPmccSnapshot(...); throw })()` → leg and snapshot counts unchanged; `DROP TABLE cost_basis_snapshots` inside the transaction → the leg is rolled back too
    - Logging: `logger.info` with `pmcc_basis_recalculated` `{ positionId, triggerEvent, basisPerShare, basisTotal }`; `logger.debug` with `pmcc_ledger_contributions`, `pmcc_roll_chains`
    - Agreement: after each fixture event the newest snapshot's `basis_per_share` equals `pmccLedgerFromLegs(readLegs(...)).basisPerShare`
  - Test cases (`pmcc-cost-basis-chain.test.ts`):
    - `createPmccPosition` + four transactions (`EXPIRE_1`→`PMCC_SHORT_EXPIRED`, `SHORT_2`→`PMCC_SHORT_OPEN`, `SHORT_ROLL`→`PMCC_SHORT_ROLL`, `LEAPS_ROLL`→`PMCC_LEAPS_ROLL`) → exactly five rows ASC with `basis_per_share` `['23.0000','23.0000','21.2000','21.8000','19.3000']`, the five triggers in order, `snapshot_at` strictly ascending
    - The short roll produced **one** snapshot (count 3 → 4), moving basis by exactly `0.6000`
  - Property cases: no property — service layer over storage; the arithmetic invariants live in Area 2
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-cost-basis-chain.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pmcc-ledger.ts` (new), `src/main/services/create-pmcc-position.ts` _(depends on: Area 5 Red ✓)_
  - `const PMCC_LEG_SIDE: Record<PmccLegRole, PmccLedgerSide>` (`LEAPS_*` → LONG, `SHORT_CALL_*` → SHORT); `export function buildPmccContributions(legs: LegRecord[]): PmccContribution[]` — non-roll legs signed by action (BUY +, SELL −, EXPIRE/ASSIGN/EXERCISE 0), roll chains via `groupRollChains` (`cash = Σ BUY − Σ SELL`, side LONG iff `rollFrom.action === 'SELL'`), ordered by `fillDate`/`createdAt`, unknown roles excluded with WARN
  - `export function currentLongStrike(legs): string | null`, `leapsContracts(legs)` — newest LONG + BUY leg; `export function pmccLedgerFromLegs(legs): PmccLedgerResult | null`
  - `export function appendPmccSnapshot(db, positionId, { triggerEvent: PmccTriggerEvent; eventDate: string; now: string }): { ledger: PmccLedgerResult; snapshot: CostBasisSnapshotRecord }` — `readLegs` → ledger → one `INSERT INTO cost_basis_snapshots` (`basis_per_share`, `total_premium_collected = shortCreditsTotal`, `final_pnl NULL`, `trigger_event`, `snapshot_at = makeSnapshotAt(eventDate)`, `created_at = now`); no transaction of its own; INFO/DEBUG per plan
  - `createPmccPosition`: inside its transaction, after both leg inserts, call `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_OPEN', eventDate: long.fillDate, now })`; drop the local snapshot arithmetic; keep `openingDebit` for the response/log
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-cost-basis-chain.test.ts src/main/services/create-pmcc-position.test.ts` — all tests must pass (create tests unchanged: `23.0000/200.0000`, `23.0200/199.0000`, DROP-TABLE rollback)
- [x] **[Refactor]** `/refactor` — `src/main/services/pmcc-ledger.ts`, `src/main/services/create-pmcc-position.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check `Decimal` import in `create-pmcc-position.ts` is still needed; note (do not touch) duplication with the five wheel snapshot INSERTs
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Read paths and test seam (depends on Layer 2)

> Three areas, parallel. All consume `pmccLedgerFromLegs` / `appendPmccSnapshot` from Area 5.

### Area 6 — Detail read path: `pmccLedger` on `positions:get`

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/get-position.test.ts`, `src/main/ipc/positions.test.ts` _(depends on: Area 5 Green ✓)_
  - Test cases (`describe('getPosition — PMCC ledger (US-103)')`):
    - After `createPmccPosition` → `pmccLedger` deep-equals the entry result (`'23.0000'`, `'2300.0000'`, `'103.0000'`, `'8.0000'`, …)
    - After seeding `SHORT_ROLL` + `LEAPS_ROLL` via `appendPmccSnapshot` → `basisPerShare '19.3000'`, `effectiveShareCost '104.3000'`, `leapsCostPerShare '22.5000'`
    - Wheel position → `pmccLedger === null`; PMCC whose legs were deleted → `null`
    - `legs` includes a `SHORT_CALL_EXPIRED` leg with `action 'EXPIRE'` when present (no role filtering)
    - `positions:get` envelope carries `pmccLedger` (one IPC case)
  - Property cases: no property — read path
  - Run `pnpm test src/main/services/get-position.test.ts src/main/ipc/positions.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/services/get-position.ts` _(depends on: Area 6 Red ✓)_
  - `GetPositionResult.pmccLedger: PmccLedgerResult | null` (import type from `../core/costbasis`); `getPosition` passes the already-read `legs` to `pmccLedgerFromLegs` when `strategyType === 'PMCC'`, else `null` — per `contracts/positions-get.md`
  - Run `pnpm test src/main/services/get-position.test.ts src/main/ipc/positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/get-position.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider one `pmccDetailFields(legs)` helper in `pmcc-ledger.ts` if `initialNetDebit` + `pmccLedger` read as noise
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 7 — List read path: running basis on `PmccListSummary`

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/list-positions.test.ts`, `src/renderer/src/lib/position-list-items.test.ts` _(depends on: Area 5 Green ✓)_
  - Test cases:
    - A PMCC lists with `pmcc.basisPerShare '23.0000'`, `pmcc.basisTotal '2300.0000'`; after a seeded short roll (`appendPmccSnapshot`) → `'21.8000'` / `'2180.0000'`; `pmcc.long` / `pmcc.short` unchanged (strike, expiration, dte, contracts)
    - 3 contracts + $0.01 fees per leg → `basisTotal '6900.0200'` (not `basis_per_share × 300`)
    - Wheel items deep-equal today's shape (existing regression stays green); a PMCC with no legs is dropped with WARN `pmcc_list_summary_incomplete`
    - `toPmccListItem(createResponse)` → `pmcc.basisPerShare === costBasisSnapshot.basisPerShare`, `pmcc.basisTotal === openingDebit.initialNetDebit`
  - Property cases: no property — read path
  - Run `pnpm test src/main/services/list-positions.test.ts src/renderer/src/lib/position-list-items.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/services/list-positions.ts`, `src/renderer/src/lib/position-list-items.ts` _(depends on: Area 7 Red ✓)_
  - `export type PmccListSummary = { long: PmccLegSummary; short: PmccLegSummary } & Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'>` (remove `initialNetDebit`) — per `contracts/positions-list.md`
  - `readPmccSummaries`: `readLegsByPosition` once → `pmccOpeningLegs` for `long`/`short`, `pmccLedgerFromLegs` for the two basis fields; drop + WARN when no ledger
  - `toPmccListItem`: fill `basisPerShare` from `res.costBasisSnapshot.basisPerShare`, `basisTotal` from `res.openingDebit.initialNetDebit`
  - Run `pnpm test src/main/services/list-positions.test.ts src/renderer/src/lib/position-list-items.test.ts` — all tests must pass (`PmccPositionRow.test.tsx` will fail typecheck until Area 10 — expected)
- [x] **[Refactor]** `/refactor` — `src/main/services/list-positions.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the shared "legs → opening summary + ledger" piece in `pmcc-ledger.ts`
  - Run `pnpm test && pnpm lint` (typecheck clean once Area 10 Green lands)

### Area 8 — Dev-only `_test:pmcc-record-leg-event` seam

**Requires:** Area 5 Green ✓ (and Area 1 Green ✓ for the Zod enums)

- [x] **[Red]** Write failing tests — `src/main/ipc/test-pmcc-ledger.test.ts` (new; mock `electron.ipcMain` like `test-scheduler.test.ts`) _(depends on: Area 5 Green ✓)_
  - Test cases:
    - Registers exactly one channel, `_test:pmcc-record-leg-event`
    - `SHORT_2` row → `{ ok: true, ledger.basisPerShare '21.2000', snapshot.triggerEvent 'PMCC_SHORT_OPEN' }`; `legs` +1 row, `cost_basis_snapshots` +1 row
    - `SHORT_ROLL` pair (two rows, shared `rollChainId`) → one snapshot, basis `'21.8000'`
    - Empty `legs` with `PMCC_SHORT_EXPIRED` → snapshot written, basis unchanged
    - `triggerEvent 'CSP_ROLL'` → `{ ok: false, errors: [{ field: 'triggerEvent', … }] }`, nothing written
    - `DROP TABLE cost_basis_snapshots` first → `{ ok: false, errors: [{ code: 'internal_error' }] }`, leg row rolled back
  - Property cases: no property — test seam
  - Run `pnpm test src/main/ipc/test-pmcc-ledger.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/ipc/test-pmcc-ledger.ts` (new), `src/main/index.ts`, `src/preload/index.ts` _(depends on: Area 8 Red ✓)_
  - `TestLegRowSchema` / `TestPmccLegEventPayloadSchema` per `contracts/test-pmcc-record-leg-event.md` (reuse `LegRole`, `LegAction`, `PmccTriggerEvent`, `IsoDateSchema`, `PositionIdSchema`)
  - `export function registerTestPmccLedgerIpc(db)`: `ipcMain.handle('_test:pmcc-record-leg-event', (_, payload) => handleIpcCall('test_pmcc_record_leg_event_unhandled_error', () => { parse; return db.transaction(() => { insert rows (randomUUID, now, instrument_type 'CALL', fill_price = premiumPerContract); return appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now }) })() }))`
  - Register beside `registerTestIvHistoryIpc(db)` inside the `NODE_ENV === 'test'` block in `src/main/index.ts`; preload `testPmccRecordLegEvent: (payload: unknown) => invoke('_test:pmcc-record-leg-event', payload)` beside `testIvSeriesSet`
  - Run `pnpm test src/main/ipc/test-pmcc-ledger.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/test-pmcc-ledger.ts` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If the leg INSERT is byte-identical to `insertPmccLeg` in `create-pmcc-position.ts`, generalise into `leg-rows.ts#insertLegRow` and use from both; otherwise keep the seam self-contained
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer (depends on Layer 3)

> Two areas, parallel. Area 9 needs the detail field (Area 6); Area 10 needs the list summary shape (Area 7).

### Area 9 — Renderer: `fmtPct1`, `PmccCostBasis` drawer, cockpit stack

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/format.test.ts`, `src/renderer/src/components/position-cockpit/PmccCostBasis.spec.tsx` (new), `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` _(depends on: Area 6 Green ✓)_
  - Test cases (`format.test.ts`): `fmtPct1('8.0000') === '8.0%'`, `fmtPct1('101.7778') === '101.8%'`, `fmtPct1('12.8000') === '12.8%'`, `fmtPct1('0.0500') === '0.1%'` (half-up)
  - Test cases (`PmccCostBasis.spec.tsx`, fixture = `rs-recorded` ledger `21.8000 / 2180.0000 / 25.0000 / 3.2000 / 101.8000 / 12.8000`):
    - Drawer titled `Cost basis`, `6 fields`, `aria-expanded="true"` on mount, caption `US-103 · cash ledger, never a quote`
    - Six labels in order: `Cost basis / share`, `Total`, `LEAPS cost to date`, `Short-call credits to date`, `Effective share cost`, `Premium recovered`
    - Values `$21.80`, `$2,180.00`, `$25.00`, `-$3.20`, `$101.80`, `12.8%` (assert via the label's parent, e.g. `toHaveTextContent('Short-call credits to date-$3.20')`)
    - Negative ledger (`-0.4000 / -40.0000 / … / 101.7778`) → `-$0.40`, `-$40.00`, `101.8%`
    - `premiumRecoveredPercent: null` → `—`; `effectiveShareCost: null` → `—`
    - Drawer text contains none of `profit`, `realized`, `Effective Basis / Share`, `Shares`, `Max profit`, `Breakeven`, `Annualized` (case-insensitive)
    - `Short-call credits to date` value has no `text-wb-green`; `Cost basis / share` value has `text-wb-sky`
  - Test cases (`PositionCockpit.spec.tsx`, `describe('PMCC position')`): with `pmccLedger` set, `Buy LEAPS call` precedes `Cost basis` in DOM order (`compareDocumentPosition`) and `Cost basis / share` is visible; `pmccLedger: null` → no `Cost basis` drawer; `Cost basis & history` still absent; wheel describes unchanged and never render `Cost basis / share` / `Effective share cost`
  - Property cases: no property — renderer
  - Run `pnpm test src/renderer/src/lib/format.test.ts src/renderer/src/components/position-cockpit/PmccCostBasis.spec.tsx src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/format.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx` (new), `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: Area 9 Red ✓)_
  - `export function fmtPct1(value: string): string` — `new Decimal(value).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1) + '%'`
  - `api/positions.ts`: `export type { PmccLedgerResult } from '../../../main/core/costbasis'`
  - `PmccCostBasis({ ledger }: { ledger: PmccLedgerResult })` → `<CollapsedDrawer title="Cost basis" fieldCount={6} defaultOpen>` → `<div className="px-5 pt-3"><Caption>US-103 · cash ledger, never a quote</Caption></div>` → `<StatGrid minWidth={150} items={[...]}/>`: `fmtMoney(basisPerShare)` in `text-wb-sky`; `fmtMoneyGrouped(basisTotal)`; `fmtMoney(leapsCostPerShare)`; `fmtMoney(negated shortCreditsPerShare)` neutral colour; `effectiveShareCost ? fmtMoney : '—'`; `premiumRecoveredPercent ? fmtPct1 : '—'`. Tailwind + `wb-*` only; no strike naming, no "paid for" state, no green credits
  - `PositionCockpit` PMCC branch → `<div className="flex flex-col gap-3"><PmccLegReference legs={legs} initialNetDebit={initialNetDebit} />{pmccLedger ? <PmccCostBasis ledger={pmccLedger} /> : null}</div>`; wheel branches untouched
  - Run the same three test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `PmccCostBasis.tsx`, `PositionCockpit.tsx` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Decide whether `PmccLegReference`'s own `flex-col gap-3` wrapper lifts into the cockpit stack; naming parity with the wheel's `CostBasisDrawer`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 10 — Renderer: PMCC list row shows the running cost basis

**Requires:** Area 7 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PmccPositionRow.test.tsx` _(depends on: Area 7 Green ✓)_
  - Test cases:
    - Fixture `pmcc: { long, short, basisPerShare: '21.8000', basisTotal: '2180.0000' }` → cell 10 `toHaveTextContent('$2,180.00')` and `not.toHaveTextContent('net debit')`
    - `basisTotal '-40.0000'` → `-$40.00` (signed, not clamped)
    - The other nine cells' assertions unchanged
  - Property cases: no property — renderer
  - Run `pnpm test src/renderer/src/components/PmccPositionRow.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PmccPositionRow.tsx` _(depends on: Area 10 Red ✓)_
  - Destructure `basisTotal` from `item.pmcc`; last `TableCell` renders `fmtMoneyGrouped(basisTotal)`; delete the `net debit` suffix
  - Run `pnpm test src/renderer/src/components/PmccPositionRow.test.tsx` — all tests must pass; `pnpm typecheck` clean (closes the Area 7 gap)
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PmccPositionRow.tsx` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from Layers 1–4 ✓

### Area 11 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-cost-basis.spec.ts` (new), `e2e/pmcc-ledger-helpers.ts` (new) _(depends on: all Green tasks ✓)_
  - Helpers: `createXyzPmcc(page, { contracts?, fees? })` via `window.api.createPmccPosition` with `pmccFixture` values; `recordEvent(page, positionId, event)` via `window.api.testPmccRecordLegEvent`; fixture events `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `LEAPS_ROLL`, `CYCLES` with `localDate(n)` offsets from `data-model.md § 5`; `drawer(page)` (`button:has-text("Cost basis")` + following sibling); `cell(page, label)`; `snapshots(page, id)` (`window.api.getPosition` → `allSnapshots`). Launch with `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })`
  - One `it()` per AC scenario — names mirror the Gherkin:
    - AC-1: Cost basis after the two opening legs → `it('Cost basis after the two opening legs')` — drawer `aria-expanded="true"` without a click; `Buy LEAPS call` precedes the drawer in DOM; cells `$23.00`, `$2,300.00`, `$25.00`, `-$2.00`, `$103.00`, `8.0%`; none of `Max profit`, `Breakeven`, `Annualized`
    - AC-2: The open short-call credit is cash in the ledger, not profit → `it('The open short-call credit is cash in the ledger, not profit')` — credits `-$2.00`; drawer text has no `profit` / `realized` (case-insensitive), no `Effective Basis / Share`, no `Shares`
    - AC-3: A short call that expires worthless does not move cost basis → `it('A short call that expires worthless does not move cost basis')` — after `EXPIRE_1`: `$23.00` / `$2,300.00`; `snapshots()` has 2 rows, last `PMCC_SHORT_EXPIRED` with `'23.0000'`
    - AC-4: A subsequent short call lowers cost basis → `it('A subsequent short call lowers cost basis')` — `EXPIRE_1` + `SHORT_2`: `$21.20`, `$2,120.00`, `-$3.80`, `$101.20`
    - AC-5: A short-call roll contributes one net amount, not two gross amounts → `it('A short-call roll contributes one net amount, not two gross amounts')` — + `SHORT_ROLL`: `$21.80`, `$2,180.00`; snapshots grew by exactly one row, `PMCC_SHORT_ROLL`, `'21.8000'`, delta `0.6000` from previous
    - AC-6: A LEAPS roll applies its net cash and re-anchors the effective share cost → `it('A LEAPS roll applies its net cash and re-anchors the effective share cost')` — + `LEAPS_ROLL`: `$19.30`, `$1,930.00`, LEAPS cost `$22.50`, effective `$104.30`
    - AC-7: Credits that exceed the LEAPS cost give a negative basis → `it('Credits that exceed the LEAPS cost give a negative basis')` — + `CYCLES`: `-$0.40`, `-$40.00`, `101.8%`; not `$0.00`
    - AC-8: Cost basis is per share of contract regardless of quantity → `it('Cost basis is per share of contract regardless of quantity')` — `contracts 3`: `$23.00`, `$6,900.00`
    - AC-9: Fees are counted once, in the leg that incurred them → `it('Fees are counted once, in the leg that incurred them')` — `fees 1.00` each leg: `$23.02`, `$2,302.00`
    - AC-10: The audit chain records one snapshot per leg event → `it('The audit chain records one snapshot per leg event')` — five rows, triggers `['PMCC_OPEN','PMCC_SHORT_EXPIRED','PMCC_SHORT_OPEN','PMCC_SHORT_ROLL','PMCC_LEAPS_ROLL']`, bases `['23.0000','23.0000','21.2000','21.8000','19.3000']`, `snapshotAt` ascending
    - AC-11: A failed leg event leaves no cost-basis change → `it('A failed leg event leaves no cost-basis change')` — abort trigger on `cost_basis_snapshots` (not `chmod`, which the open read-write handle defeats); `recordEvent(SHORT_2)` → `{ ok: false }`; drop trigger; reload: `$23.00`; `tableCount('legs') === 2`; `snapshots().length === 1`
    - AC-12: The positions list shows the running cost basis → `it('The positions list shows the running cost basis')` — after `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`: XYZ `position-card` text contains `$2,180.00`, neither `$2,300.00` nor `net debit`
    - AC-13: Leave a classic wheel unaffected → `it('Leave a classic wheel unaffected')` — `reachHoldingSharesState` wheel (strike `48.50`, premium `2.00`, assigned → $46.50): detail shows `Cost basis & history`, contains neither `Cost basis / share` nor `Effective share cost`
  - Run `pnpm rebuild:electron && pnpm test:e2e e2e/pmcc-cost-basis.spec.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Fix only what the failures point at; reuse `launchPmcc`, `pmccFixture`, `tableCount`, `openDetailFor`, `reachHoldingSharesState`
  - Run `pnpm test:e2e` — all tests must pass (`open-pmcc-position.spec.ts` and `position-cockpit.spec.ts` included)
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/pmcc-cost-basis.spec.ts`, `e2e/pmcc-ledger-helpers.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share OCC/launch pieces with `open-pmcc-position.spec.ts` through `pmcc-helpers.ts`; keep each `it` to one scenario

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] Core-engine area (Area 2) has property tests; every other area states "no property — reason"
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (13 scenarios → 13 named `it`s)
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] Logging: INFO `pmcc_basis_recalculated`, DEBUG contributions / roll chains / snapshot insert, WARN unknown role — no logging in `src/main/core/`
- [x] `/update-spec us-103` run after the story completes
