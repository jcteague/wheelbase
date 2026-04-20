# US-17 — Reject Roll in Invalid Phase — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- **This is a test-coverage story** — no new production code is expected. Green phases verify existing code already passes; if any test fails, fix the validation logic.

---

## Layer 1 — Unit & Integration Tests (no cross-area dependencies)

> These areas can be started immediately and run in parallel.

### Lifecycle Engine — Comprehensive Phase Rejection

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`
  - Add `describe('rollCsp — phase rejection')` with `it.each` over all 9 non-CSP_OPEN phases: `HOLDING_SHARES`, `CC_OPEN`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`
  - Each iteration: call `rollCsp({ currentPhase: phase, currentExpiration: isoDate(30), costToClose: '1.00', newPremium: '2.00', newExpiration: isoDate(60), newStrike: '180' })` and assert throws `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`, `message: 'Position is not in CSP_OPEN phase'`
  - Add `describe('rollCc — phase rejection')` with `it.each` over all 9 non-CC_OPEN phases: `CSP_OPEN`, `HOLDING_SHARES`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`
  - Each iteration: call `rollCc({ currentPhase: phase, ... })` and assert throws `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`, `message: 'No open covered call on this position'`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — new parameterized tests should pass immediately (existing logic handles this)
- [x] **[Green]** Verify all tests pass — `src/main/core/lifecycle.ts` _(depends on: Lifecycle Engine Red ✓)_
  - No new production code expected — `rollCsp` already checks `currentPhase !== 'CSP_OPEN'`, `rollCc` already calls `requireCcOpenPhase()`
  - If any phase unexpectedly passes validation, fix the guard in `src/main/core/lifecycle.ts`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.test.ts` _(depends on: Lifecycle Engine Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider removing the old single-phase rejection test for `rollCsp` (HOLDING_SHARES) if now redundant with `it.each`; same for `rollCc` (CSP_OPEN)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Service Layer — Phase Rejection Through DB

- [x] **[Red]** Write failing tests — `src/main/services/roll-csp-position.test.ts` and `src/main/services/roll-cc-position.test.ts`
  - In `roll-csp-position.test.ts`: add `describe('phase rejection')` with `it.each` over representative phases (`HOLDING_SHARES`, `CC_OPEN`, `WHEEL_COMPLETE`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`). Each test: create position in target phase via DB helpers, call `rollCspPosition(db, payload)`, assert `{ ok: false, errors: [{ field: '__phase__', code: 'invalid_phase' }] }`, assert position phase unchanged
  - In `roll-cc-position.test.ts`: same pattern with `it.each` over all non-CC_OPEN phases (`CSP_OPEN`, `HOLDING_SHARES`, `WHEEL_COMPLETE`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`). Assert rejection and unchanged phase
  - Add explicit test: `rollCspPosition rejects after CSP closed early` — create position, close CSP (→ `CSP_CLOSED_PROFIT`), attempt roll, assert rejection with message "Position is not in CSP_OPEN phase" and phase remains `CSP_CLOSED_PROFIT`
  - Run `pnpm test src/main/services/roll-csp-position.test.ts src/main/services/roll-cc-position.test.ts` — new tests should pass immediately
- [x] **[Green]** Verify all tests pass — `src/main/services/roll-csp-position.ts` and `src/main/services/roll-cc-position.ts` _(depends on: Service Layer Red ✓)_
  - No new production code expected — services already delegate to lifecycle engine for phase validation
  - If any test fails, investigate whether the service catches/swallows the `ValidationError` incorrectly
  - Run `pnpm test src/main/services/roll-csp-position.test.ts src/main/services/roll-cc-position.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/roll-csp-position.test.ts`, `src/main/services/roll-cc-position.test.ts` _(depends on: Service Layer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting a shared `createPositionInPhase(db, phase)` helper if setup is repetitive
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Renderer — Action Bar Button Visibility

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx`
  - Add `describe('roll button visibility across all phases')` with `it.each` over all 10 phases
  - For each phase: render `<PositionDetailActions phase={phase} .../>`, assert `roll-csp-btn` present only when `phase === 'CSP_OPEN'`, assert `roll-cc-btn` present only when `phase === 'CC_OPEN'`
  - Add test: `HOLDING_SHARES shows only phase-appropriate actions` — render with `HOLDING_SHARES`, assert no roll buttons, assert `open-covered-call-btn` visible
  - Add test: `terminal phases show no action buttons` — render with `CSP_CLOSED_PROFIT` and `WHEEL_COMPLETE`, assert no buttons rendered
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — new tests should pass immediately
- [x] **[Green]** Verify all tests pass — `src/renderer/src/components/PositionDetailActions.tsx` _(depends on: Renderer Red ✓)_
  - No new production code expected — component already implements phase-conditional rendering
  - If any test fails, fix the conditional logic in `PositionDetailActions.tsx`
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionDetailActions.test.tsx` _(depends on: Renderer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider removing old individual visibility tests now covered by `it.each`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — E2E Tests

> Requires all Layer 1 Green tasks complete (existing behavior verified at every unit/integration level).

### E2E Tests

**Requires:** Lifecycle Engine Green ✓, Service Layer Green ✓, Renderer Green ✓

- [x] **[Red]** Write failing e2e tests — `e2e/reject-roll-invalid-phase.spec.ts` _(depends on: all Layer 1 Green tasks ✓)_
  - Create new file following patterns from `e2e/csp-roll.spec.ts`: `launchFreshApp()` with temp DB, `openPosition`/`openDetailFor`/`selectDate` helpers, `afterEach` cleanup
  - One `it()` per AC — test names mirror AC language:
    - AC-1 (CSP roll rejected for non-CSP_OPEN): `it('rejects CSP roll when position is in HOLDING_SHARES phase')` — create CSP_OPEN position, record assignment (→ HOLDING_SHARES), open detail page, assert `roll-csp-btn` not visible
    - AC-2 (CC roll rejected for non-CC_OPEN): `it('rejects CC roll when position is in CSP_OPEN phase')` — create CSP_OPEN position, open detail page, assert `roll-cc-btn` not visible
    - AC-3 (Roll button hidden for non-rollable phase): `it('hides roll button and shows phase-appropriate actions for HOLDING_SHARES')` — create position, record assignment, open detail, assert no roll buttons, assert `open-covered-call-btn` visible
    - AC-4 (Roll CSP button visible for CSP_OPEN): `it('shows Roll CSP button and opens roll form for CSP_OPEN')` — create CSP_OPEN position, open detail, assert `roll-csp-btn` visible, click it, assert roll form sheet opens
    - AC-5 (Roll CC button visible for CC_OPEN): `it('shows Roll CC button and opens roll form for CC_OPEN')` — create CSP_OPEN, record assignment, open CC (→ CC_OPEN), open detail, assert `roll-cc-btn` visible, click it, assert roll form sheet opens
    - AC-6 (Roll rejected after CSP closed): `it('hides Roll CSP button after CSP has been closed early')` — create CSP_OPEN, expire CSP (→ CSP_EXPIRED), open detail, assert `roll-csp-btn` not visible
  - Run `pnpm test:e2e e2e/reject-roll-invalid-phase.spec.ts` — all new tests must fail (file doesn't exist yet, so they fail)
- [x] **[Green]** Make e2e tests pass — `e2e/reject-roll-invalid-phase.spec.ts` _(depends on: E2E Red ✓)_
  - Implement the test file with proper Electron launch, helper calls, and assertions
  - Use `data-testid` selectors: `roll-csp-btn`, `roll-cc-btn`, `open-covered-call-btn`
  - Use existing e2e helpers: `openPosition`, `openDetailFor`, `selectDate` from `e2e/helpers.ts`
  - For reaching HOLDING_SHARES: use record-assignment flow from existing e2e patterns
  - For reaching CC_OPEN: use assignment → open CC flow
  - For reaching CSP_EXPIRED: use expire CSP flow
  - Run `pnpm test:e2e e2e/reject-roll-invalid-phase.spec.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/reject-roll-invalid-phase.spec.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `reachPhase(page, targetPhase)` helper if setup is repetitive
  - Run `pnpm test:e2e e2e/reject-roll-invalid-phase.spec.ts`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and verified)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (6 ACs → 6 e2e tests)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
