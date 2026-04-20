# Implementation Plan: US-17 — Reject Roll in Invalid Phase

## Summary

Ensure comprehensive test coverage for roll rejection when a position is not in a rollable phase. The lifecycle engine, service layer, and renderer action bar already implement the correct behavior (from US-12/US-14). This story adds parameterized tests at the core, service, and component layers covering all 10 phases, plus AC-driven e2e tests. No new production code is expected — this is a test-coverage story.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-17-reject-roll-invalid-phase.md`
- **Research & Design Decisions:** `plans/us-17/research.md`
- **Data Model & Phase Matrix:** `plans/us-17/data-model.md`
- **Quickstart & Verification:** `plans/us-17/quickstart.md`

## Prerequisites

- US-12 (CSP roll lifecycle) and US-14 (CC roll lifecycle) are complete
- `rollCsp` and `rollCc` functions exist in `src/main/core/lifecycle.ts`
- `rollCspPosition` and `rollCcPosition` services exist in `src/main/services/`
- `PositionDetailActions` component exists with phase-conditional rendering
- IPC handlers `positions:roll-csp` and `positions:roll-cc` exist

## Implementation Areas

### 1. Lifecycle Engine — Comprehensive Phase Rejection Tests

**Files to create or modify:**

- `src/main/core/lifecycle.test.ts` — add parameterized test blocks for `rollCsp` and `rollCc` phase rejection

**Red — tests to write:**

- `rollCsp rejects for each non-CSP_OPEN phase`: Table-driven test using `it.each` over all 9 non-rollable phases (`HOLDING_SHARES`, `CC_OPEN`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`). Each iteration calls `rollCsp({ currentPhase: phase, ... })` and asserts it throws `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`, `message: 'Position is not in CSP_OPEN phase'`. Assert the existing single-phase test for `HOLDING_SHARES` still passes alongside the new comprehensive coverage.
- `rollCc rejects for each non-CC_OPEN phase`: Table-driven test using `it.each` over all 9 non-rollable phases (`CSP_OPEN`, `HOLDING_SHARES`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`). Each iteration calls `rollCc({ currentPhase: phase, ... })` and asserts it throws `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`, `message: 'No open covered call on this position'`.

**Green — implementation:**

- No new production code expected. The `rollCsp` function in `src/main/core/lifecycle.ts` already checks `currentPhase !== 'CSP_OPEN'` and throws. The `rollCc` function already calls `requireCcOpenPhase(currentPhase)` which checks `currentPhase === 'CC_OPEN'`. If any test unexpectedly fails, fix the validation logic.

**Refactor — cleanup to consider:**

- Remove the existing single-phase rejection test for `rollCsp` (HOLDING_SHARES only) if it's now redundant with the parameterized test. Same for `rollCc` (CSP_OPEN only).
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "CSP roll rejected for non-CSP_OPEN phases" (all 9 phases)
- "CC roll rejected for non-CC_OPEN phases" (all 9 phases)

---

### 2. Service Layer — Phase Rejection Through DB Integration

**Files to create or modify:**

- `src/main/services/roll-csp-position.test.ts` — add parameterized phase rejection tests
- `src/main/services/roll-cc-position.test.ts` — add parameterized phase rejection tests

**Red — tests to write:**

- `rollCspPosition rejects for each non-CSP_OPEN phase`: Table-driven test using `it.each` over representative non-rollable phases (at minimum: `HOLDING_SHARES`, `CC_OPEN`, `WHEEL_COMPLETE`; ideally all 9). Each test creates a position in the target phase (using DB setup helpers), attempts `rollCspPosition(db, payload)`, and asserts the result is `{ ok: false, errors: [{ field: '__phase__', code: 'invalid_phase' }] }`. Assert position phase is unchanged after rejection.
- `rollCcPosition rejects for each non-CC_OPEN phase`: Same pattern — create a position in each non-CC_OPEN phase, attempt `rollCcPosition(db, payload)`, assert rejection error and unchanged phase.
- `rollCspPosition rejects after CSP closed early`: Create a position, close the CSP (moving to `CSP_CLOSED_PROFIT`), then attempt CSP roll. Assert rejection with message "Position is not in CSP_OPEN phase" and phase remains `CSP_CLOSED_PROFIT`.

**Green — implementation:**

- No new production code expected. The service functions (`rollCspPosition` in `src/main/services/roll-csp-position.ts`, `rollCcPosition` in `src/main/services/roll-cc-position.ts`) already call the lifecycle engine which validates phase. If any test unexpectedly fails, investigate and fix.

**Refactor — cleanup to consider:**

- Extract a shared helper to create a position in an arbitrary phase if test setup is repetitive across files.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "CSP roll rejected for non-CSP_OPEN phases" (service layer)
- "CC roll rejected for non-CC_OPEN phases" (service layer)
- "Roll rejected after CSP has already been closed"

---

### 3. Renderer — Action Bar Button Visibility Tests

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.test.tsx` — expand phase coverage for roll button visibility

**Red — tests to write:**

- `Roll CSP button visible only in CSP_OPEN phase`: Table-driven test rendering `PositionDetailActions` with each of the 10 phases. Assert "Roll CSP →" button (test ID `roll-csp-btn`) is present only when `phase === 'CSP_OPEN'` and absent for all other 9 phases.
- `Roll CC button visible only in CC_OPEN phase`: Same pattern — assert "Roll CC →" button (test ID `roll-cc-btn`) is present only when `phase === 'CC_OPEN'` and absent for all other 9 phases.
- `HOLDING_SHARES shows only phase-appropriate actions`: Render with `phase='HOLDING_SHARES'`. Assert no roll buttons are visible. Assert "Open Covered Call →" button is visible (test ID `open-covered-call-btn`).
- `Terminal phases show no action buttons`: Render with `phase='CSP_CLOSED_PROFIT'` and `phase='WHEEL_COMPLETE'`. Assert no buttons are rendered in the action bar.

**Green — implementation:**

- No new production code expected. `PositionDetailActions` in `src/renderer/src/components/PositionDetailActions.tsx` already implements conditional rendering based on phase. The mockup confirms the existing behavior matches: roll buttons appear only for `CSP_OPEN` and `CC_OPEN`, with gold-highlighted styling and "→" suffix. `HOLDING_SHARES` shows "Sell Covered Call →" as a primary button. Terminal phases show "No actions available" text.

**Refactor — cleanup to consider:**

- Remove redundant individual visibility tests if now covered by the parameterized tests.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "Roll button hidden on position card for non-rollable phases"
- "Roll button visible and enabled for CSP_OPEN"
- "Roll button visible and enabled for CC_OPEN"

---

### 4. E2E Tests

**Files to create or modify:**

- `e2e/reject-roll-invalid-phase.spec.ts` — new e2e test file for US-17

**Red — tests to write:**

Each test maps to one AC from the user story. Use the existing e2e patterns from `e2e/csp-roll.spec.ts`: `launchFreshApp()` with temp DB, `openPosition` helper, and `afterEach` cleanup.

- `CSP roll rejected for non-CSP_OPEN phase (HOLDING_SHARES)`: Create a CSP_OPEN position, record assignment (moving to HOLDING_SHARES), navigate to detail page. Assert no "Roll CSP" button is visible. Attempt CSP roll via IPC (if testing programmatic rejection) or verify button absence covers the AC.
- `CC roll rejected for non-CC_OPEN phase (CSP_OPEN)`: Create a CSP_OPEN position, navigate to detail page. Assert no "Roll CC" button is visible.
- `Roll button hidden for non-rollable phase (HOLDING_SHARES)`: Create position, record assignment. On detail page, assert no "Roll" button exists. Assert "Sell Covered Call" (or "Open Covered Call") button is the available action.
- `Roll CSP button visible and enabled for CSP_OPEN`: Create a CSP_OPEN position, navigate to detail page. Assert "Roll CSP" button is visible. Click it and assert the roll form sheet opens.
- `Roll CC button visible and enabled for CC_OPEN`: Create a CSP_OPEN position, record assignment, open covered call (reaching CC_OPEN). Navigate to detail page. Assert "Roll CC" button is visible. Click it and assert the roll form sheet opens.
- `Roll rejected after CSP already closed`: Create a CSP_OPEN position, close the CSP early (or expire it, reaching CSP_CLOSED_PROFIT or CSP_EXPIRED). Navigate to detail page. Assert no "Roll CSP" button is visible, confirming the roll is prevented at the UI level.

**Green — implementation:**

- Create `e2e/reject-roll-invalid-phase.spec.ts` following the established patterns:
  - Import `electron`, `vitest` (`describe`, `it`, `expect`, `afterEach`), and helpers from `e2e/helpers.ts`
  - Use `launchFreshApp()` pattern with temp DB path and `WHEELBASE_DB_PATH` env var
  - Use `openPosition` helper to create positions
  - Use existing action helpers (record assignment, open CC, close CSP) to navigate to target phases
  - Assert button presence/absence using `data-testid` attributes (`roll-csp-btn`, `roll-cc-btn`, `open-covered-call-btn`)
  - Assert roll form sheet opens when roll button is clicked (look for the sheet component's test ID or heading)

**Refactor — cleanup to consider:**

- Extract a `reachPhase(page, targetPhase)` helper if the setup to reach different phases is repetitive.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC1: "CSP roll rejected for non-CSP_OPEN phases" → `CSP roll rejected for non-CSP_OPEN phase (HOLDING_SHARES)`
- AC2: "CC roll rejected for non-CC_OPEN phases" → `CC roll rejected for non-CC_OPEN phase (CSP_OPEN)`
- AC3: "Roll button hidden on position card for non-rollable phases" → `Roll button hidden for non-rollable phase (HOLDING_SHARES)`
- AC4: "Roll button visible and enabled for CSP_OPEN" → `Roll CSP button visible and enabled for CSP_OPEN`
- AC5: "Roll button visible and enabled for CC_OPEN" → `Roll CC button visible and enabled for CC_OPEN`
- AC6: "Roll rejected after CSP has already been closed" → `Roll rejected after CSP already closed`
