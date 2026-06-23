# US-50: Evaluate built-in alert rules against all active positions on a schedule

**As a** wheel trader managing several live positions,
**I want to** have Wheelbase evaluate alert rules automatically on a recurring schedule,
**So that** my management queue reflects what needs attention without me manually checking every ticker.

---

## Context

The alert engine is the backbone of this epic. Traders do not want a dashboard that only becomes useful after they click refresh or open each position detail page. The app should wake up on the existing market-data polling cadence, inspect every active wheel, and persist the alert results in a way that survives restarts, supports dismissal, and avoids duplicate noise.

---

## Acceptance Criteria

```gherkin
Background:
  Given the polling scheduler is running during market hours
  And the database contains active positions in CSP_OPEN and CC_OPEN phases

Scenario: Scheduled evaluation creates open alerts for triggered rules
  Given AAPL has 4 DTE remaining on an open CSP
  And MSFT has 17 DTE remaining on an open covered call
  When the alert evaluation job runs
  Then an EXPIRATION_IMMINENT alert is persisted for AAPL
  And a MANAGEMENT_WINDOW alert is persisted for MSFT
  And each alert record stores: position id, rule code, urgency tier, summary text, quick action, status, triggered_at, and last_evaluated_at

Scenario: Re-evaluation updates an existing open alert instead of duplicating it
  Given an open MANAGEMENT_WINDOW alert already exists for MSFT
  And MSFT still has 17 DTE remaining
  When the alert evaluation job runs again
  Then no second MANAGEMENT_WINDOW alert is created for MSFT
  And the existing alert row keeps its original triggered_at value
  And the existing alert row updates its last_evaluated_at value

Scenario: Cleared conditions resolve the alert
  Given an open MANAGEMENT_WINDOW alert exists for MSFT
  And MSFT is rolled to 29 DTE before the next evaluation
  When the alert evaluation job runs
  Then the MANAGEMENT_WINDOW alert is marked resolved
  And the resolved alert no longer appears in open queue results

Scenario: Positions without an active option leg are skipped
  Given TSLA is in HOLDING_SHARES with no open covered call
  When the alert evaluation job runs
  Then no alert rows are created for TSLA

Scenario: Missing data for one rule does not fail the whole evaluation job
  Given NVDA has an open position but no earnings date is available
  And AAPL still meets the EXPIRATION_IMMINENT rule
  When the alert evaluation job runs
  Then the AAPL alert is still persisted
  And the earnings rule is skipped for NVDA with a debug log entry
  And the job does not leave partially written alert rows if one rule evaluation errors
```

---

## Technical Notes

- Add a dedicated alert evaluation service in the main process that consumes active positions plus the latest market-state inputs and returns pure rule matches before persistence.
- Persist alerts in SQLite with stable rule identifiers so open alerts can be updated in place rather than duplicated.
- Reuse the scheduler patterns from US-46 in Epic 06 instead of introducing a second scheduling mechanism.
- Resolve alerts by status change; do not delete them, because dismissal and resolution are both part of the audit trail.
- The engine should only evaluate Classic Wheel rules in this epic. PMCC rules remain deferred to Epic 09.

---

## Out of Scope

- Email, push, or SMS delivery
- Intraday streaming alerts outside the existing polling cadence
- PMCC-specific rules
- Trader-authored custom rules

---

## Dependencies

- US-31 through US-33: live market-state foundations
- US-46: recurring polling scheduler infrastructure

---

## Estimate

5 points

## Mockup

None — backend and persistence story only
