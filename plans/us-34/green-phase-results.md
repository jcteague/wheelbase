# Green Phase Results: PositionCockpit (Area 9)

## Feature Context

- **Feature directory**: `plans/us-34/`
- **Plan file**: `plans/us-34/plan.md`
- **Red phase results**: `plans/us-34/red-phase-results.md`

## Implementation Files Created

- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — top-level cockpit orchestrator

## Public Interfaces Implemented

```typescript
export function PositionCockpit({
  detail,
  snapshot,
  underlyingPrice,
  ivRank
}: PositionCockpitProps): React.JSX.Element
```

## Implementation Summary

### Approach

Implemented the minimum orchestrator that:

1. Guards on `!activeLeg` → renders no-active-leg branch (SHARES_VERDICT + defaultOpen cost-basis drawer)
2. Active-leg branch: builds `CockpitInput`, computes verdict/pnl/dist, renders cockpit stack
3. Applied corrections from plan: `iv: parseFloat(snapshot.greeks.iv)`, `underlying` from prop, instrument as `'PUT'|'CALL'`

### Key Design Decisions

- `instrument = phase === 'CC_OPEN' ? 'CALL' : 'PUT'` — matches `OptionInstrumentType` union
- `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` computed once at top of active-leg branch
- `LegHistoryTable` only rendered when `enrichedLegs.length > 0` inside the collapsed cost-basis drawer

## Test Execution Results

```
✓ renderer src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx (12 tests) 217ms

Test Files  1 passed (1)
      Tests  12 passed (12)
```

Full suite: 100 test files, 1146 tests — all passed.

## Quality Checks

- ✅ `pnpm test` passed (1146 tests)
- ✅ `pnpm lint` passed (0 errors)
- ✅ `pnpm typecheck` passed
- ✅ `pnpm format` applied (prettier cleaned spec file and component)

## Known Limitations / Tech Debt

None introduced — implementation is a straightforward composition of Layer 1 & 2 components.

## Handoff to Refactor Phase

Refactor phase should:

1. Confirm `asFallbackInput` helper is appropriately placed as a local function
2. Run `pnpm test && pnpm lint && pnpm typecheck` to confirm baseline is green
3. No structural issues identified — refactor is expected to be minimal
