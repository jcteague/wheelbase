# Green Phase Results: Extract Shared Active Leg SQL Helper (Area 1)

## Feature Context

- **Feature directory**: `plans/us-12-refactor/`
- **Plan file**: `plans/us-12-refactor/plan.md`
- **Red phase results**: `plans/us-12-refactor/red-phase-results.md`

## Implementation Files Created/Modified

- `src/main/services/active-leg-sql.ts` — **created**: exports `activeLegSubquery()`, the single source of truth for the phase-aware active leg SQL subquery
- `src/main/services/list-positions.ts` — **modified**: imports and uses `activeLegSubquery()` in `LIST_QUERY`; removed buggy `leg_role IN ('CSP_OPEN', 'CC_OPEN')` subquery
- `src/main/services/get-position.ts` — **modified**: imports and uses `activeLegSubquery()` in `GET_QUERY`; removed inline duplicate subquery

## Public Interfaces Implemented

```typescript
// src/main/services/active-leg-sql.ts
export function activeLegSubquery(): string
// Returns the phase-aware SQL subquery for the current open leg:
//   CSP_OPEN phase → CSP_OPEN or ROLL_TO legs
//   CC_OPEN phase  → CC_OPEN  or ROLL_TO legs
//   Other phases   → no match (returns null via LEFT JOIN)
```

## Implementation Summary

### Approach

Extracted the correct phase-aware subquery already present in `get-position.ts` into a shared helper module. Updated `list-positions.ts` to use it (fixing the bug where ROLL_TO legs were invisible). Updated `get-position.ts` to use the same helper (eliminating duplication).

### Key Design Decisions

- Simple pure function returning a string — no parameters needed since the subquery references `p.id` and `p.phase` from the outer query context
- Placed in `src/main/services/` (not `core/`) since it's SQL, not pure domain logic
- Template literal interpolation in both consumers — no change to query structure

## Test Execution Results

```
PASS src/main/services/list-positions.test.ts (10 tests)
PASS src/main/services/get-position.test.ts (6 tests)

16 passed, 0 failed

Full suite: 515 passed, 1 pre-existing failure (rolls.test.ts — Area 2 red phase)
```

## Quality Checks

- ✅ `pnpm test` — 515 pass, 0 regressions from Area 1 changes
- ✅ `pnpm lint` — 1 pre-existing prettier warning in `vitest.config.ts` (unrelated to Area 1)
- ✅ `pnpm typecheck` — 1 pre-existing error in `rolls.test.ts` (Area 2 red phase, not yet implemented)

## Known Limitations / Tech Debt

None for Area 1 — implementation is minimal and clean.

## Handoff to Refactor Phase

Refactor phase should:

1. Verify naming: `activeLegSubquery` clearly expresses "current open leg for a position"
2. Verify no inline SQL duplication remains in either consumer
3. Verify the function in `active-leg-sql.ts` is simple enough to not need a comment
4. Run `pnpm test && pnpm lint && pnpm typecheck`
