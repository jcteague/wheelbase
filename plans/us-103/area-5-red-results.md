# Red Phase Results: US-103 Area 5 — PMCC ledger service

## Feature Context

- **Feature directory**: `plans/us-103/`
- **User story**: US-103 (Linear) — PMCC cost basis
- **Plan file**: `plans/us-103/plan.md` § 5; `plans/us-103/tasks.md` Area 5; `research.md` ADRs "appendPmccSnapshot is the one writer", "Contributions are classified by leg role → side", § Worked ledger; `data-model.md` § 5 fixtures

## Test Files Created/Modified

- `/Users/johnteague/my-stuff/wb-103/src/main/services/pmcc-ledger.test.ts` — new, 35 tests
- `/Users/johnteague/my-stuff/wb-103/src/main/services/pmcc-cost-basis-chain.test.ts` — new, 4 tests
- `/Users/johnteague/my-stuff/wb-103/src/main/services/test-fixtures/pmcc-legs.ts` — new shared fixture helper (test code): `pmccFixtures(positionId, day = FIXED_DAY)` → `OPEN`, `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL` (`rc-1`), `LEAPS_ROLL` (`rc-2`), `CYCLES`, `FEES`, `THREE`; `makePmccLeg(positionId, fields, seq)`; `insertLegs(db, legs)`; `FIXED_DAY` anchored on 2026-09-14

## Interfaces Under Test

```typescript
// src/main/services/pmcc-ledger.ts
export function buildPmccContributions(legs: LegRecord[]): PmccContribution[]
export function currentLongStrike(legs: LegRecord[]): string | null
export function leapsContracts(legs: LegRecord[]): number
export function pmccLedgerFromLegs(legs: LegRecord[]): PmccLedgerResult | null
export function appendPmccSnapshot(
  db: Database.Database,
  positionId: string,
  opts: { triggerEvent: PmccTriggerEvent; eventDate: string; now: string }
): { ledger: PmccLedgerResult; snapshot: CostBasisSnapshotRecord }
```

## Test Coverage Summary

### `pmcc-ledger.test.ts`

- [x] `buildPmccContributions`: OPEN → LONG `25.0000` / SHORT `-2.0000`; FEES carries `1.0000` per leg; THREE carries contracts 3
- [x] EXPIRE → SHORT `0.0000`; `SHORT_CALL_CLOSE` BUY → SHORT `0.5500`; `LEAPS_CLOSE` SELL → LONG `-24.1000`
- [x] SHORT_ROLL → one SHORT `0.6000` with fees Σ (`0.6500` + `0.6500` = `1.3000`); LEAPS_ROLL → one LONG `-2.5000`; chain contracts = `ROLL_TO.contracts`
- [x] Ordered by `fillDate` then `createdAt` regardless of input order; a chain sits at its earliest leg
- [x] `CSP_OPEN` leg excluded + `logger.warn({ legRole: 'CSP_OPEN', … }, 'pmcc_ledger_unknown_leg_role')`; no warn for ROLL legs / PMCC roles; `[]` → `[]`
- [x] `currentLongStrike`: `80.0000` after OPEN, `85.0000` after LEAPS roll, ignores a short roll's BUY half, `null` with no long BUY
- [x] `leapsContracts`: LEAPS leg's contracts; newest long BUY (LEAPS `ROLL_TO`) after a roll
- [x] `pmccLedgerFromLegs`: open full result; `19.3000` / `104.3000` after LEAPS roll; `-0.4000` / `84.6000` / `101.7778` with CYCLES; FEES `23.0200` / `199.0000`; THREE `6900.0000`; `[]` → `null`; no long BUY → `null`
- [x] `appendPmccSnapshot`: one row `21.2000` / `380.0000` / `final_pnl NULL` / `PMCC_SHORT_OPEN` / `snapshot_at` starts with `eventDate` / `created_at = now`; returns `{ ledger, snapshot }` with `snapshot` deep-equal to the row
- [x] Sees a leg inserted earlier in the same `db.transaction`; a two-leg roll → one row `21.8000` / `320.0000`
- [x] Rollback on caller throw (legs + snapshots unchanged); `DROP TABLE cost_basis_snapshots` inside the transaction → leg rolled back
- [x] Logging: INFO `pmcc_basis_recalculated` `{ positionId, triggerEvent, basisPerShare, basisTotal }`; DEBUG `pmcc_ledger_contributions`, `pmcc_roll_chains`
- [x] Agreement: after each of six events the newest snapshot equals `pmccLedgerFromLegs(readLegs(...)).basisPerShare` (`23, 23, 21.2, 21.8, 19.3, -0.4`)

