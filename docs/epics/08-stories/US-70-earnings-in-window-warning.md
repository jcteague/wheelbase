# US-70: Warn when a candidate has earnings within the DTE window

**As a** wheel trader screening for premium,
**I want** the screener to catch candidates whose earnings fall before the contract expires,
**So that** I don't unknowingly sell a cash-secured put into a binary event that can gap the stock through my strike.

---

## Context

Selling a CSP into earnings is selling a binary event. Two dangers: a bad print can gap the underlying 15–20% overnight, assigning you deep underwater with almost no premium cushion; and the premium looks fat _because_ pre-earnings IV is elevated — which means the yield-per-delta rank (US-65) will actively surface these as "best" candidates unless earnings is handled first. Per the domain briefing, the default is a **hard exclude** when earnings fall on or before expiration, with a configurable switch to **flag-and-keep** for traders who deliberately sell earnings IV.

Earnings dates come from the **Finnhub free-tier calendar** — the auxiliary integration module `src/main/integrations/finnhub-earnings.ts` already shipped for US-56 — **not** from the Massive chain provider. That module was built for a ~7-day alert horizon and needs widening for a 30–45 DTE screening horizon (see Technical Notes). Because the feed is a free-tier external dependency with real gaps, a missing date must surface a caution rather than silently pass, and must never itself exclude a candidate.

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
  Then the AAPL candidate is excluded with reason "earnings 2026-07-31 falls on or before expiry"

Scenario: Flag a candidate with earnings before expiration when flag mode is on
  Given AAPL's next earnings date is 2026-07-31
  And an AAPL put candidate expires 2026-08-21
  And earnings handling is "Flag only"
  When the screener scores AAPL
  Then the AAPL candidate is shown with a warning "⚠ Earnings 2026-07-31 — 21 days before expiry"

Scenario: Ranking demotes by earnings certainty, then score
  Given earnings handling is "Flag only"
  And KO has a known earnings date after expiry and scores 0.71
  And MSFT has a known earnings date after expiry and scores 0.50
  And NVDA's earnings date is unknown and scores 0.69
  And AAPL has earnings before expiry and scores 0.53
  When the screener ranks the results
  Then the order is KO, MSFT, NVDA, AAPL
  And only KO and MSFT carry a rank number; NVDA and AAPL show "—"
  # Three tiers, matching the us-66 mockup's `earnings` state: clean candidates
  # first, then unknown/unavailable, then earnings-in-window. Score orders
  # within a tier but never across one.

Scenario: Earnings on the expiration date is in the window
  Given AAPL's next earnings date is 2026-08-21
  And an AAPL put candidate expires 2026-08-21
  And earnings handling is "Exclude"
  When the screener scores AAPL
  Then the AAPL candidate is excluded with reason "earnings 2026-08-21 falls on or before expiry"

Scenario: No warning when earnings fall after expiration
  Given AAPL's next earnings date is 2026-09-05
  And an AAPL put candidate expires 2026-08-21
  When the screener scores AAPL
  Then no earnings warning is shown for the candidate

Scenario: Earnings beyond the alert horizon are still found
  Given the DTE window's furthest expiry is 45 days out
  When the screener fetches earnings dates
  Then the calendar is queried through at least the furthest expiry
  And an earnings date 37 days out is returned rather than reported as unknown

Scenario: Unknown earnings date surfaces a caution, not a silent pass
  Given the earnings calendar has no date for XYZ
  When the screener scores an XYZ candidate
  Then the candidate is shown with a caution "Earnings date unknown"
  And it is not silently treated as having no earnings

Scenario: Unknown earnings never hard-excludes, even in exclude mode
  Given the earnings calendar has no date for XYZ
  And earnings handling is "Exclude"
  When the screener scores an XYZ candidate
  Then the XYZ candidate is still scored and ranked with the "Earnings date unknown" caution
  And it is not excluded
  And it sorts below every candidate with a known clear earnings date

Scenario: Earnings-calendar outage does not suppress other results
  Given the earnings calendar is unreachable during the refresh
  When the screener runs
  Then candidates are still scored and ranked
  And each shows an "Earnings date unavailable" caution
  And no candidate is excluded for earnings

Scenario: Outage is distinguishable from a genuinely empty calendar
  Given the earnings calendar returns no events for XYZ
  And the earnings calendar request for ABC fails
  When the screener scores both candidates
  Then XYZ shows "Earnings date unknown"
  And ABC shows "Earnings date unavailable"
