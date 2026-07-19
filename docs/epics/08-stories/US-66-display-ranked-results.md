# US-66: Display ranked screener results with key metrics

**As a** wheel trader deciding where to sell my next put,
**I want** a ranked, scannable table of candidate strikes with the metrics that drive the decision,
**So that** I can compare entries across tickers at a glance without opening each chain by hand.

---

## Context

This is the payoff surface of the epic. The scored candidates (US-65) render as a dense, ranked table — one recommended strike per ticker — sorted by yield-per-delta. Traders read many numbers at once, so the table must show the decision-relevant fields together: strike, expiration, DTE, mark, period + annualized yield, delta, IV rank, open interest, and bid-ask spread. Excluded and unavailable tickers are shown too (with their reason) so the trader trusts the list is complete rather than silently trimmed. The header reuses the existing `MarketStatusPill` (LIVE/EXT/CLOSED) so the freshness of the marks is always visible.

---

## Acceptance Criteria

```gherkin
Background:
  Given the watchlist has been screened
  And the market status pill reads LIVE

Scenario: Results are ranked by yield-per-delta
  Given KO scores 0.71, AAPL scores 0.53, and MSFT scores 0.50
  When the trader opens the Screener results
  Then KO is listed first, AAPL second, and MSFT third
  And each row shows strike, expiration, DTE, mark, period yield, annualized yield, delta, IV rank, open interest, and spread

Scenario: A row shows the metrics for its recommended strike
  Given AAPL's top strike is the $180 put expiring 2026-08-21 (37 DTE), mark $2.70, delta 0.28, OI 4,200, spread $0.06 (2%)
  When the trader views the AAPL row
  Then it shows "1.5% period", "14.8%/yr", delta "0.28", IV rank "44", "4,200 OI", and "$0.06 (2%)"
  And its yield-per-delta score is 0.53 (0.148 / 0.28)

Scenario: IV rank unavailable is shown, not blank
  Given the volatility service returned no IVR for MSFT
  When the trader views the MSFT row
  Then the IV rank cell reads "n/a"
  And MSFT is still ranked by yield-per-delta

Scenario: Excluded candidates are listed with a reason
  Given TSLA's only in-window strike was excluded for "spread 22% exceeds 10%"
  When the trader expands the excluded section
  Then TSLA appears with the reason "spread 22% exceeds 10%"
  And no yield-per-delta rank is shown for it

Scenario: Provider outage is distinguished from no results
  Given Massive was unreachable during the last refresh
  When the trader opens the Screener results
  Then a "market data unavailable" state is shown
  And it is visually distinct from an empty "no candidates match your criteria" state

Scenario: Stale marks are flagged
  Given the market status pill reads CLOSED
  When the trader opens the Screener results
  Then the results are badged as a stale snapshot with the quote time
```

---

## Technical Notes

- Consume scored candidates from US-65 via `screener:results` IPC; the renderer does not compute yield or rank.
- Use a dense shadcn `Table` with `wb-*` design tokens; gold accent for the rank column, `wb-green` for yield, muted for excluded rows. No inline styles for color/spacing (project convention).
- Reuse `MarketStatusPill` on the results header (LIVE/EXT/CLOSED) — do not invent a polling/timing indicator.
- Show spread as both absolute and % (`$0.06 (2%)`) — the dual form is how the trader judges friction (per domain briefing).
- Three empty/error states must be visually distinct: ranked results present, "no candidates match your criteria" (screened, nothing survived), and "market data unavailable" (provider down).
- Excluded and "data unavailable / no options listed" tickers render in a collapsed section below the ranked list, each with its reason.

---

## Out of Scope

- Editing screening criteria (US-67)
- Promoting a result into the trade form (US-68)
- The earnings warning badge treatment (US-70 — this story renders the table; US-70 adds the earnings-specific flag/exclusion)
- Sorting/column customization beyond the default yield-per-delta rank

---

## Dependencies

- US-65: scored, ranked candidates with exclusion reasons
- US-45: IVR value shown in the IV rank column
- US-32/US-37: MarketStatusPill for the header freshness indicator

---

## Estimate

5 points

## Mockup

`mockups/us-66-screener-results.mdx`
