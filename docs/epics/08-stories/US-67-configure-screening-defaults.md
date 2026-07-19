# US-67: Configure screening defaults

**As a** wheel trader with a defined risk appetite,
**I want to** configure the screener's criteria — delta band, DTE window, premium-yield floor, liquidity gates, price ceiling, and earnings handling,
**So that** the ranked results reflect how I actually pick entries instead of a one-size-fits-all default.

---

## Context

Every wheel trader screens differently: a conservative trader wants 0.15–0.20 delta and 45 DTE; an aggressive one wants 0.30–0.40 and weeklies. The scorer (US-65) ships with sane defaults, but the criteria must be editable and persisted so screening is reproducible session to session. Per the domain briefing, delta and DTE are structural hard filters, liquidity is a hard gate, yield and IV rank are primarily ranking inputs (optional soft floors), and earnings handling is a policy choice (exclude vs flag). These are configurable preferences, not hard-coded constants.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the Screener settings
  And the current defaults are: delta band 0.20–0.30, DTE window 30–45,
    minimum open interest 500, max spread 10%, price ceiling off, earnings "Exclude"

Scenario: Save new screening criteria
  When the trader sets the delta band to 0.15–0.20
  And sets the DTE window to 40–45
  And clicks "Save screening criteria"
  Then the settings show "Screening criteria saved"
  And the next screener refresh filters candidates to 0.15–0.20 delta and 40–45 DTE

Scenario: Toggle earnings handling between exclude and flag
  Given earnings handling is "Exclude"
  When the trader changes earnings handling to "Flag only"
  And saves
  Then candidates with earnings inside the DTE window are shown with a warning instead of excluded

Scenario: Reject an inverted delta band
  When the trader sets the delta band to 0.30–0.20
  Then a validation error appears: "Minimum delta must be less than maximum delta"
  And the Save button is disabled

Scenario: Reject an inverted DTE window
  When the trader sets the DTE window to 45–30
  Then a validation error appears: "Minimum DTE must be less than maximum DTE"
  And the Save button is disabled

Scenario: Reject out-of-range criteria
  When the trader enters "<field>" as "<value>"
  Then a validation error appears: "<message>"
  And no criteria are saved

  Examples:
    | field              | value | message                              |
    | max delta          | 1.5   | Delta must be between 0.01 and 0.99  |
    | minimum DTE        | 0     | DTE must be at least 1               |
    | minimum open interest | -100 | Open interest floor cannot be negative |
    | max spread %       | 0     | Max spread must be between 1% and 50% |

Scenario: IV-rank floor is optional and off by default
  Given the IV-rank floor toggle is off
  When the trader screens
  Then candidates are not excluded for low IV rank
  And when the trader enables the floor at 30, candidates below IVR 30 drop out of the ranked list

Scenario: Price ceiling is optional and off by default
  Given the price-ceiling toggle is off
  When the trader screens
  Then candidates are not excluded by underlying price
  And when the trader enables the ceiling at $75, candidates whose underlying trades above $75 drop out
```

---

## Technical Notes

- Extend the existing settings surface (same store used for global alert thresholds, US-57) — do not create a standalone page.
- Renderer-first Zod validation mirrored by Zod-backed IPC validation, with matching bounds (see the alert-thresholds pattern).
- Delta band and DTE window are paired min/max inputs with cross-field validation (min < max).
- Earnings handling is an enum: `exclude` (default) or `flag`. The IV-rank floor and the price ceiling are both optional numerics that default to **disabled** — a fixed dollar ceiling is a per-account buying-power preference, and defaulting it on would silently hide large-cap optionable names (AAPL, MSFT, SPY) out of the box; a low IV-rank floor would empty results in a low-vol regime.
- The scorer (US-65) reads these persisted criteria; a single criteria object flows to the engine so the settings, the results, and the promote pre-fill never drift.

---

## Out of Scope

- Multiple named criteria presets / profiles
- Per-ticker criteria overrides
- PMCC screening criteria (Epic 09)
- Sector-correlation limits and buying-power-based ceilings (future)

---

## Dependencies

- US-65: the scorer consumes the persisted criteria

---

## Estimate

3 points

## Mockup

`mockups/us-67-screening-defaults.mdx`
