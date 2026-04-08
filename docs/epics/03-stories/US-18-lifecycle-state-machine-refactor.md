# US-18: Extract lifecycle engine into declarative state machine

**As a** developer extending the wheel lifecycle with new events (roll CC, PMCC),
**I want** the valid phase transitions defined in a single declarative table,
**So that** I can understand the full state graph at a glance, add new transitions in one place, and eliminate scattered phase-check boilerplate.

---

## Context

`src/main/core/lifecycle.ts` currently has 8 functions, each beginning with `if (currentPhase !== 'X') throw ValidationError(...)`. To understand which events are valid from a given phase, you must read all 8 functions and mentally reconstruct the graph. This gets worse as events are added (US-14 adds roll CC, PMCC adds 4+ more).

A declarative transition table makes the lifecycle readable in ~10 lines:

```
OPEN_WHEEL:  → CSP_OPEN
CLOSE_CSP:   CSP_OPEN → CSP_CLOSED_*
EXPIRE_CSP:  CSP_OPEN → WHEEL_COMPLETE
ASSIGN_CSP:  CSP_OPEN → HOLDING_SHARES
ROLL_CSP:    CSP_OPEN → CSP_OPEN
OPEN_CC:     HOLDING_SHARES → CC_OPEN
CLOSE_CC:    CC_OPEN → HOLDING_SHARES
EXPIRE_CC:   CC_OPEN → HOLDING_SHARES
CALL_AWAY:   CC_OPEN → WHEEL_COMPLETE
ROLL_CC:     CC_OPEN → CC_OPEN          (US-14, not yet)
```

The existing functions become pure guard/validator functions that validate payloads but no longer check phases. The transition table becomes the single source of truth.

This is a zero-behavior-change refactor. Every existing test must pass without modification. No new features, no new UI.

---

## Acceptance Criteria

```gherkin
Scenario: Transition table defines all valid phase transitions
  Given the WHEEL_TRANSITIONS table in lifecycle.ts
  Then it contains entries for every event: OPEN_WHEEL, CLOSE_CSP, EXPIRE_CSP, ASSIGN_CSP, ROLL_CSP, OPEN_CC, CLOSE_CC, EXPIRE_CC, CALL_AWAY
  And each entry specifies a from-phase and a to-phase
  And ROLL_CSP maps CSP_OPEN → CSP_OPEN (self-transition)

Scenario: transition() function rejects invalid phase for event
  Given a position in phase HOLDING_SHARES
  When the transition function is called with event CLOSE_CSP
  Then it throws a ValidationError with field "__phase__" and code "invalid_phase"

Scenario: transition() function returns next phase for valid event
  Given a position in phase CSP_OPEN
  When the transition function is called with event ASSIGN_CSP
  Then it returns "HOLDING_SHARES"

Scenario: Guard functions validate payloads without checking phase
  Given the closeCsp guard function
  When called with a valid payload
  Then it validates closePricePerContract, date ordering, and computes profit/loss
  And it does NOT check currentPhase (that responsibility moved to transition())

Scenario: All existing lifecycle tests pass unchanged
  Given the full test suite in lifecycle.test.ts
  When tests are run after the refactor
  Then every existing test passes without modification

Scenario: availableEvents() returns valid events for a given phase
  Given a position in phase CC_OPEN
  When availableEvents("CC_OPEN") is called
  Then it returns ["CLOSE_CC", "EXPIRE_CC", "CALL_AWAY", "ROLL_CC"] or the subset currently defined

Scenario: Adding a new event requires only a table entry and a guard function
  Given the transition table structure
  When a developer adds a new event (e.g., ROLL_CC for US-14)
  Then they add one row to WHEEL_TRANSITIONS and one guard function
  And no other functions need phase-check modifications
```

---

## Technical Notes

- **No external libraries.** A plain `Map<string, { from: WheelPhase | WheelPhase[]; to: WheelPhase }>` or equivalent object literal is sufficient. No XState or other state machine library needed.
- **Three-layer separation:**
  1. `transition(currentPhase, event)` — looks up the table, throws if invalid, returns next phase
  2. `guards[event](input)` — validates payload fields (positive amounts, date ordering, etc.), returns computed results (e.g., profit/loss for close CSP)
  3. Public API functions (`closeCsp`, `rollCsp`, etc.) call `transition()` then the guard, combining both results. Existing call sites don't change.
- **`availableEvents(phase)`** — utility that returns all events valid from a given phase. Useful for renderer button enablement (future) and for testing completeness.
- **closeCsp special case** — the target phase depends on P&L (CSP_CLOSED_PROFIT vs CSP_CLOSED_LOSS). Handle with a `computeTarget` function in the transition entry, or compute it in the guard and let the public function use it. Keep the transition table simple.
- **PMCC readiness** — a second `PMCC_TRANSITIONS` table with different valid moves can be added later using the same `transition()` engine. This is out of scope but the design should not prevent it.
- **File stays in `src/main/core/`** — no DB, no broker imports. Pure functions only.

---

## Out of Scope

- PMCC transition table (future story)
- Renderer using `availableEvents()` for button enablement (future story)
- US-14 roll CC transition (added when US-14 is implemented)
- Event sourcing or undo/replay
- Changing any existing public function signatures — call sites must not change

---

## Dependencies

- US-12: Roll out infrastructure (adds `rollCsp` function to lifecycle.ts)

---

## Estimate

3 points
