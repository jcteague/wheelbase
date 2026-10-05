# Green Phase Results: US-103 Area 5 — PMCC ledger service

## Feature Context

- **Feature directory**: `plans/us-103/`
- **User story**: US-103 (Linear) — PMCC cost basis
- **Plan file**: `plans/us-103/plan.md` § 5; `plans/us-103/tasks.md` Area 5
- **Red phase results**: `plans/us-103/area-5-red-results.md`
- **Mockup**: not applicable (no renderer files touched)

## Files touched (production)

- `src/main/services/pmcc-ledger.ts` (new, 186 lines) — `PMCC_LEG_SIDE`, contributions builder, newest-long-BUY lookup, ledger-from-legs, and `appendPmccSnapshot`, the one PMCC snapshot writer
- `src/main/services/create-pmcc-position.ts` — opening snapshot now written by `appendPmccSnapshot` (`PMCC_OPEN`, `eventDate: long.fillDate`) inside the existing transaction after both leg inserts; local basis / premium / `snapshot_at` arithmetic and the inline INSERT removed. `openingDebit` is still computed for the response and INFO log

## E2E coverage added or modified

None.

## Public Interfaces Implemented

```typescript
// src/main/services/pmcc-ledger.ts
export function buildPmccContributions(legs: LegRecord[]): PmccContribution[]
export function currentLongStrike(legs: LegRecord[]): string | null
export function leapsContracts(legs: LegRecord[]): number
export function pmccLedgerFromLegs(legs: LegRecord[]): PmccLedgerResult | null
export function appendPmccSnapshot<T extends PmccTrigger>(
  db: Database.Database,
  positionId: string,
  opts: { triggerEvent: T; eventDate: string; now: string }
): {
  ledger: PmccLedgerResult
  snapshot: CostBasisSnapshotRecord & { triggerEvent: T; finalPnl: null }
}
```

## Implementation Summary

### Approach

- Non-roll legs: role must pass `isPmccLegRole` (else `logger.warn({ positionId, legId, legRole }, 'pmcc_ledger_unknown_leg_role')` and excluded); side from `PMCC_LEG_SIDE: Record<PmccLegRole, PmccLedgerSide>`; cash `+premium` BUY, `−premium` SELL, `0` otherwise.
- Roll legs: `groupRollChains` → one contribution per chain; `cashPerShare = −netCreditPerShare` (= Σ BUY − Σ SELL); side `LONG` iff `rollFrom.action === 'SELL'`; contracts / fees taken from the chain.
- All entries sorted by `fillDate` then `createdAt`; a chain sorts on its own `fillDate` (earliest leg) and earliest `createdAt`.
- Newest long BUY = latest of `LEAPS_OPEN` legs and `ROLL_TO` of chains with a SELL `ROLL_FROM`; it supplies `currentLongStrike`, `leapsContracts` and the ledger's `longStrike`. `pmccLedgerFromLegs` returns `null` without one.
- `appendPmccSnapshot`: `readLegs` → ledger → one INSERT (`final_pnl NULL`, `snapshot_at = makeSnapshotAt(eventDate)`, `created_at = now`); no transaction of its own; INFO `pmcc_basis_recalculated`; DEBUG `pmcc_roll_chains` and `pmcc_ledger_contributions` from the builder.

### Deviations from Plan

- `appendPmccSnapshot` is generic over the trigger event so its `snapshot` narrows to `triggerEvent: T; finalPnl: null`. That lets `createPmccPosition` return it as `CostBasisSnapshotRecord & { triggerEvent: 'PMCC_OPEN'; finalPnl: null }` without a spread or cast. It is still assignable to the planned non-generic signature.
- `appendPmccSnapshot` throws `PMCC position <id> has no LEAPS leg` when the ledger is `null` (needed to type `ledger` as non-null; not test-driven).
- `PmccTriggerEvent` has no exported type alias in `schemas.ts` (only the Zod const), so the file declares a local `type PmccTrigger = z.infer<typeof PmccTriggerEvent>`.
- No test edits.

## Test Execution Results

```bash
pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-cost-basis-chain.test.ts src/main/services/create-pmcc-position.test.ts
 ✓ pmcc-ledger.test.ts (35 tests)
 ✓ pmcc-cost-basis-chain.test.ts (4 tests)
 ✓ create-pmcc-position.test.ts (13 tests)
 Tests 52 passed (52)

pnpm test
 Test Files 261 passed (261)
      Tests 3867 passed (3867)
```

## Quality Checks

- ✅ `pnpm test` passed (full suite)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed
- ✅ prettier applied to both touched files

## Known Limitations / Tech Debt

- **`PmccTrigger` alias** — belongs in `schemas.ts` as `export type PmccTriggerEvent = z.infer<typeof PmccTriggerEvent>` (same-name type/const pair); was not added because `schemas.ts` was being edited concurrently.
- **Duplicate ordering helpers** — `byFillThenCreated` / `chainCreatedAt` in `pmcc-ledger.ts` repeat `earlier` / `earliestCreatedAt` and the sort comparator in `roll-chains.ts`. A shared `(fillDate, createdAt)` comparator could be exported from `roll-chains.ts` or `leg-rows.ts`.
- **`groupRollChains` runs twice** in `pmccLedgerFromLegs` (once in `newestLongBuy`, once in `buildPmccContributions`). Cheap, but the chains could be computed once and passed in.
- **Signed premium duplication** — `signedCashPerShare` here is the negation of `signedPremium` in `roll-chains.ts`.
- **Snapshot INSERT duplication** — every wheel service (`positions.ts`, `expire-csp-position.ts`, `close-csp-position.ts`, `roll-csp-position.ts`, `roll-cc-position.ts`, `open-covered-call-position.ts`, `assign-csp-position.ts`, `record-call-away-position.ts`) inlines its own `INSERT INTO cost_basis_snapshots`. `pmcc-ledger.ts` adds one more. A shared `insertSnapshot(db, record)` in a `snapshot-rows.ts` (sibling of `position-rows.ts` / `leg-rows.ts`) would collapse them.
- **`create-pmcc-position.ts`** — `Decimal` is still needed (`money4` in `toLegInput`). `randomUUID` is still used for position / leg ids. The INFO log and response still use `openingDebit`, so `calculatePmccOpeningDebit` stays; its `basisPerShare` now duplicates the ledger's for the opening.

## Handoff to Refactor Phase

Run `/refactor` on `src/main/services/pmcc-ledger.ts` and `src/main/services/create-pmcc-position.ts`. Start from the tech-debt list above.
