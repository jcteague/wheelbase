# US-121 review: proposed changes to OPT-27

Story: https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping
Reviewed 2026-09-16 against `main` at 499b333, the `wb-ivr-fixes` worktree, and Alpaca's
market-data docs. This file is a review note. The story itself is edited only in Linear.

## Verdict

The design (persist the IV30 series, derive rank/percentile/range on read, store inputs,
pure engine in `src/main/core/`, per-ticker isolation, read never fetches) is right and
consistent with the ADRs and `CLAUDE.md`. The story is not plannable as written because
its primary data input does not exist at Alpaca and two of its "Done" dependencies are on
an unmerged branch.

## 1. Data source: Alpaca has no historical option quotes

Alpaca's options history offers bars, trades, latest quote, snapshot and chain. There is
no time-range quotes endpoint (the `/reference/optionquotes` page is a 404 and the
alpaca-py client has no such method). The story's verification table only proved bars.

Consequences for the Technical Notes as written:

- "Prefer the closing quote mid over the trade close" has no input. The fallback chain
  collapses to trade close, which the story itself says embeds intraday drift.
- Put-call parity needs a call and a put priced at the same instant. Bars and trades
  cannot supply that, so "eliminate the rate and dividend guess" cannot be done as stated.
- "Reject quotes wider than a configured spread threshold" has nothing to read.
- Today's reading would naturally come from the snapshot's real quote while history comes
  from trades. That is the apples-vs-oranges the story forbids.

### Proposed methodology

Rank only needs a series that is consistent with itself, so use the cheapest input that
Alpaca does serve and compute today the same way.

| Input                                                                        | Source                                    | One-year AAPL backfill cost |
| ---------------------------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| Daily bar VWAP (`vw`) of the option, paired with the underlying's daily VWAP | `/v1beta1/options/bars`, `timeframe=1Day` | 2 to 4 pages                |
| Hour bars, last hour of the option paired with the stock's last hour         | same, `timeframe=1Hour`                   | 10 to 20 pages              |
| Minute bars, last print paired with the stock's minute bar                   | same, `timeframe=1Min`                    | a few hundred pages         |

Recommended: daily VWAP against daily VWAP, with the following gates and choices.

- **Liquidity gate**: the bar's trade count `n` below a threshold rejects the strike.
  This replaces the spread-width gate.
- **Forward**: drop the implied forward. Use a stated risk-free rate (and per-ticker
  dividend yield if wanted). Store the rate used beside the reading so a later change
  recomputes cleanly.
- **Today's reading**: computed from today's daily bar VWAP by the same engine. The
  snapshot's quote and Alpaca's `impliedVolatility` are not used for the rank.
- **Upgrade path**: the stored inputs record which method produced each row, so moving
  to hour bars later is a recompute, not a refetch.

### Gherkin changes

Remove:

- "A day the ATM contract never traded still yields a reading" (needs a closing quote).
- Any spread-threshold language.

Rewrite:

- "A day with neither a trade nor a usable quote is left as a gap" becomes "A day with no
  trade in the ATM contracts is left as a gap".
- "Today's reading is computed the same way as the history" keeps its intent; the
  inputs named become the day's bar and the underlying's bar.

Add:

- A trade-count gate scenario: a strike whose daily bar has fewer than N trades is skipped
  and the adjacent strike is tried.

## 2. Dependencies marked Done are not on `main`

US-100 (OPT-6) and US-116 (OPT-8) are Done in Linear. Their code exists only on the
`wb-ivr-fixes` worktree (commits "moved calendar and status to market provider" and
"collect ivr on watchlist and outside market hours", last commit 2026-09-15). On `main`:

- `getMarketCalendar` is still on `BrokerProvider`, not `MarketDataProvider`.
- `observed_at` is still the fetch instant from the scraper, not the session close.
- `watchlist:add` triggers no collection.

The scenario "Adding a ticker does not wait on its backfill" and the session-close
`observed_at` semantics both presume that branch.

