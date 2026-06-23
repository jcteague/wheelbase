# US-57: Configure global alert thresholds for profit target and management window

**As a** wheel trader with a preferred management style,
**I want to** configure my default profit target percentage and management-window DTE,
**So that** the alert engine matches how I actually manage positions instead of forcing a one-size-fits-all rule set.

---

## Context

Some traders close at 25%, some at 50%, and some let low-IV trades run further. The same is true for DTE management: 21 DTE is common, but many traders prefer 14. These settings should be global defaults, easy to review, and predictable: they drive future evaluations for positions without overrides, while per-position customizations remain opt-in.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the settings page
  And the current defaults are profit target 50% and management window 21 DTE

Scenario: Trader saves new global defaults
  When the trader changes profit target to 40%
  And changes management window to 14 DTE
  And clicks "Save alert defaults"
  Then the settings page shows "Alert defaults saved"
  And future alert evaluations use 40% and 14 DTE for positions without overrides

Scenario: Existing positions without overrides pick up the new defaults
  Given AAPL has no per-position overrides
  And the new global defaults have been saved as 40% and 14 DTE
  When the alert engine evaluates AAPL
  Then profit-target alerts use 40% as the threshold
  And management-window alerts use 14 DTE as the threshold

Scenario: Invalid settings are rejected inline
  When the trader enters profit target 0%
  And enters management window 0 DTE
  Then a validation error appears for profit target: "Profit target must be between 1 and 99"
  And a validation error appears for management window: "Management window must be between 6 and 45 DTE"
  And the Save button is disabled

Scenario: Saving global defaults does not overwrite per-position overrides
  Given MSFT has a per-position profit target override of 25%
  When the trader saves new global defaults
  Then the MSFT override remains 25%
  And only positions without overrides inherit the new defaults
```

---

## Technical Notes

- Extend the existing settings surface rather than creating a standalone alert-preferences page.
- Persist the global defaults in the same settings store used by other app-wide configuration.
- Validation should be renderer-first with Zod-backed IPC validation mirroring the same bounds.
- The management-window threshold must be at least 6 DTE so it stays meaningfully outside the separate `DTE <= 5` expiration-imminent rule.
- Profit-target resolution should continue to flow through a single helper so badges, alerts, and future forms all share the same defaulting logic.

---

## Out of Scope

- Separate thresholds by ticker, sector, or phase
- Notification delivery channel preferences
- Custom alert-rule creation

---

## Dependencies

- US-33: shared profit-target resolution logic
- US-50: alert engine consumes saved defaults

---

## Estimate

3 points

## Mockup

`mockups/us-57-global-alert-thresholds.mdx`
