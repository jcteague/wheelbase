---
page: docs/spec/features/us-17-reject-roll-invalid-phase.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-17-reject-roll-invalid-phase.md

## Verified (12)

- ✓ All 6 cited source files exist (Glob): `src/main/core/lifecycle.ts`,
  `src/main/core/types.ts`, `src/main/services/roll-csp-position.ts`,
  `roll-cc-position.ts`, `src/renderer/src/components/PositionDetailActions.tsx`,
  `e2e/reject-roll-invalid-phase.spec.ts`.
- ✓ "No new production code" claim holds for the guards: `rollCsp` rejects
  non-`CSP_OPEN` (`lifecycle.ts:367`), `rollCc` rejects non-`CC_OPEN` (`:305`).
- ✓ Phase-rejection error shape `{ field: '__phase__', code: 'invalid_phase', message }`
  confirmed at `lifecycle.ts:367` (rollCsp) and `:305` (rollCc).
- ✓ Per-function messages match exactly: `"Position is not in CSP_OPEN phase"`
  for rollCsp (`lifecycle.ts:367`) and `"No open covered call on this position"`
  for rollCc (`:305`, via `NO_OPEN_COVERED_CALL_MESSAGE` const at `:33`).
- ✓ `lifecycle.test.ts` has parameterized `it.each` 9-phase matrices for rollCsp
  (`:787-799`, exactly the 9 non-`CSP_OPEN` phases the AC lists) and rollCc
  (`:927`), asserting `field === '__phase__'` and `code === 'invalid_phase'`.
- ✓ Service tests use `it.each` over non-rollable phases:
  `roll-csp-position.test.ts:311` and `roll-cc-position.test.ts` (7 it.each blocks),
  verifying the IPC-side rejection per phase.
- ✓ `PositionDetailActions.test.tsx` uses `it.each(ALL_PHASES)` asserting
  `roll-csp-btn` visible only when `CSP_OPEN` (`:109`) and `roll-cc-btn` visible
  only when `CC_OPEN` (`:118`), plus `it.each(TERMINAL_PHASES)` for no-buttons (`:146`).
- ✓ `PositionDetailActions.tsx` renders "Roll CSP →" only in `phase === 'CSP_OPEN'`
  (`:82-84`) and "Roll CC →" only in `phase === 'CC_OPEN'` (`:53-55`).
- ✓ Service wrappers `roll-csp-position.ts` / `roll-cc-position.ts` exist and
  propagate the lifecycle `ValidationError` through IPC.
- ✓ `WheelPhase` enum referenced via `src/main/core/types.ts` (exists).
- ✓ E2E spec `e2e/reject-roll-invalid-phase.spec.ts` exists (Glob).
- ✓ All `../` and `./` links resolve: `domain/wheel-lifecycle.md`,
  `contracts/ipc-handlers.md`, `./us-12-roll-csp.md`, `./us-14-roll-cc.md`.

## Drift (0)

## Unverifiable (0)

## Missing files (0)

Summary: page is fully accurate — guards, error shapes, messages, and the
`it.each` test matrices across all three layers are present as documented.
