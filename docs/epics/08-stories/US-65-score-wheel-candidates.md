# US-65: Score wheel candidates against configurable screening criteria

**As a** wheel trader comparing many strikes across many tickers,
**I want** each candidate strike scored and filtered against my criteria with an explainable rank,
**So that** the best risk-adjusted premium-selling entries float to the top and the untradeable or dangerous ones are excluded — with a visible reason.

---

## Context

Raw chains (US-64) are noise until they're filtered and ranked. A wheel trader first **disqualifies** the untradeable (illiquid, wide spread) and the structurally-wrong (outside the delta/DTE band), then **ranks** what survives by reward-per-risk. Per the domain briefing, the v1 rank is **yield-per-delta** — annualized return-if-flat divided by the strike's delta — because it directly answers "how much premium per unit of assignment probability?" and is fully explainable. Hard filters and the rank are kept separate so the trader sees _why excluded_ apart from _why ranked #3_. This is a pure core engine (`src/main/core/screener.ts`) — plain values in, scored candidates out, no I/O.

---

## Acceptance Criteria

```gherkin
Background:
  Given screening criteria are: delta band 0.20–0.30, DTE window 30–45,
    minimum open interest 500, maximum spread 10% of mark, earnings-in-window excluded
  And candidate marks and Greeks come from the pulled chain (US-64)

Scenario: Premium yield is computed on capital secured
  Given an AAPL 37-DTE put at the $180 strike with a mark of $2.70
  When the candidate is scored
  Then the period yield is 1.5% (2.70 / 180)
  And the annualized-return-if-flat is 14.8% (1.5% × 365 / 37)
  And the capital secured is $18,000 per contract (180 × 100)

Scenario: Rank is annualized yield per unit of delta
  Given candidate A is 0.30 delta yielding 30.0% annualized
  And candidate B is 0.20 delta yielding 24.0% annualized
  When the candidates are ranked
  Then candidate B ranks above candidate A
  And candidate B shows a higher yield-per-delta score (1.20 vs 1.00)

Scenario: Exclude a strike outside the delta band
  Given an AAPL put strike has a delta of 0.42
  And the delta band is 0.20–0.30
  When the candidate is scored
  Then the strike is excluded with reason "delta 0.42 outside 0.20–0.30"
  And a high yield does not rescue it into the ranked results

Scenario: Exclude an illiquid strike
  Given an AAPL put strike has open interest of 120
  And the minimum open interest is 500
  When the candidate is scored
  Then the strike is excluded with reason "open interest 120 below 500"

Scenario: Exclude a wide-spread strike
  Given an AAPL put strike has bid 2.40 and ask 3.00 (mark 2.70)
  And the maximum spread is 10% of mark
  When the candidate is scored
  Then the strike is excluded with reason "spread 22% exceeds 10%"

Scenario: Narrow absolute spread on a cheap option is not excluded
  Given a put strike has bid 0.08 and ask 0.15 (mark 0.115)
  And the maximum spread is 10% of mark OR $0.10 absolute
  When the candidate is scored
  Then the strike is not excluded for spread, because the $0.07 absolute spread is within tolerance

Scenario: Missing IV rank does not exclude a candidate
  Given the volatility service returns no IVR for AAPL
  When AAPL candidates are scored
  Then IV rank shows "n/a"
  And candidates are still ranked by yield-per-delta without an IVR contribution

Scenario: Best strike per ticker is selected
  Given AAPL has three strikes surviving the filters
  When the ticker's candidates are ranked
  Then the highest-scoring surviving strike represents AAPL in the results
```

---

## Technical Notes

- Pure engine at `src/main/core/screener.ts` — no DB, no provider imports (Architecture Rules). It receives already-fetched chain data, IVR, and earnings dates as plain values.
- Yield math with `decimal.js`, `ROUND_HALF_UP`:
  - `mark = (bid + ask) / 2`
  - `capital_secured = strike × 100` (per contract)
  - `period_yield = mark / strike`
  - `annualized_if_flat = period_yield × (365 / DTE)` — calendar 365, not 252 (that convention belongs to Epic 12 volatility math).
- v1 rank score = `annualized_if_flat / delta` (yield-per-delta). Keep it a single, reversible formula; richer multiplicative liquidity/IVR factors are deferred until interviews justify them.
- **Hard filters** (exclude, with a machine-readable reason): delta band, DTE window, minimum OI, max spread (`% of mark` OR absolute floor), price ceiling, earnings-in-window (US-70). A high score never rescues an excluded candidate.
- **Soft inputs** (rank only, never a default hard exclude): IV rank, volume. IVR is joined from US-45; when absent, drop it and rank on yield-per-delta alone — never exclude solely for missing IVR.
- Exclusions are returned alongside survivors (not silently dropped) so US-66 can show the reason.

---

## Out of Scope

- Rendering the ranked table (US-66)
- The settings UI to edit criteria (US-67 — this story consumes the criteria with built-in defaults)
- Earnings-date fetching (US-70 owns the earnings warning; this engine treats an earnings date as an input)
- Multiplicative liquidity/IVR scoring factors (deferred)
- PMCC scoring criteria (Epic 09)

---

## Dependencies

- US-64: pulled option-chain data
- US-45: current IVR service (soft rank input; degrades gracefully)

---

## Estimate

5 points

## Mockup

None — scoring, yield, and exclusion reasons are surfaced in the US-66 ranked-results mockup.
