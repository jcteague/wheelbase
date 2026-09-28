---
page: docs/spec/features/us-17-reject-roll-invalid-phase.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/features/us-17-reject-roll-invalid-phase.md

## Verified (13)

- ✓ All cited source files exist: `src/main/core/lifecycle.ts`, `src/main/core/types.ts`, `src/main/services/roll-csp-position.ts`, `src/main/services/roll-cc-position.ts`, `src/renderer/src/components/PositionDetailActions.tsx`, `e2e/reject-roll-invalid-phase.spec.ts`
- ✓ `rollCsp` rejects phase ≠ `CSP_OPEN` with `('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')` — `src/main/core/lifecycle.ts:365-368`
- ✓ `rollCc` rejects phase ≠ `CC_OPEN` via `requireCcOpenPhase` with `'No open covered call on this position'` — `lifecycle.ts:33,54-58,398-399`
- ✓ `WheelPhase` has exactly 10 values (so 9 non-rollable per roll type) — `src/main/core/types.ts:7-18`
- ✓ `lifecycle.test.ts` parameterized phase rejection — `it.each` at `src/main/core/lifecycle.test.ts:787` (rollCsp, 9 phases) and `:927` (rollCc)
- ✓ Service `it.each` tests — `roll-csp-position.test.ts:311`, `roll-cc-position.test.ts:300`
- ✓ `PositionDetailActions.test.tsx` `it.each(ALL_PHASES)` roll-csp / roll-cc visibility — `:109,118`
- ✓ "Roll CSP →" only in `CSP_OPEN` — `PositionDetailActions.tsx:82-84`; "Roll CC →" only in `CC_OPEN` — `:53-55`
- ✓ IPC handlers `positions:roll-csp` / `positions:roll-cc` registered — `src/main/ipc/positions.ts:130,138`
- ✓ e2e asserts button absence and phase rejection — `e2e/reject-roll-invalid-phase.spec.ts:52,64,85,102,126,140`
- ✓ Closed-CSP case covered: "hides Roll CSP button after CSP has been expired" — `reject-roll-invalid-phase.spec.ts:140`
- ✓ Linked pages exist: `domain/wheel-lifecycle.md`, `contracts/ipc-handlers.md`, `us-12-roll-csp.md`, `us-14-roll-cc.md`
- ✓ No schema changes — consistent

## Drift (0)

None.

## Unverifiable (2)

- ? "No new production code" — historical claim about the story's diff; not checkable from current tree.
- ? Service-layer tests verify the IPC envelope "unchanged" `{ ok:false, errors:[{field:'__phase__', code:'invalid_phase', message}] }` — tests exist at the cited lines, exact assertions not re-read.

## Missing files (0)

None.
