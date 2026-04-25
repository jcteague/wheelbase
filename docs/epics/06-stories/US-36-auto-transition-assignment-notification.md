# US-36: Auto-transition position to HOLDING_SHARES on detected assignment with notification

**As a** wheel trader whose CSP was just assigned,
**I want the** app to notify me of the detected assignment and transition the position automatically,
**So that** I can immediately start planning my next covered call without manual data entry.

---

## Context

US-35 detects assignments by polling the broker and creates `pending_assignment` records. This story is the user-facing half: surfacing those detections as notifications, letting the trader confirm or dismiss, and executing the lifecycle transition. The transition reuses the existing `assignCspPosition` service — the same logic as the manual assignment flow, but triggered by broker detection instead of user action.

The trader should have the option to confirm (accept the auto-transition) or dismiss (if the detection was a false match or they want to handle it manually). Once confirmed, the position moves to HOLDING_SHARES with a prompt to open a covered call — identical to the manual assignment flow.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL at the $180 strike
  And the assignment detection job (US-35) has created a pending assignment:
    | position_id | activity_id | transaction_time     |
    | pos_abc     | act_123     | 2026-04-19T08:00:00Z |

Scenario: Assignment notification banner appears on the position list
  When the trader opens the app or navigates to the position list
  Then a notification banner appears at the top of the page:
    "Assignment detected: AAPL $180 PUT was assigned on Apr 19. Confirm to update position."
  And the banner has "Confirm" and "Dismiss" buttons
  And the AAPL position row has a pulsing amber indicator

Scenario: Confirming the assignment transitions the position
  When the trader clicks "Confirm" on the assignment notification
  Then the position transitions from CSP_OPEN to HOLDING_SHARES
  And the assignment date is set to "2026-04-19" (from the broker activity)
  And a new ASSIGN leg is created with the correct strike and date
  And the cost basis snapshot recalculates
  And the notification banner disappears
  And a success toast appears: "AAPL assigned — now holding 100 shares at $180 strike"

Scenario: After confirming, trader is prompted to open a covered call
  Given the assignment was just confirmed
  When the success toast appears
  Then it includes a link: "Open covered call →"
  And clicking the link navigates to the AAPL position detail page
  And the "Open Covered Call" action is available

Scenario: Dismissing the assignment removes the notification
  When the trader clicks "Dismiss" on the assignment notification
  Then the notification banner disappears
  And the pending_assignment status changes to "dismissed"
  And the position remains in CSP_OPEN phase
  And the dismissed assignment does not reappear on future polls

Scenario: Multiple pending assignments show stacked notifications
  Given there are 2 pending assignments (AAPL and MSFT)
  When the trader views the position list
  Then 2 notification banners appear, one for each position
  And each can be confirmed or dismissed independently

Scenario: Assignment notification persists across app restarts
  Given a pending assignment was detected but not yet confirmed
  When the trader closes and reopens the app
  Then the notification banner reappears for the pending assignment

Scenario: Position detail page also shows the assignment notification
  Given the trader navigates to the AAPL position detail page
  And there is a pending assignment for this position
  Then an assignment notification card appears at the top of the detail content
  With the same confirm/dismiss options

Scenario: Confirm uses the existing assignment service
  When the trader confirms the assignment
  Then the system calls assignCspPosition with:
    | positionId      | pos_abc    |
    | assignmentDate  | 2026-04-19 |
  And the result includes the updated position, assign leg, and cost basis snapshot
  And the pending_assignment status changes to "confirmed"
```

---

## Technical Notes

- **New IPC channels:**
  - `assignments:pending` — returns all pending_assignment records joined with position data (ticker, strike, phase)
  - `assignments:confirm` — accepts `{ pendingAssignmentId }`, calls `assignCspPosition`, updates pending_assignment status to "confirmed"
  - `assignments:dismiss` — accepts `{ pendingAssignmentId }`, updates status to "dismissed"
- **Renderer components:**
  - `AssignmentNotificationBanner` — renders at the top of `PositionsListPage` when pending assignments exist
  - Uses a new `usePendingAssignments()` TanStack Query hook polling every 30s
- **Reuses existing service:** The confirm action delegates to `assignCspPosition(db, positionId, { assignmentDate })` — no new lifecycle logic needed.
- **Assignment date:** Extracted from the broker activity's `transactionTime` field (date portion only, no time).
- **Toast component:** If no toast system exists yet, add a minimal toast using a portal + auto-dismiss. Or use shadcn's Sonner integration.
- **Preload:** Add `getPendingAssignments`, `confirmAssignment`, `dismissAssignment` to the contextBridge API.

---

## Out of Scope

- CC expiration or call-away detection (future stories, same pattern)
- Bulk confirm/dismiss all assignments
- Email or push notification (in-app only for Phase 2)
- Undo after confirming (use the existing manual workflow to fix if needed)

---

## Dependencies

- US-35 (assignment detection creates pending_assignment records)
- Epic 01 `assignCspPosition` service (already exists)

---

## Estimate

5 points

## Mockup

- `mockups/us-36-assignment-notification.mdx`