```

---

## Technical Notes

**Source.** Earnings dates come from the existing Finnhub auxiliary feed, `src/main/integrations/finnhub-earnings.ts` (shipped with US-56) — not Massive, which gates earnings behind a paid Benzinga add-on, and not Alpaca, which does not serve it. Reuse that module; do not add a second provider or route earnings through `MarketDataProvider` (see the adapter rules in `docs/spec/domain/market-data.md`).

**Two changes to `finnhub-earnings.ts` are prerequisites — this story is not a pure add-on:**

1. **Lookahead window.** `EARNINGS_LOOKAHEAD_DAYS` is hard-coded to 30, sized for US-56's ~7-day alert horizon. The screener's DTE window runs to 45+, so an earnings date at day 31–45 currently returns no event and renders as "unknown" — the exact silent pass this story exists to prevent. Make the lookahead a caller-supplied parameter and have the screener request coverage through its furthest expiry plus a small buffer.
2. **Outage vs. no-event.** `fetchNextEarningsDates` returns `Record<string, string>` and omits the ticker for _both_ a null date and a caught error, collapsing the two states this story must render differently. Widen the result to carry the distinction (e.g. `Record<string, { date: string } | { status: 'none' | 'unavailable' }>`) and update US-56's consumer at `src/main/services/evaluate-alerts.ts:171` accordingly. US-56's behaviour must not regress.

**Wiring.** US-67 left the seam open: `src/main/services/screener.ts:150` passes `earningsDate: null` into the engine. Replace that with a real fetch; the engine (`src/main/core/screener.ts`) stays pure and receives the earnings date as a plain value.

**Comparison.** Compare earnings date against expiration with `date-fns` (not string slicing). "In window" means **earnings ≤ expiration**, inclusive of the expiration date itself. No slip buffer in this story — a fixed rule that is easy to reason about beats a fudge factor with no AC behind it.

**Policy.** Earnings handling is the enum from US-67 (`exclude` default / `flag`). In exclude mode it is a **hard filter** in the US-65 engine — a high yield never rescues it. In flag mode the candidate stays, carries the warning, and sorts below every unflagged candidate regardless of score.

**Unknown is never a filter.** An unknown or unavailable date produces a caution only, in both modes. Hard-excluding on unknown would let one free-tier gap or an expired API key silently empty the results table. It does, however, demote in the ranking — see the three-tier sort AC.

**Failure isolation.** Per the [alert-evaluation-failure-isolation ADR](../../spec/architecture/02-adrs/alert-evaluation-failure-isolation.md), an earnings-service outage degrades to a per-candidate "unavailable" caution and never suppresses the rest of the run.

**Rate limit.** Finnhub's free tier allows 60 req/min and the module issues one request per ticker via `Promise.all`. The 12-hour cache absorbs steady-state load, but a cold run over a large watchlist can burst past the limit — cap concurrency in the batch wrapper.

---

## Out of Scope

- Ex-dividend / other corporate-event warnings (informational badges, future)
- Earnings warnings on already-open positions (that is the Epic 07 earnings-proximity alert, US-56)
- **BMO/AMC timing and confirmed-vs-estimated flags.** Finnhub's rows carry an `hour` field the module currently strips, and the free tier exposes no confirmation flag at all. Judging an AMC print on expiration Friday as harmless is a real refinement, but it needs a verified live payload behind it — deferred to a follow-up rather than half-specified here.
- Earnings badge on watchlist rows (that is US-96 — same earnings-calendar source, but a different surface: the bench, not the ranked results, and keyed to a fixed ~7-day window rather than earnings ≤ expiry)
- Evaluating alternative earnings providers — Finnhub is the decided source (US-56); switching vendors is a separate decision

---

## Dependencies

- US-65: scoring engine applies the exclude/flag decision
- US-66: results table renders the warning/caution
- US-67: earnings-handling toggle (exclude vs flag)
- US-56: supplies the Finnhub earnings feed this story extends (lookahead parameter + outage-vs-no-event result); its alert behaviour must not regress
- External: Finnhub free-tier API key (`finnhub-credentials.ts`) — already provisioned for US-56

---

## Estimate

5 points — raised from 3: the story also widens the shared `finnhub-earnings.ts` module (lookahead parameter, outage-vs-no-event result type) and updates US-56's consumer.

## Mockup

Covered by the US-66 ranked-results mockup (`mockups/us-66-screener-results.mdx`) — includes the earnings-flag and earnings-unknown states.
