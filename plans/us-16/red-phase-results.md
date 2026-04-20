# Red Phase Results: US-16 — Layer 4 (Cost Basis Snapshot Chain)

## Feature Context

- **Feature directory**: `plans/us-16/`
- **Plan file**: `plans/us-16/plan.md`
- **Tasks file**: `plans/us-16/tasks.md`

## Test Files Created

- `src/main/services/cost-basis-chain.test.ts` — full lifecycle snapshot chain integration tests

## Interfaces Under Test

```typescript
// All services used in the lifecycle builder — already implemented in Layers 1–3

// src/main/services/positions.ts
export function createPosition(db, payload): { position: PositionRecord, ... }

// src/main/services/roll-csp-position.ts
export function rollCspPosition(db, positionId, payload): RollCspResult

// src/main/services/assign-csp-position.ts
export function assignCspPosition(db, positionId, payload): AssignCspPositionResult

// src/main/services/open-covered-call-position.ts
export function openCoveredCallPosition(db, positionId, payload): OpenCcPositionResult

// src/main/services/roll-cc-position.ts
export function rollCcPosition(db, positionId, payload): RollCcResult

// DB table: cost_basis_snapshots (basis_per_share, total_premium_collected, snapshot_at)
```

## Test Coverage Summary

### Integration Tests (src/main/services/cost-basis-chain.test.ts)

- [x] Full 6-step lifecycle creates exactly 6 snapshots
- [x] All snapshots have non-null basis_per_share and total_premium_collected
- [x] Snapshots are ordered chronologically by snapshot_at ASC
- [x] Snapshot 1 (CSP open): basis $48.00, total $200.00
- [x] Snapshot 2 (same-strike roll, net credit $0.70): basis $47.30, total $270.00
- [x] Snapshot 3 (roll-down $50→$47, net credit $0.30): basis $44.00, total $300.00
- [x] Snapshot 4 (assignment at $47): basis $44.00, total $300.00
- [x] Snapshot 5 (CC open $1.50): basis $42.50, total $450.00
- [x] Snapshot 6 (CC roll-up to $52, net credit $0.80, strike delta ignored): basis $41.70, total $530.00

## Test Design Assumptions

- Snapshot 3 basis is $44.00 (NOT $44.70) because the roll-down starts from $47.30 (after prior same-strike roll), not $48.00. The quickstart Key Numbers table lists independent scenarios; in the chain, the roll-down happens after a prior same-strike roll.
- Snapshot 4 (assignment) basis matches Snapshot 3 ($44.00) because `calculateAssignmentBasis` recomputes from scratch: strike $47 − CSP $2.00 − Roll #1 net $0.70 − Roll #2 net $0.30 = $44.00.
- CC roll-up to $52: no strike delta applied (CC formula only uses net credit).

## Test Execution Results

```bash
pnpm test src/main/services/cost-basis-chain.test.ts

 ✓ src/main/services/cost-basis-chain.test.ts (2 tests) 18ms

 Test Files  1 passed (1)
       Tests  2 passed (2)
```

## Verification

- ✅ Tests pass immediately — expected because all production code (Layers 1–3) is already implemented
- ✅ No syntax errors in test files
- ✅ No fixture or import errors
- ✅ Confirmed: basis values at each step are mathematically correct (see Test Design Assumptions)
