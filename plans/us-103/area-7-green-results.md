# Green Phase Results: US-103 Area 7 — List read path (running basis on `PmccListSummary`)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan file**: `plans/us-103/plan.md` § 7; contract `plans/us-103/contracts/positions-list.md`
- **Red phase results**: `plans/us-103/area-7-red-results.md`
- Mockup: no renderer UI changed here (`position-list-items.ts` is a data mapper); row rendering is Area 10.

## Files touched (production)

- `src/main/schemas.ts` — `PmccListSummary` is now `{ long; short } & Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'>`; `initialNetDebit` removed (targeted edit only).
- `src/main/services/list-positions.ts` — `readPmccSummaries` keeps `pmccOpeningLegs` for `long`/`short` and takes `basisPerShare`/`basisTotal` from `pmccLedgerFromLegs(legs)`; no ledger or a missing long/short summary drops the PMCC (existing WARN `pmcc_list_summary_incomplete`). `pmccInitialNetDebit` import removed (still used by `get-position.ts`).
- `src/renderer/src/lib/position-list-items.ts` — `toPmccListItem` fills `basisPerShare` from `costBasisSnapshot.basisPerShare` and `basisTotal` from `openingDebit.initialNetDebit`.

## E2E coverage added or modified

None.

## Public Interfaces Implemented

```typescript
// src/main/schemas.ts
export type PmccListSummary = { long: PmccLegSummary; short: PmccLegSummary } & Pick<
  PmccLedgerResult,
  'basisPerShare' | 'basisTotal'
>
```

## Red-test corrections (orchestrator decision)

1. **"running basis after an expiration, a new short and a short-call roll"** — the Red test
   asserted `pmcc.short` unchanged after seeding `SHORT_2`. That contradicts shipped US-101
   behaviour: `pmccOpeningLegs` uses later-rows-win (`findLast`) so a newer `SHORT_CALL_OPEN`
   supersedes the opening one, and US-103 must not change the `long`/`short` semantics.
   `pmccOpeningLegs` was left untouched. The assertion now states the shipped rule explicitly:
   `pmcc.long` deep-equals the pre-event summary (no new `LEAPS_OPEN`), and `pmcc.short` equals
   the `SHORT_2` leg (`strike '108.0000'`, its expiration, `computeDte(expiration)`, contracts).
   The `'21.8000'` / `'2180.0000'` basis assertions are kept.
2. **"fill price missing → position dropped"** — **updated, not deleted.** It relied on
   `pmccInitialNetDebit` needing `fillPrice`; the ledger uses `premiumPerContract`, so the PMCC
   is now listed. Renamed to "lists a PMCC whose leg fill price is missing, with the basis from
   its premiums (US-103)" and asserts the item is listed with `basisPerShare '23.0000'` /
   `basisTotal '2300.0000'` and no `pmcc_list_summary_incomplete` WARN. It is not a duplicate:
   no other case pins that the list basis is independent of `fill_price`.

## Test Execution Results

```
pnpm test src/main/services/list-positions.test.ts src/renderer/src/lib/position-list-items.test.ts
 ✓ renderer src/renderer/src/lib/position-list-items.test.ts (8 tests)
 ✓ main     src/main/services/list-positions.test.ts (31 tests)
 Tests 39 passed (39)
```

Full `pnpm test`: 3877 passed, 9 failed — all 9 were 5000ms timeouts in `src/main/index.test.ts`
and `src/main/ipc/*.test.ts` (known load flake). Rerun alone
(`pnpm test src/main/index.test.ts src/main/ipc/`): 15 files / 193 tests passed.

## Quality Checks

- ✅ `pnpm test` (after isolated rerun of the flaky ipc/index files)
- ✅ `pnpm lint`
- ⚠️ `pnpm typecheck` — remaining errors, none in Area 7 files:
  - Area 10 (expected): `PmccPositionRow.tsx(22)` and `PmccPositionRow.test.tsx(16)` read/build `initialNetDebit`.
  - Area 10 (same cause, not listed by the orchestrator): `PositionCard.test.tsx(296)` builds a
    `PmccListItem` fixture with `initialNetDebit` and asserts the row's `"$2,300.00 net debit"`
    text — it renders `PmccPositionRow`, so its fixture and text assertion move with Area 10's
    row change. Left untouched.
  - Another agent's in-progress `GetPositionResult.pmccLedger`: `PositionCockpit.spec.tsx(42)`,
    `PositionDetailContent.test.tsx(18)`, `PositionDetailPage.test.tsx(169)` missing `pmccLedger`.

## Known Limitations / Tech Debt (for Refactor)

- `readPmccSummaries` and `getPosition` both do "legs → opening summary + ledger"; plan suggests
  keeping the shared piece in `pmcc-ledger.ts`.
- `pmccInitialNetDebit` is now only used by `get-position.ts`; may be orphaned once Area 6 lands.

### Known limitation (deferred to US-104/105)

`pmccOpeningLegs` picks the last `LEAPS_OPEN` / `SHORT_CALL_OPEN` row and never consults roll
(`ROLL_FROM`/`ROLL_TO`) or expiry legs. After a roll or expiry seeded through the test seam, the
list row's `pmcc.long` / `pmcc.short` still show the last `*_OPEN` leg; the cost basis fields are
correct. Roll-aware leg summaries belong to the stories that record rolls in production
(US-104/105).
