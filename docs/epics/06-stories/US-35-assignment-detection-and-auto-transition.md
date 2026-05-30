# US-35: Detect CSP assignment from broker activity and auto-transition position

**As a** wheel trader who doesn't want to manually monitor their broker for assignments,
**I want the** app to detect when a CSP has been assigned, surface a notification, and transition the position when I confirm,
**So that** I can move on to selling covered calls without manual data entry or broker monitoring.

---

## Context

Assignment moves a position from CSP_OPEN to HOLDING_SHARES and changes what the trader needs to do next. Today traders must notice the assignment at their broker, return to Wheelbase, and click through the manual assignment flow — error-prone and easy to delay.

Alpaca processes assignments overnight; they appear in the activities feed as OPASN events the morning after expiration. This story covers the full loop: polling the broker for OPASN events, matching them to open CSP legs, surfacing a notification banner for the trader to confirm or dismiss, and executing the phase transition on confirmation. The confirmation reuses the existing `assignCspPosition` service — no new lifecycle logic is needed.

After the Epic 06 architectural split, broker activities live on `BrokerProvider` (US-31 rewrite, implemented by `AlpacaBrokerProvider` in US-40). Polling cadence is supplied by the shared `PollingScheduler` service (US-46).

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL:
    | strike | expiration | contracts | option_symbol       |
    | 180.00 | 2026-04-18 | 1         | AAPL260418P00180000 |
  And the BrokerProvider (Alpaca) is configured and polling is active

Scenario: Detect assignment from OPASN activity and create pending record
  Given the broker activities API returns an OPASN event:
    | activityId | symbol              | qty | transactionTime      |
    | act_123    | AAPL260418P00180000 | 1   | 2026-04-19T08:00:00Z |
  When the assignment detection job runs
  Then the system matches the activity to the AAPL CSP_OPEN position
  And creates a pending assignment record with status "pending"
  And logs at INFO level: "Assignment detected for AAPL CSP at $180 strike"

Scenario: Ignore assignment activity for unknown positions
  Given the broker returns an OPASN event for "MSFT260418P00400000"
  And no position in the database has a matching open CSP leg
  When the assignment detection job runs
  Then the event is logged at DEBUG level and skipped
  And no pending assignment record is created

Scenario: Do not process the same activity twice
  Given activity "act_123" was already processed in a previous poll
  When the next poll returns the same activity
  Then the system skips it
  And no duplicate pending assignment is created

Scenario: Handle multiple assignments in a single poll
  Given the broker returns 2 OPASN events:
    | activityId | symbol              | qty |
    | act_123    | AAPL260418P00180000 | 1   |
    | act_124    | MSFT260418P00420000 | 2   |
  And both match open CSP positions
  When the detection job runs
  Then 2 separate pending assignment records are created

Scenario: API error during polling does not crash the app
  Given the BrokerProvider throws a BrokerError with code "network_error"
  When the assignment detection job runs
  Then the error is logged at WARN level
  And the job reschedules for the next interval
  And no pending assignments are created or lost

Scenario: Assignment notification banner appears on the position list
  Given a pending assignment exists for the AAPL CSP at the $180 strike
  When the trader opens the position list
  Then a notification banner appears:
    "Assignment detected: AAPL $180 PUT was assigned on Apr 19. Confirm to update position."
  And the banner has "Confirm" and "Dismiss" buttons
  And the AAPL position row has a pulsing amber indicator

Scenario: Confirming the assignment transitions the position
  Given a pending assignment exists for the AAPL CSP at the $180 strike
  When the trader clicks "Confirm" on the assignment notification
  Then the position transitions from CSP_OPEN to HOLDING_SHARES
  And the assignment date is set to "2026-04-19" from the broker activity
  And a new ASSIGN leg is created with the correct strike and date
  And the cost basis snapshot recalculates
  And a success toast appears: "AAPL assigned — now holding 100 shares at $180 strike"
  And the toast includes a link: "Open covered call →"

Scenario: Dismissing the assignment removes the notification
  Given a pending assignment exists for the AAPL CSP
  When the trader clicks "Dismiss"
  Then the notification banner disappears
  And the pending assignment status changes to "dismissed"
  And the position remains in CSP_OPEN phase
  And the dismissed assignment does not reappear on future polls

Scenario: Assignment notification persists across app restarts
  Given a pending assignment was detected but not yet confirmed
  When the trader closes and reopens the app
  Then the notification banner reappears for the pending assignment
```

---

## Technical Notes

**Detection service:** `src/main/services/detect-assignments.ts`

1. Query DB for all positions in CSP_OPEN with active legs
2. Call `brokerProvider.getActivities({ type: 'OPASN', since: lastPollTimestamp })`
3. Parse each OCC symbol with `parseOccSymbol(symbol)` → `{ ticker, expiration, type, strike }`
4. Match against open CSP legs by ticker, expiration, strike, and put type
5. Insert into `pending_assignments` (UNIQUE on `activity_id` — deduplication at DB level)
6. Update `lastPollTimestamp` in app settings

**New DB table:** `pending_assignments` — `id`, `position_id`, `leg_id`, `activity_id` (UNIQUE), `broker_symbol`, `qty`, `transaction_time`, `status` (pending | confirmed | dismissed), `detected_at`, `confirmed_at`. Migration required.

**OCC symbol parser:** `parseOccSymbol(symbol)` in `src/main/core/` — pure function, no I/O.

**New IPC channels:**

- `assignments:pending` — returns all pending records joined with position data (ticker, strike, phase)
- `assignments:confirm` — `{ pendingAssignmentId }` → calls `assignCspPosition`, sets status to "confirmed"
- `assignments:dismiss` — `{ pendingAssignmentId }` → sets status to "dismissed"

**Renderer:**

- `AssignmentNotificationBanner` at the top of `PositionsListPage`
- `usePendingAssignments()` TanStack Query hook polling every 30s
- Preload: expose `getPendingAssignments`, `confirmAssignment`, `dismissAssignment` via contextBridge

**Reuses existing service:** confirm delegates to `assignCspPosition(db, positionId, { assignmentDate })`.

---

## Out of Scope

- CC expiration detection via OPEXP activities (future story)
- Call-away detection (future story, same pattern)
- Manual assignment recording (exists in Epic 01)
- Bulk confirm/dismiss all assignments
- Email or push notifications (in-app only for Phase 2)
- Undo after confirming
- Assignment notification on the position detail page (follow-on)

---

## Dependencies

- US-31 (rewrite — `BrokerProvider` interface with `getActivities`)
- US-40 (`AlpacaBrokerProvider` — concrete implementation that calls Alpaca activities API)
- US-46 (polling scheduler — invokes the detection job on interval)
- Epic 01 `assignCspPosition` service (already exists at `src/main/services/assign-csp-position.ts`)

---

## Estimate

8 points
