# US-17: Reject a roll when the position is not in a rollable phase

**As a** wheel trader,
**I want** the app to prevent me from rolling a position that isn't in a rollable state,
**So that** I don't accidentally create invalid transactions on expired, assigned, or completed positions.

---

## Context

Only two phases are rollable: `CSP_OPEN` (roll the put) and `CC_OPEN` (roll the call). All other phases — `HOLDING_SHARES`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE` — must reject roll attempts. This validation happens at three levels: the lifecycle engine (core logic), the service layer (before DB writes), and the UI (hide/disable the roll button when not applicable).

---

## Acceptance Criteria

```gherkin
Scenario Outline: CSP roll rejected for non-CSP_OPEN phases
  Given the position is in phase "<phase>"
  When the trader attempts to roll the CSP
  Then the roll is rejected with error field "__phase__", code "invalid_phase", and message "Position is not in CSP_OPEN phase"
  And the position remains in phase "<phase>"

  Examples:
    | phase              |
    | HOLDING_SHARES     |
    | CC_OPEN            |
    | CSP_EXPIRED        |
    | CSP_CLOSED_PROFIT  |
    | CSP_CLOSED_LOSS    |
    | CC_EXPIRED         |
    | CC_CLOSED_PROFIT   |
    | CC_CLOSED_LOSS     |
    | WHEEL_COMPLETE     |

Scenario Outline: CC roll rejected for non-CC_OPEN phases
  Given the position is in phase "<phase>"
  When the trader attempts to roll the CC
  Then the roll is rejected with error field "__phase__", code "invalid_phase", and message "No open covered call on this position"
  And the position remains in phase "<phase>"

  Examples:
    | phase              |
    | CSP_OPEN           |
    | HOLDING_SHARES     |
    | CSP_EXPIRED        |
    | CSP_CLOSED_PROFIT  |
    | CSP_CLOSED_LOSS    |
    | CC_EXPIRED         |
    | CC_CLOSED_PROFIT   |
    | CC_CLOSED_LOSS     |
    | WHEEL_COMPLETE     |

Scenario: Roll button hidden on position card for non-rollable phases
  Given the position is in phase HOLDING_SHARES
  When the trader views the position detail page
  Then no "Roll" button is visible in the action bar
  And the available actions show only phase-appropriate options (e.g., "Sell Covered Call")

Scenario: Roll button visible and enabled for CSP_OPEN
  Given the position is in phase CSP_OPEN
  When the trader views the position detail page
  Then a "Roll CSP" button is visible in the action bar
  And clicking it opens the roll form

Scenario: Roll button visible and enabled for CC_OPEN
  Given the position is in phase CC_OPEN
  When the trader views the position detail page
  Then a "Roll CC" button is visible in the action bar
  And clicking it opens the roll form

Scenario: Roll rejected after CSP has already been closed
  Given the position was in CSP_OPEN but the CSP was closed early (phase: CSP_CLOSED_PROFIT)
  When a CSP roll is attempted
  Then the roll is rejected with message "Position is not in CSP_OPEN phase"
  And the position remains in phase CSP_CLOSED_PROFIT
```

---

## Technical Notes

- **Lifecycle engine:** Both `rollCsp` and `rollCc` (from US-12/14) validate the current phase as their first check. This story ensures comprehensive test coverage for all non-rollable phases, not new implementation. Note: `rollCsp` checks `currentPhase !== 'CSP_OPEN'` and `rollCc` uses `requireCcOpenPhase(currentPhase)` — they produce different error messages.
- **IPC layer:** The error response follows existing pattern: `{ ok: false, errors: [{ field: '__phase__', code: 'invalid_phase', message: '...' }] }`.
- **Renderer:** Conditionally render the roll button based on `position.phase`. Use the same action-bar pattern as existing buttons (Close CSP, Record Assignment, etc.).
- **Phase-to-actions mapping:** Extend the existing phase-action mapping in the renderer to include roll actions:
  - `CSP_OPEN` → [Close CSP, Expire CSP, Record Assignment, **Roll CSP**]
  - `CC_OPEN` → [Close CC, Expire CC, Record Call Away, **Roll CC**]
  - All other phases → no roll action

---

## Out of Scope

- Custom error pages or detailed error modals (standard toast/inline error is sufficient)
- Roll permissions or user-level restrictions
- Disabling rolls based on DTE or other thresholds (potential Epic 07 feature)

---

## Dependencies

- US-12: CSP roll lifecycle function (provides the validation being tested)
- US-14: CC roll lifecycle function (same)

---

## Estimate

2 points
