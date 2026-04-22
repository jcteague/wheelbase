# US-22: Show visual distance indicator (underlying price vs. strike)

**As a** wheel trader monitoring my positions,
**I want to** see how close the underlying stock price is to each position's strike price, displayed as a percentage on the card,
**So that** I can quickly identify positions at risk of assignment or positions far out-of-the-money that might need to be rolled closer.

---

## Context

"Distance to strike" is the single most important real-time metric for a wheel trader. A CSP with the stock 1% above the strike is about to be assigned — the trader needs to decide whether to roll or accept assignment. A CC with the stock 8% below the strike is very safe but might be rolled closer to collect more premium. This indicator turns each position card into a mini risk gauge. This story ships with Phase 2 (live market data from Epic 06) since it requires a current underlying price that isn't available in Phase 1.

---

## Acceptance Criteria

```gherkin
Background:
  Given live market data integration (Epic 06) is available
  And the trader has 3 active positions:
    | ticker | phase    | strike | current_price |
    | AAPL   | CSP_OPEN | 180.00 | 183.50        |
    | MSFT   | CC_OPEN  | 420.00 | 415.00        |
    | TSLA   | CSP_OPEN | 250.00 | 230.00        |

Scenario: Distance indicator shows percentage for a CSP near the strike
  When the trader views the AAPL card
  Then the distance indicator shows "+1.9%" (price is 1.9% above the CSP strike)
  And the indicator is colored green (out-of-the-money — safe for a put)

Scenario: Distance indicator shows percentage for a CC below the strike
  When the trader views the MSFT card
  Then the distance indicator shows "−1.2%" (price is 1.2% below the CC strike)
  And the indicator is colored green (out-of-the-money — safe for a call)

Scenario: Distance indicator highlights danger when price is within 2% of strike
  Given AAPL price drops to $181.00 (0.6% above the $180 strike)
  When the trader views the AAPL card
  Then the distance indicator shows "+0.6%"
  And the indicator is colored red or amber (approaching assignment)

Scenario: Distance indicator for a deep ITM position
  When the trader views the TSLA card
  Then the distance indicator shows "−8.0%" (price is 8% below the CSP strike)
  And the indicator is colored red (in-the-money — likely assignment)

Scenario: Distance shows "—" when no live price is available
  Given the market data feed has not returned a price for GOOG
  When the trader views the GOOG card
  Then the distance indicator shows "—" in muted text

Scenario: Distance indicator not shown for HOLDING_SHARES without an option leg
  Given a position in HOLDING_SHARES phase with no active CC
  When the trader views the card
  Then no distance indicator is displayed (there is no strike to measure against)

Scenario: Distance direction label reflects option type
  Given AAPL has a put at $180 and price is $183.50
  Then the tooltip or label reads "1.9% above put strike"
  Given MSFT has a call at $420 and price is $415
  Then the tooltip or label reads "1.2% below call strike"
```

---

## Technical Notes

- **Phase 2 story.** Requires current underlying price from the Alpaca market data integration (Epic 06). In Phase 1, this card section can be stubbed with a placeholder or omitted entirely.
- **Distance formula:** `distance = (currentPrice - strike) / strike × 100`
  - For puts: positive distance = OTM (safe), negative = ITM (risk)
  - For calls: negative distance = OTM (safe), positive = ITM (risk)
- **Color thresholds:**
  - OTM by > 5%: muted/neutral
  - OTM by 2–5%: green
  - OTM by 0–2%: amber (approaching)
  - ITM (any amount): red
- **Visual treatment:** Small bar or pill on the position card showing the percentage with directional coloring. Consider a compact horizontal gauge bar showing the price relative to the strike.
- **Data source:** The live price will come from a new field on `PositionListItem` (e.g., `currentPrice: string | null`) added when Epic 06 lands, or from a separate market data query.
- **Tooltip:** On hover, show the full label: "AAPL: $183.50 is 1.9% above put strike $180.00".

---

## Out of Scope

- Historical distance tracking or charting
- Distance alerts (Epic 07 — management alerts)
- Greeks display (delta, theta — separate story in Epic 06)
- Distance for PMCC positions (Epic 09)

---

## Dependencies

- US-18: Position card grid must exist
- Epic 06: Live market data integration (provides current underlying price)

---

## Estimate

3 points

## Mockup

- `mockups/us-22-distance-indicator.mdx` — Distance indicator states in isolation
- `mockups/us-04-dashboard-position-card.mdx` — Unified card showing how distance gauge integrates with the full card layout
