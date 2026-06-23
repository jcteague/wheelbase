# US-58: Override alert thresholds on a per-position basis

**As a** wheel trader making ticker-specific management choices,
**I want to** override the global alert thresholds for an individual position,
**So that** I can manage high-IV names, low-IV names, and conviction holdings differently without changing my defaults for everything else.

---

## Context

Traders often manage one ticker more aggressively than another. A volatile name might justify a 25% profit target, while a slow blue-chip wheel might stay on the standard 50%. Overrides should be explicit, reversible, and easy to audit so the trader can tell whether a position is following the app defaults or a custom rule.

---

## Acceptance Criteria

```gherkin
Background:
  Given the global defaults are profit target 50% and management window 21 DTE
  And the trader is viewing the AAPL position detail page

Scenario: Trader saves per-position overrides
  When the trader enables custom alerts for AAPL
  And sets profit target to 25%
  And sets management window to 14 DTE
  And clicks "Save overrides"
  Then the position shows "Custom alert thresholds active"
  And future alert evaluations for AAPL use 25% and 14 DTE

Scenario: Other positions continue using the global defaults
  Given AAPL has overrides of 25% and 14 DTE
  And MSFT has no overrides
  When the alert engine evaluates both positions
  Then AAPL uses 25% and 14 DTE
  And MSFT uses 50% and 21 DTE

Scenario: Trader clears overrides and reverts to global defaults
  Given AAPL already has custom thresholds saved
  When the trader clicks "Use global defaults"
  Then the position no longer shows custom thresholds
  And future alert evaluations for AAPL use 50% and 21 DTE

Scenario: Invalid override values are rejected inline
  When the trader enters profit target 100%
  And enters management window 60 DTE
  Then a validation error appears for profit target: "Profit target must be between 1 and 99"
  And a validation error appears for management window: "Management window must be between 6 and 45 DTE"
  And no overrides are saved
```

---

## Technical Notes

- Store overrides on the position record so the alert engine can resolve them without looking up a second table.
- The UI should clearly distinguish "Using global defaults" from "Custom thresholds active."
- Reuse the same schema bounds and default-resolution helper as US-57.
- Per-position management-window overrides should honor the same `6-45 DTE` bounds as the global defaults so traders cannot configure a dead zone beneath the expiration-imminent rule.

---

## Out of Scope

- Rule-specific overrides beyond profit target and management window
- Multi-position bulk editing
- PMCC-specific overrides

---

## Dependencies

- US-57: global defaults exist
- US-50: alert engine consumes per-position values

---

## Estimate

3 points

## Mockup

`mockups/us-58-position-alert-overrides.mdx`