Proposed change: add to Dependencies that `wb-ivr-fixes` must merge before this story
starts, or correct the Linear statuses of OPT-6 and OPT-8 to reflect reality.

## 3. The "no broker needed" claim is about ports, not credentials

The market-data provider resolves credentials through `loadActiveAlpacaCredentials`, the
same Alpaca key pair the broker uses. In the settings service, market data reads as
configured only when a broker environment is active or the env fallback is set. An install
with no Alpaca keys gets no IV history at all.

Proposed change to Context: state that the port rule is preserved, but IV rank now
requires Alpaca market-data credentials, which is a regression from the credential-free
scrape and is accepted because the scrape is dead. Remove the Out of Scope line that
rejects Tastytrade for "requiring a brokerage credential", since this approach does too.

## 4. Thresholds are named but not numbered

Every gate must carry a number before tests can be written:

| Gate                  | Story today            | Needs                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------- |
| Minimum window length | "60 days shows n/a"    | the pass threshold (e.g. 200 of 252 sessions)                   |
| Density               | "150 of 252 shows n/a" | the pass threshold                                              |
| Near-expiry exclusion | "under 7 DTE"          | add the 7-DTE boundary row to the outline (7 is used)           |
| Liquidity             | none                   | minimum trade count `n`                                         |
| Rounding              | "25", "71"             | the pipeline stores 1dp; 180/252 is 71.4. Decide integer or 1dp |
| Percentile ties       | none                   | define as fraction of readings strictly below today's           |

## 5. Fetch-cost reasoning

"Roughly 5 calls per ticker, each call returns a contract's full date range" assumes a
handful of contracts. ATM strikes and bracketing expirations move all year; a 52-week
series touches on the order of 100 to 200 distinct contracts. Bars accept 100 symbols per
call and 10,000 bars per page, so the total is still small, but the paragraph should be
rewritten from the table above.

Two planning questions the notes do not address:

- **Strike grid per ticker**: OCC symbols can be constructed without a chain lookup, but
  the listed strike increments differ per underlying and change with price.
- **Enumerating expired contracts**: the chain snapshot only lists live contracts. The
  plan needs a way to know which strikes existed on a past date, or a probe strategy that
  tolerates misses.

## 6. Offline test seam

Six e2e specs and `fake-ivr.ts` program per-ticker Barchart `IVRResult` outcomes through
`_test:ivr-set-outcomes` and `WHEELBASE_FAKE_IVR`. The new pipeline needs a fake at a
different layer. Proposed change: add a Technical Note naming the seam, either fake option
and stock bars fed to the real engine, or a fake IV30 series written directly.

## 7. Barchart rows and the read path

Freshness reads the latest `ivr_snapshot` row. If Barchart rows stay readable, the read
path must prefer the series-derived reading over them. Proposed decision: retire Barchart
rows from the read path now (keep the table for provenance). They pass the ten-session
stale boundary within two weeks regardless. Note that the
`barchart-as-canonical-ivr-source` ADR is superseded when this ships.

## 8. Minor

- "A corrected reading updates every derived metric" reads like an edit feature. State
  that correction happens via recompute from stored inputs.
- The 8-point estimate looks light for a new pure engine, migration, backfill, daily job,
  read path, fake seam and e2e. Consider splitting: engine plus series plus backfill
  first, read path plus display second.

## Unchanged and endorsed

Series-not-derived storage, stored inputs, total-variance interpolation, per-ticker
isolation, read-never-fetches, idempotent backfill keyed on (underlying, session), and
the Out of Scope list apart from the Tastytrade line. The rank arithmetic in the
scenarios checks out (0.2475 in a 0.18 to 0.45 range is rank 25; 180 of 252 is
percentile 71).

## Sources

- https://docs.alpaca.markets/us/reference/optionbars
- https://docs.alpaca.markets/us/reference/optiontrades
- https://docs.alpaca.markets/us/docs/historical-option-data
- https://alpaca.markets/sdks/python/api_reference/data/option/historical.html
