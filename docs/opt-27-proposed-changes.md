# OPT-27 / US-121 — Proposed changes from review

[Linear issue](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping)

This document summarizes review recommendations and unresolved decisions. It is not
an implementation plan or a replacement for the story in Linear. No story changes
have been applied.

## 1. Validate near-close minute bars as the historical input

Evaluate replacing the proposed historical quote-first methodology with near-close
one-minute option bars. Alpaca documents historical option bars and trades; historical
closing bid/ask quotes have not been established by the evidence reviewed.

- Select eligible call and put bars within a defined interval before the actual
  session close, paired with the underlying's corresponding minute. Account for early
  closes and use an explicit exchange timezone.
- Define the permitted timing mismatch, contract selection and adjacent-strike fallback.
  Minute bars bound timing uncertainty but do not guarantee simultaneous trades.
- Leave a gap when suitable inputs cannot be found. Bars cannot supply a quote-only
  observation on a day when the selected contract never traded.
- Replace quote-specific requirements, including the bid/ask spread check, with quality
  checks supported by the selected inputs. Volume and trade count are available, but
  they do not establish a tight spread.
- Use the same input type, feed policy, selection rules and IV engine for history and
  daily collection. Do not mix locally inverted historical IV with vendor IV today.

Before adopting this approach, measure full-window coverage for AAPL, MSFT, NVDA and
SPY, including both expirations and the strikes required for interpolation. Measure
request count, pagination and runtime; the story's roughly five-request estimate has
not been validated for minute-bar collection. The existing daily-bar probes do not
establish minute-bar coverage.

## 2. Complete the pricing methodology

The proposed forward formula, `F = K + exp(rT) * (C - P)`, still requires an interest
rate. Forward-based inversion also requires a discount factor. Specify a rate source
or calibration method and retain the resulting inputs for replay.

Deriving the forward from the same call/put pair makes their European-model inverted
IVs agree algebraically; averaging those IVs does not independently cancel rate error.
Define the treatment of American exercise and dividends, including the limits of any
approximation.

Keep total-variance interpolation to 30 days. Complete the rules for interpolation
across strikes, exactly 30-DTE contracts, missing bracketing expirations after the
seven-day exclusion, invalid prices and failed inversion.

## 3. Define the history publication gate precisely

Choose the window convention: 52 calendar weeks or a fixed number of completed
exchange sessions. Specify the minimum coverage, whether the current reading belongs
in the window, percentile tie handling, rounding, and behavior when the high equals
the low. Define the window anchor when the latest reading is stale.

Specify whether insufficient history withholds all derived metrics or only IV rank.
Extend cached calendar coverage to the complete backfill window: the current store
reads 45 days back and refreshes 120 days back, which is insufficient on a fresh install.

## 4. Keep series storage and make replay promises accurate

Retain daily IV30 and its inputs, derive rank/percentile/range on read, and preserve
aged-out history. Decide deliberately between typed inputs and versioned JSON.

Retain every strike and expiration used, relevant timestamps, price provenance,
feed, discount inputs and methodology version. Preserve session-close semantics for
`observed_at`.

Limit the no-refetch guarantee to calculations reproducible from retained inputs.
Correcting a selection defect may require a previously discarded strike or expiration;
either retain the candidates needed for that correction or document that limitation.

## 5. Clarify credentials and provider boundaries

Separate independence from `BrokerProvider` from availability without credentials.
The current Alpaca market-data adapter requires credentials, and market-data and
broker factories share their credential resolver.

Define behavior with market-data credentials but no broker connection, and separately
with no credentials or stored history. Keep market-data capabilities behind
`MarketDataProvider`, including the historical data and calendar capabilities needed
for this workflow.

## 6. Scope database-only reads to IV metrics

Change the proposed zero-network promise to cover reading IV metrics. The existing
bench snapshot fetches stock quotes; prohibiting every market-data request during
bench viewing would expand this story into live-price loading changes.

Specify where percentile appears alongside the range and freshness information in
the existing IVR tooltip, including unavailable and legacy-source states.

## 7. Define collection recovery and source transition

Specify backfill for existing tickers, asynchronous collection after adding a ticker,
catch-up after missed sessions, and recovery after interruption. Define how incomplete
sessions are retried and how backfill and daily collection interact. A primary key
prevents duplicate rows but does not itself define resumable work.

Preserve per-ticker failure isolation. Choose explicitly whether legacy Barchart rows
remain a fallback or are retired, how sources are selected during warm-up, and when
the old collector stops running.

## 8. Extend validation to the decision path

Verify that computed IV rank reaches both the bench condition and the screener floor:
a usable rank below the floor excludes a candidate, equality passes, and unavailable
or stale readings preserve the existing behavior. Verify that corrections propagate
to all derived metrics and that IV reads and supported local recomputation make no
provider requests.

Prioritize data coverage and pricing-method validation before committing to the full
implementation. These determine whether the proposed history can support a trustworthy
rank.

## References

- [Alpaca historical option bars](https://docs.alpaca.markets/us/reference/optionbars)
- [Alpaca historical option trades](https://docs.alpaca.markets/us/reference/optiontrades)
- [Alpaca option data feeds](https://docs.alpaca.markets/us/docs/historical-option-data)
- [OIC pricing-model guidance](https://www.optionseducation.org/advancedconcepts/black-scholes-formula)
- [Current market-data adapter](../src/main/integrations/alpaca-market-data.ts)
- [Current calendar store](../src/main/services/trading-calendar-store.ts)
- [Current bench snapshot](../src/main/services/watchlist-snapshot.ts)
