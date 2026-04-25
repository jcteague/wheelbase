# US-35: Poll broker activities to detect option assignment events

**As a** wheel trader who doesn't want to manually check their broker for assignments,
**I want the** app to automatically detect when a CSP has been assigned by polling broker activity,
**So that** I am notified promptly and can begin selling covered calls on my new shares.

---

## Context

Assignment is a critical lifecycle event — it transitions a position from CSP_OPEN to HOLDING_SHARES and fundamentally changes what the trader needs to do next. Today the trader must manually record assignments, which means checking their broker, noticing the shares appeared, coming to Wheelbase, and clicking through the assignment flow. This is error-prone and slow.

Assignments at Alpaca (and most brokers) are processed overnight. They appear in the activities feed the morning after expiration. The app needs to poll the broker's activities API, match assignment events against known open CSP legs, and surface them for the trader to confirm. This story covers the detection and matching logic. The auto-transition and notification are in US-36.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL:
    | strike | expiration | contracts | option_symbol         |
    | 180.00 | 2026-04-18 | 1         | AAPL260418P00180000   |
  And the MarketDataProvider is configured and polling is active

Scenario: Detect assignment from OPASN activity
  Given the broker activities API returns an OPASN event:
    | activityId | symbol              | qty | transactionTime       |
    | act_123    | AAPL260418P00180000 | 1   | 2026-04-19T08:00:00Z  |
  When the assignment detection job runs
  Then the system matches the activity to the AAPL CSP_OPEN position
  And creates a pending assignment record with the activity details
  And logs at INFO level: "Assignment detected for AAPL CSP at $180 strike"

Scenario: Match activity to position by OCC symbol components
  Given the OPASN event symbol is "AAPL260418P00180000"
  When the detection job parses the symbol
  Then it extracts ticker "AAPL", expiration "2026-04-18", type "PUT", strike "180.00"
  And matches against the open CSP leg with matching ticker, expiration, strike, and instrument type

Scenario: Ignore assignment activity for unknown positions
  Given the broker returns an OPASN event for "MSFT260418P00400000"
  And no position in the database has a matching open leg
  When the assignment detection job runs
  Then the event is logged at DEBUG level and skipped
  And no pending assignment record is created

Scenario: Do not process the same activity twice
  Given activity "act_123" was already processed in a previous poll
  When the next poll returns the same activity
  Then the system skips it (matched by activityId)
  And no duplicate pending assignment is created

Scenario: Poll only for activities since the last successful check
  Given the last successful poll was at "2026-04-19T07:00:00Z"
  When the detection job runs
  Then it requests activities with since="2026-04-19T07:00:00Z"
  And only processes events after that timestamp

Scenario: Handle multiple assignments in a single poll
  Given the broker returns 2 OPASN events:
    | activityId | symbol              | qty |
    | act_123    | AAPL260418P00180000 | 1   |
    | act_124    | MSFT260418P00420000 | 2   |
  And both match open CSP positions
  When the detection job runs
  Then 2 separate pending assignment records are created
  And each is logged individually

Scenario: API error during polling does not crash the app
  Given the MarketDataProvider throws a MarketDataError with code "network_error"
  When the assignment detection job runs
  Then the error is logged at WARN level
  And the job reschedules for the next interval
  And no pending assignments are created or lost

Scenario: Detection job only runs during appropriate hours
  Given the polling schedule is configured (US-38)
  When the market is closed (overnight, outside extended hours)
  Then the detection job runs at the "closed" frequency (hourly by default)
  And when the market opens, it switches to the "regular" frequency (60s)
```

---

## Technical Notes

- **New service:** `src/main/services/detect-assignments.ts` — orchestrates the detection flow:
  1. Query DB for all positions in CSP_OPEN phase with active legs
  2. Call `provider.getActivities({ type: 'OPASN', since: lastPollTimestamp })`
  3. For each activity, parse the OCC symbol, match against open legs
  4. Create a `pending_assignment` record in the DB
  5. Update `lastPollTimestamp` in app settings
- **New DB table:** `pending_assignments` with columns: `id`, `position_id`, `leg_id`, `activity_id` (unique — prevents duplicates), `broker_symbol`, `qty`, `transaction_time`, `status` (pending | confirmed | dismissed), `detected_at`, `confirmed_at`. Migration needed.
- **OCC symbol parser:** Add `parseOccSymbol(symbol)` to `src/main/core/` — pure function returning `{ ticker, expiration, type, strike }`. Also add `buildOccSymbol(...)` if not already created in US-33.
- **Polling orchestration:** The detection job is invoked by the polling scheduler (US-38). This story implements the detection logic; US-38 implements the scheduler.
- **Idempotency:** The `activity_id` column has a UNIQUE constraint. Attempting to insert a duplicate is caught gracefully.
- **No lifecycle transition here.** Detection creates a `pending_assignment` record. US-36 handles the confirmation UX and actual phase transition.

---

## Out of Scope

- Auto-transitioning the position to HOLDING_SHARES (US-36)
- Notification/toast when assignment is detected (US-36)
- CC expiration detection via OPEXP activities (future story)
- Call-away detection (future story — similar pattern)
- Manual assignment recording (already exists in Epic 01)

---

## Dependencies

- US-31 (MarketDataProvider adapter — `getActivities` method)
- US-38 (polling scheduler — invokes the detection job on interval)

---

## Estimate

5 points
