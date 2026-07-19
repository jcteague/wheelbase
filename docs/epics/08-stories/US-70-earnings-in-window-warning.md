# US-70: Warn when a candidate has earnings within the DTE window

**As a** wheel trader screening for premium,
**I want** the screener to catch candidates whose earnings fall before the contract expires,
**So that** I don't unknowingly sell a cash-secured put into a binary event that can gap the stock through my strike.

---

## Context

Selling a CSP into earnings is selling a binary event. Two dangers: a bad print can gap the underlying 15–20% overnight, assigning you deep underwater with almost no premium cushion; and the premium looks fat _because_ pre-earnings IV is elevated — which means the yield-per-delta rank (US-65) will actively surface these as "best" candidates unless earnings is handled first. Per the domain briefing, the default is a **hard exclude** when earnings fall on or before expiration, with a configurable switch to **flag-and-keep** for traders who deliberately sell earnings IV. Earnings dates come from a separate calendar dependency — **not** from the Massive chain provider — so "earnings date unknown" must surface a caution rather than silently pass.

---

## Acceptance Criteria

```gherkin
Background:
  Given the DTE window is 30–45
  And today is 2026-07-15

Scenario: Exclude a candidate with earnings before expiration (default)
  Given AAPL's next earnings date is 2026-07-31
  And an AAPL put candidate expires 2026-08-21 (37 DTE)
  And earnings handling is "Exclude"
  When the screener scores AAPL
  Then the AAPL candidate is excluded with reason "earnings 2026-07-31 falls before expiry"

Scenario: Flag a candidate with earnings before expiration when flag mode is on
  Given AAPL's next earnings date is 2026-07-31
  And an AAPL put candidate expires 2026-08-21
  And earnings handling is "Flag only"
  When the screener scores AAPL
  Then the AAPL candidate is shown with a warning "⚠ Earnings 2026-07-31 — 21 days before expiry"
  And it is not placed at the top of the default ranked list

Scenario: No warning when earnings fall after expiration
  Given AAPL's next earnings date is 2026-09-05
  And an AAPL put candidate expires 2026-08-21
  When the screener scores AAPL
  Then no earnings warning is shown for the candidate

Scenario: Unknown earnings date surfaces a caution, not a silent pass
  Given the earnings calendar has no date for XYZ
  When the screener scores an XYZ candidate
  Then the candidate is shown with a caution "Earnings date unknown"
  And it is not silently treated as having no earnings

Scenario: Earnings-calendar outage does not suppress other results
  Given the earnings calendar is unreachable during the refresh
  When the screener runs
  Then candidates are still scored and ranked
  And each shows an "Earnings date unavailable" caution
```

---

## Technical Notes

- Earnings dates come from a **separate earnings-calendar dependency**, not Massive. Model it behind its own service/adapter; the chain provider must never be the attributed source for earnings.
- Compare the earnings date against the candidate's expiration date using `date-fns` (not string slicing); "in window" means earnings ≤ expiration. Consider an optional 1–2 day buffer for dates that slip (`estimated` vs `confirmed`).
- Ideally capture BMO/AMC timing and a confirmed-vs-estimated flag so a same-day-as-expiry case is judged correctly; if unavailable, treat presence of a date within the window as the trigger.
- Earnings handling is the enum from US-67 (`exclude` default / `flag`). In exclude mode this is a **hard filter** in the US-65 engine — a high yield never rescues it. In flag mode the candidate stays but is kept out of the top default sort.
- Follow failure isolation: an earnings-service outage degrades to an "unavailable" caption per candidate and never suppresses the rest of the run.

---

## Out of Scope

- Ex-dividend / other corporate-event warnings (informational badges, future)
- Earnings warnings on already-open positions (that is the Epic 07 earnings-proximity alert, US-56)
- Earnings badge on watchlist rows (that is US-96 — same earnings-calendar source, but a different surface: the bench, not the ranked results, and keyed to a fixed ~7-day window rather than earnings ≤ expiry)
- Sourcing/quality of the earnings-calendar provider (assumed available; flagged as an epic dependency)

---

## Dependencies

- US-65: scoring engine applies the exclude/flag decision
- US-66: results table renders the warning/caution
- US-67: earnings-handling toggle (exclude vs flag)
- External: earnings-calendar data source (unowned — flagged as an epic dependency)

---

## Estimate

3 points

## Mockup

Covered by the US-66 ranked-results mockup (`mockups/us-66-screener-results.mdx`) — includes the earnings-flag and earnings-unknown states.