### `pmcc-cost-basis-chain.test.ts`

- [x] `createPmccPosition` + four `db.transaction` events → five rows `23.0000, 23.0000, 21.2000, 21.8000, 19.3000`
- [x] Triggers `PMCC_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_OPEN, PMCC_SHORT_ROLL, PMCC_LEAPS_ROLL` in order; `snapshot_at` strictly ascending
- [x] Snapshot counts after each step `[1,2,3,4,5]` (short roll 3 → 4) and basis delta exactly `0.6000`

### Property Tests

- No property — service layer over storage; the arithmetic invariants live in Area 2 (`costbasis.property.test.ts`)

## Test Design Assumptions

- Logger is spied with `vi.spyOn(logger, 'info' | 'debug' | 'warn')` (pino convention: `(obj, msg)`). The unknown-role WARN object must include `legRole`; DEBUG payloads are not inspected.
- `appendPmccSnapshot` tests seed the position with `insertPosition` and fixed-date fixture legs (no `createPmccPosition`), so snapshot counts start at 0. The chain test goes through `createPmccPosition`, which validates against the run day, so it uses `pmccFixtures(id, isoDate)` (run-day-relative).
- Returned `snapshot` is a `CostBasisSnapshotRecord` with exactly `id, positionId, basisPerShare, totalPremiumCollected, finalPnl, triggerEvent, snapshotAt, createdAt`, matching the inserted row.
- The newest long BUY leg (for `currentLongStrike` / `leapsContracts`) is `LEAPS_OPEN` or the `ROLL_TO` of a chain whose `ROLL_FROM` is a SELL; a short roll's `ROLL_FROM` BUY must not count.
- `pmccLedgerFromLegs` returns `null` when no long BUY leg exists (not only for `[]`).
- Test logic was checked against a throwaway reference implementation in the session scratchpad (aliased in via a scratch vitest config; no repo file created): 39/39 passed.
- `test-fixtures/pmcc-legs.ts` is not matched by the coverage exclude `src/**/*test-utils.ts`; it is fully exercised by these suites.

## Test Execution Results

```bash
pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-cost-basis-chain.test.ts

FAIL  main  src/main/services/pmcc-cost-basis-chain.test.ts
Error: Cannot find module './pmcc-ledger' imported from '.../pmcc-cost-basis-chain.test.ts'

FAIL  main  src/main/services/pmcc-ledger.test.ts
Error: Cannot find module './pmcc-ledger' imported from '.../pmcc-ledger.test.ts'

Test Files  2 failed (2)
     Tests  no tests
```

`pnpm typecheck`: only `TS2307 Cannot find module './pmcc-ledger'` in both files, plus two `TS7006` implicit-any on `.map((c) => …)` over `buildPmccContributions` results, which follow from the missing module. ESLint clean on all three new files.

## Verification

- ✅ Every test fails because `./pmcc-ledger` does not exist yet — not due to test bugs
- ✅ No syntax errors in test files
- ✅ No fixture or import errors caused by test setup mistakes (validated against a scratch reference implementation)

## Handoff to Green Phase

1. Create `src/main/services/pmcc-ledger.ts` with exactly the interfaces above
2. Refactor `createPmccPosition` to call `appendPmccSnapshot` (tasks.md Area 5 Green)
3. Run `pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-cost-basis-chain.test.ts src/main/services/create-pmcc-position.test.ts`
