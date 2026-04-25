# US-34: Display Greeks on position detail page for open option legs

**As a** wheel trader evaluating whether to hold, roll, or close an option,
**I want to** see the current Greeks (delta, theta, gamma, vega) and implied volatility for my open leg,
**So that** I can make informed management decisions based on assignment probability, time decay rate, and volatility conditions.

---

## Context

Greeks are the primary quantitative inputs to wheel management decisions. Delta tells the trader how likely assignment is and how much directional risk they carry. Theta shows the daily income from time decay — the engine that makes the wheel strategy profitable. IV context tells them whether premiums are rich or cheap for rolling decisions. Gamma warns of instability near expiration.

The options expert recommends a tiered display: delta and theta are Tier 1 (always prominent), IV and vega are Tier 2 (shown in context), and gamma is Tier 3 (available but not prominent). Color thresholds help the trader scan for positions needing attention without reading every number.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL:
    | strike | expiration | contracts | premium_per_contract |
    | 180.00 | 2026-05-16 | 1         | 3.50                 |
  And the MarketDataProvider returns option Greeks for the AAPL contract

Scenario: Greeks panel displays on position detail page
  Given the trader navigates to the AAPL position detail page
  And the option snapshot includes greeks: { delta: -0.28, theta: -0.045, gamma: 0.015, vega: 0.12, iv: 0.32 }
  When the page loads
  Then a "Greeks" section appears below the Open Leg section
  And the section displays delta, theta, gamma, vega, and IV as labeled stats

Scenario: Delta displays with assignment-probability color coding for CSP
  Given the open leg is a CSP (short put)
  And delta is -0.28 (absolute value 0.28)
  When the trader views the Greeks panel
  Then delta displays as "0.28" (absolute value, no sign — convention for display)
  And delta text is green (< 0.30 threshold for CSP)

Scenario: Delta turns gold at moderate assignment risk
  Given the open leg is a CSP and delta is -0.38
  When the trader views the Greeks panel
  Then delta displays as "0.38" in gold text
  And a tooltip reads "Moderate assignment risk — consider rolling"

Scenario: Delta turns red at high assignment risk
  Given the open leg is a CSP and delta is -0.52
  When the trader views the Greeks panel
  Then delta displays as "0.52" in red text
  And a tooltip reads "High assignment risk"

Scenario: Delta thresholds differ for covered calls
  Given the open leg is a CC (short call) and delta is 0.42
  When the trader views the Greeks panel
  Then delta displays as "0.42" in gold text (CC threshold: green < 0.35, gold 0.35–0.50, red > 0.50)

Scenario: Theta displays as daily dollar decay
  Given theta is -0.045 and the trader holds 1 contract
  When the trader views the Greeks panel
  Then theta displays as "$4.50/day" (absolute value × 100 for per-contract display)
  And theta text is green (> $5 is green, $2–5 is default, < $2 is amber)

Scenario: IV displays with context label
  Given IV is 0.32
  When the trader views the Greeks panel
  Then IV displays as "32.0%"
  And the label reads "IV"

Scenario: Greeks unavailable — panel shows placeholder
  Given the MarketDataProvider returns no Greeks for the contract
  When the trader views the position detail page
  Then the Greeks section shows "Greeks unavailable" in muted text
  And no error alert appears

Scenario: HOLDING_SHARES with no open leg — no Greeks panel
  Given the position is in HOLDING_SHARES phase with no active option leg
  When the trader views the position detail page
  Then the Greeks section does not appear

Scenario: Greeks update on poll without page reload
  Given the Greeks panel is showing delta 0.28
  When the next poll returns delta 0.31
  Then the delta value updates to "0.31" in place
  And the color transitions from green to gold (crossed 0.30 threshold)
```

---

## Technical Notes

- **Greeks data source:** Reuses the `useOptionSnapshots` hook from US-33. The `OptionSnapshot` type already includes `greeks: { delta, gamma, theta, vega, iv }`.
- **New component:** `GreeksPanel` — receives an `OptionSnapshot['greeks']` prop plus `instrumentType` (PUT or CALL) for threshold selection.
- **Color thresholds (pure function):** Add `greekSeverity(greek, value, instrumentType)` to `src/renderer/src/lib/format.ts`. Returns `'normal' | 'warning' | 'danger'` mapped to green/gold/red.
  - Delta CSP: green < 0.30, gold 0.30–0.45, red > 0.45
  - Delta CC: green < 0.35, gold 0.35–0.50, red > 0.50
  - Theta (per contract $): green > $5, default $2–5, amber < $2
- **Delta display convention:** Show absolute value. Traders know a short put delta is negative — displaying the sign adds noise.
- **Theta display:** Convert from per-share to per-contract (× 100). Show as "$X.XX/day" for immediate intuition about daily income.
- **Placement:** `PositionDetailContent` renders `<GreeksPanel>` after the Open Leg `<SectionCard>` and before Cost Basis. Only renders when `activeLeg` exists and Greeks data is available.

---

## Out of Scope

- IV rank or IV percentile (requires historical IV data — future enhancement)
- Greeks on the position list row (too crowded; delta/theta summary may be a future card enhancement)
- Greeks-based alerts (Epic 08 — Alert Engine)
- Gamma risk warnings near expiration (could be a separate micro-story)

---

## Dependencies

- US-31 (MarketDataProvider adapter — Greeks come from option snapshots)
- US-33 (option snapshot polling and `useOptionSnapshots` hook)

---

## Estimate

3 points

## Mockup

- `mockups/us-34-greeks-panel.mdx`
