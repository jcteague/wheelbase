# US-17: Reject roll attempts from invalid phases

<!-- generated:from us-17 -->

## Summary

Locks in comprehensive test coverage proving that a CSP or CC roll is rejected — at every layer — whenever the position is not in the corresponding rollable phase. The lifecycle engine, IPC services, and renderer action bar already enforced this behaviour as a side effect of US-12 and US-14; US-17 ships no new production code and instead adds parameterized (`it.each`) tests across all 9 non-rollable phases per roll type, plus AC-driven e2e specs, so the AC is provably covered rather than incidentally true.

## Acceptance criteria

- CSP roll is rejected for all 9 non-`CSP_OPEN` phases: `HOLDING_SHARES`, `CC_OPEN`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`.
- CC roll is rejected for all 9 non-`CC_OPEN` phases: `CSP_OPEN`, `HOLDING_SHARES`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`.
- The roll button is hidden on the position card / detail action bar for every non-rollable phase.
- "Roll CSP" is visible and enabled only for `CSP_OPEN`.
- "Roll CC" is visible and enabled only for `CC_OPEN`.
- Once a CSP has already been closed (e.g. phase `CSP_CLOSED_PROFIT` or `CSP_EXPIRED`), no Roll CSP button is shown and a roll attempt against the same position is rejected.

## What was built

No new production code. The existing guards in `src/main/core/lifecycle.ts` — `rollCsp` rejecting any phase ≠ `CSP_OPEN`, `rollCc` rejecting any phase ≠ `CC_OPEN` — already return the `ValidationError` shape that the service wrappers (`roll-csp-position.ts`, `roll-cc-position.ts`) propagate through IPC as `{ ok: false, errors: [...] }`. The renderer's `PositionDetailActions` component already maps phase → visible actions such that the Roll CSP / Roll CC buttons only render in their respective rollable phases.

What ships is the test matrix that proves the AC across the stack:

- `lifecycle.test.ts` — parameterized `it.each` tables exercising `rollCsp` and `rollCc` for every non-rollable phase value, asserting the exact `ValidationError` shape and message per function.
- `roll-csp-position.test.ts` / `roll-cc-position.test.ts` — service-layer parameterized tests that build a position fixture in each non-rollable phase and verify the IPC envelope `{ ok: false, errors: [{ field: '__phase__', code: 'invalid_phase', message }] }` comes back unchanged.
- `PositionDetailActions.test.tsx` — `it.each` over phase values asserting Roll CSP / Roll CC button visibility, and consolidating older one-off visibility tests where the parameterized cases now cover them.
- `e2e/reject-roll-invalid-phase.spec.ts` — Playwright specs that walk a position through phase transitions and assert the user-visible proof: the relevant Roll button is absent.

## Architecture decisions

- US-17 adds no production code; existing `rollCsp` / `rollCc` phase guards in the lifecycle engine, plus the existing service wrappers and `PositionDetailActions` mapping, already satisfy the AC. The story is scoped as test-coverage hardening → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- All non-rollable phases are tested with `it.each` parameterized tables rather than one `it()` per phase, both to prove exhaustive AC coverage and to keep the test surface compact when phases are added later → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Phase-rejection error shape is fixed: `{ field: '__phase__', code: 'invalid_phase', message }`, with per-function messages (`"Position is not in CSP_OPEN phase"` for `rollCsp`, `"No open covered call on this position"` for `rollCc`). Service and IPC layers pass it through unchanged → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- The existing `PositionDetailActions` phase-to-action mapping is retained as-is — "Roll CSP →" renders only in `CSP_OPEN`, "Roll CC →" only in `CC_OPEN`, and both are absent in every other phase.
- E2E specs assert button absence (the user-visible proof of rejection) rather than always exercising IPC rejection directly, because preventing the action in the UI is the AC; service-layer tests already cover the rejection envelope.

## Contracts touched

- `rollCsp` / `rollCc` lifecycle guards return `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`, function-specific `message` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `positions:roll-csp` IPC handler — phase-rejection envelope unchanged from US-12 → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md), [./us-12-roll-csp.md](./us-12-roll-csp.md)
- `positions:roll-cc` IPC handler — phase-rejection envelope unchanged from US-14 → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md), [./us-14-roll-cc.md](./us-14-roll-cc.md)
- No schema changes; the `WheelPhase` enum is referenced only as a test parameter matrix.

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/types.ts`
- `src/main/services/roll-csp-position.ts`
- `src/main/services/roll-cc-position.ts`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `e2e/reject-roll-invalid-phase.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
