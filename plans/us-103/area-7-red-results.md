# Red Phase Results: US-103 Area 7 — List read path (running basis on `PmccListSummary`)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan**: `plans/us-103/plan.md` § 7; `plans/us-103/tasks.md` Area 7; contract `plans/us-103/contracts/positions-list.md`

## Test Files Modified

- `/Users/johnteague/my-stuff/wb-103/src/main/services/list-positions.test.ts`
- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/lib/position-list-items.test.ts`

## Interfaces Under Test

```typescript
// src/main/schemas.ts
export type PmccListSummary = { long: PmccLegSummary; short: PmccLegSummary } & Pick<
  PmccLedgerResult,
  'basisPerShare' | 'basisTotal'
> // initialNetDebit REMOVED

// src/main/services/list-positions.ts
listPositions(db) // PMCC item.pmcc = { long, short, basisPerShare, basisTotal }

// src/renderer/src/lib/position-list-items.ts
toPmccListItem(res, now) // pmcc.basisPerShare = res.costBasisSnapshot.basisPerShare
// pmcc.basisTotal    = res.openingDebit.initialNetDebit
```

## Test Coverage Summary

### `list-positions.test.ts` (5 changed, 4 added)

Changed (assertions on `pmcc.initialNetDebit` replaced):

- [x] PMCC lists with `basisPerShare '23.0000'`, `basisTotal '2300.0000'` (full `toEqual` on `pmcc`)
- [x] 3 contracts → `basisTotal '6900.0000'`, `basisPerShare '23.0000'`
- [x] 3 contracts + $0.01 fees/leg → `basisTotal '6900.0200'`, and ≠ `effectiveCostBasis × 300`
- [x] Missing snapshot → `basisPerShare '23.0000'` / `basisTotal '2300.0000'` still from legs
- (renamed titles only on the above)

Added:

- [x] `pmcc` has no `initialNetDebit` key
- [x] After `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL` (`insertLegs` + `appendPmccSnapshot` in `db.transaction`) → `'21.8000'` / `'2180.0000'`; `pmcc.long` / `pmcc.short` deep-equal the pre-event summaries
- [x] PMCC with no legs dropped + WARN `pmcc_list_summary_incomplete` — **regression guard, passes today**
- [x] Wheel item beside a PMCC deep-equals the full pre-US-103 shape — **regression guard, passes today**

### `position-list-items.test.ts` (1 changed, 2 added)

- [x] Full `toEqual<PmccListItem>` now expects `basisPerShare '23.0000'`, `basisTotal '2300.0000'`
- [x] `pmcc.basisPerShare === res.costBasisSnapshot.basisPerShare`, `pmcc.basisTotal === res.openingDebit.initialNetDebit`
- [x] `pmcc` has no `initialNetDebit` key

### Property Tests

- No property — read path (no new pure engine; the ledger engine's properties live with Area 5).

## Test Design Assumptions

- Run-day-relative dates (`isoDate`) because `createPmccPosition` validates against today; fixtures via `pmccFixtures(position.id, isoDate)`, as in `pmcc-cost-basis-chain.test.ts`.
- "`pmcc.long` / `pmcc.short` unchanged" means the summaries stay on the **opening** legs (contract: "opening LEAPS leg, unchanged").

## Test Execution Results

```
pnpm test src/main/services/list-positions.test.ts src/renderer/src/lib/position-list-items.test.ts

list-positions.test.ts — 6 failed
  × lists a PMCC ... running cost basis   expected { …(3) } to deeply equal { …(4) }  (initialNetDebit present, basis fields absent)
  × scales the basis total by contracts   expected undefined to be '6900.0000'
  × computes the basis total from the legs ... 6900.0200   expected undefined to be '6900.0200'
  × zeroed snapshot money fields          expected undefined to be '23.0000'
  × drops initialNetDebit                 expected { …(3) } to not have property "initialNetDebit"
  × running basis after ... short roll    expected undefined to be '21.8000'
position-list-items.test.ts — 3 failed
  × builds the PMCC list row ...          deep-equal mismatch (initialNetDebit vs basisPerShare/basisTotal)
  × fills basisPerShare ...               expected undefined to be '23.0000'
  × no longer carries initialNetDebit     expected { …(3) } to not have property "initialNetDebit"
```

## Verification

- ✅ Every new/changed test fails because `basisPerShare`/`basisTotal` are absent or `initialNetDebit` is still present
- ✅ The two regression guards pass today, by design
- ✅ No syntax, import or fixture errors; prettier + eslint clean

## Notes for Green

1. **`pmccOpeningLegs` uses `findLast`** — after `SHORT_2` (a later `SHORT_CALL_OPEN`, strike 108) it returns that leg, not the opening 110 short, so the "short unchanged" assertion will fail unless the list summary uses the _first_ `SHORT_CALL_OPEN` / `LEAPS_OPEN`. `get-position.ts` also uses `pmccOpeningLegs` (another agent is on it) — reconcile there.
2. **"fill price missing" drop test** (existing) relies on `pmccInitialNetDebit` needing `fillPrice`. `pmccLedgerFromLegs` uses `premiumPerContract`, so once the summary comes from the ledger that case may no longer drop. Decide: keep a fill-price guard, or update/remove that test.
3. Typecheck of both test files fails until `PmccListSummary` changes (expected in Red).
