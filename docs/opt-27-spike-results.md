# OPT-27 / US-121 — Spike results: IV30 history from Alpaca option bars

[Linear issue](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping)

Run 2026-09-18 with `scripts/spike-iv-history.mjs` against the repo's Alpaca market-data
credentials (free plan, no OPRA agreement). Window 2025-09-18 to 2026-09-17, 251 sessions.
Tickers AAPL, MSFT, NVDA, SPY. This answers the open question in both review notes: can
Alpaca bars support a self-computed, self-consistent IV30 series, and which timeframe.

## Method

- Sessions and closes from the underlying's IEX daily bars; session close times from
  `/v2/calendar` (early closes handled, ET converted to UTC explicitly).
- For each session, the two Friday expirations bracketing D+30 (a Friday holiday shifts
  to the prior session). Exactly 30 DTE uses a single expiry.
- OCC symbols constructed without a chain lookup. ATM strike candidates at 0.5, 1, 2.5 and
  5 increments around the close, nearest first; the nearest strike whose call **and** put
  both have a bar passing the trade-count gate (n ≥ 5) wins.
- IV per expiry = mean of call and put Black-Scholes IV, European, r = 4.5%, no dividend.
  IV30 by linear interpolation of total variance.
- **Daily**: option daily VWAP against the stock's daily VWAP.
- **Minute**: last 1-minute option bar in the 15 minutes before the real close, against
  the stock's 1-minute bar at that minute.

## Results

| Ticker | Daily: sessions with full inputs | Daily cost    | Minute: full / partial | Minute staleness median / p90 | Minute cost     | Daily vs minute IV30 corr | Mean abs IV diff |
| ------ | -------------------------------- | ------------- | ---------------------- | ----------------------------- | --------------- | ------------------------- | ---------------- |
| AAPL   | 251 / 251                        | 25 req, 2.9 s | 181 / 70               | 1 min / 7 min                 | 263 req, 24.7 s | 0.972                     | 0.005            |
| MSFT   | 251 / 251                        | 35 req, 8.8 s | 141 / 108              | 2 min / 10 min                | 285 req, 78.2 s | 0.990                     | 0.006            |
| NVDA   | 251 / 251                        | 28 req, 8.7 s | 215 / 36               | 1 min / 4 min                 | 294 req, 78.4 s | 0.985                     | 0.007            |
| SPY    | 251 / 251                        | 30 req, 7.4 s | 229 / 22               | 1 min / 5 min                 | 298 req, 79.0 s | 0.988                     | 0.003            |

IV30 series and rank produced by each method:

| Ticker | Daily IV30 today / min / max | Daily rank / pctl | Minute IV30 today / min / max | Minute rank / pctl |
| ------ | ---------------------------- | ----------------- | ----------------------------- | ------------------ |
| AAPL   | 23.2 / 17.5 / 33.5           | 36.0 / 22.0       | 23.8 / 17.0 / 31.7            | 46.6 / 29.4        |
| MSFT   | 24.9 / 19.0 / 48.4           | 20.1 / 21.2       | 25.9 / 19.9 / 47.0            | 22.0 / 21.4        |
| NVDA   | 31.4 / 31.0 / 55.3           | 1.5 / 0.4         | 30.7 / 31.1 / 55.6            | -1.7 / 0.0         |
| SPY    | 12.4 / 11.0 / 27.3           | 8.5 / 7.6         | 12.5 / 11.0 / 26.8            | 9.1 / 6.6          |

Zero inversion failures in either method. Whole run: 1259 requests, 102 rate-limit retries
(all in the minute pass).

## Findings

1. **IVR from Alpaca bars is feasible.** Daily bars gave a complete 251-session IV30
   series for every ticker, no gaps, with plausible levels and a coherent 52-week range.
   The story's design (persist IV30, derive rank on read, same engine for history and
   today) is confirmed workable on this plan.

2. **Daily VWAP is the better input.** The two methods agree to within about half a vol
   point on average (correlation 0.97 to 0.99). Daily costs roughly 30 requests per ticker
   for a full backfill and has no gaps. Near-close minute bars cost roughly 10x, hit the
   free-plan rate limit, and leave 9% to 43% of sessions without all four legs inside a
   15-minute window. Widening the window buys coverage at the price of staleness, which
   removes the reason to prefer minutes.

3. **The rank is sensitive to method only at the margins.** Rank differences were 0.6 to
   3.2 points for three tickers and 10.6 for AAPL, where the two methods disagree on the
   52-week high. This is the apples-vs-oranges effect the story warns about, and it is
   why history and today must use one method.

4. **Constructing OCC symbols without a chain works.** Probing four strike increments and
   tolerating misses found a valid call/put pair on every session. About 35% to 60% of
   probed symbols had data, so the plan should expect and ignore misses rather than treat
   them as errors.

5. **Explicit `end` on the current date is rejected with 403 "OPRA agreement is not
   signed".** Ending on a prior session, or omitting `end`, succeeds. Verified at 18:46 ET
   on 2026-09-18 that with `end` omitted the current session's option daily bar and SIP
   stock bar are both returned, so the daily job can run the same evening as long as it
   never names today as `end`.

6. **Edge cases surfaced.** NVDA's current IV30 sits below its 52-week low on the minute
   method, giving a negative rank. The engine must clamp rank to 0..100 or define the
   behaviour. Trade counts per daily bar averaged 140 to 470, so an n ≥ 5 gate is
   generous on liquid names; thin tickers will need real testing.

## Thin names (second run, daily bars only)

Eight thinner or lower-priced wheel-style names were run after the first pass. Four
selection variants were compared: the original rule (weekly Fridays bracketing D+30, trade
gate n ≥ 5), the same with a **monthly fallback** (3rd-Friday expirations bracketing D+30
when the weekly pair fails the gate), and both with the gate lowered to **n ≥ 1**.

Sessions with a full IV30 reading, out of 251:

| Ticker | Avg share vol / day | Avg $ vol / day | Weekly, n ≥ 5 | + monthly fallback | Weekly, n ≥ 1 | n ≥ 1 + monthly fallback |
| ------ | ------------------- | --------------- | ------------- | ------------------ | ------------- | ------------------------ |
| F      | 65.6M               | 0.9B            | 242           |                    |               |                          |
| SOFI   | 66.1M               | 1.1B            | 251           |                    |               |                          |
| INTC   | 114.7M              | 12.5B           | 249           |                    |               |                          |
| KO     | 16.7M               | 1.5B            | 151           | 249                | 250           | 251                      |
| DKNG   | 14.0M               | 0.3B            | 73            | 243                | 227           | 251                      |
| PINS   | 16.2M               | 0.3B            | 48            | 189                | 212           | 249                      |
| CHWY   | 8.2M                | 0.2B            | 38            | 214                | 203           | 251                      |
| ETSY   | 3.6M                | 0.3B            | 8             | 109                | 75            | 235                      |

Diagnosis, from sampling individual sessions: the weekly expirations _exist_ 5 to 6 weeks
out on all of these names, so the bracketing symbols are found. What fails is the trade
gate. Thin weekly bars near the money carry 1 to 13 trades a day while the monthly
expiration on the same day carries 45 to 678. The problem is contract selection, not data
availability.

Findings:

1. **Monthly fallback plus n ≥ 1 gives 235 to 251 of 251 on every thin name tested.**
   All clear the 200-of-252 coverage gate. With the original rule, five of eight would
   read `n/a` forever.
2. **The gate changes the number only at the margins.** CHWY's rank was 30.6 under
   n ≥ 5 with monthly fallback and 28.4 under n ≥ 1; the IV30 ranges differ by 1 to 3
   vol points at the extremes. Storing the trade counts per reading keeps a stricter
   read-time gate possible without refetching.
3. **Share volume on the underlying is a weak proxy for option-history coverage.**
   KO and PINS trade the same 16M shares a day but covered 151 and 48 sessions under
   the original rule. Dollar volume ranks the names a little better but KO still breaks
   it: a large, low-IV stock has quiet options. The option bar's own trade count is the
   direct measure and comes free with the bars, so nothing needs to be inferred from the
   stock.

## Not covered by this spike

- Names priced under 10 or over 1000, and names with only monthly expirations listed.
- The underlying was priced from **IEX** daily bars. IEX VWAP differed from consolidated SIP
  VWAP by about 0.25% on 2026-09-18 (335.29 vs 336.10 for AAPL), roughly a vol point on an
  ATM inversion. The story specifies SIP; the spike series is self-consistent but should
  not be compared numerically to a SIP-based one.
- Dividends and American exercise were ignored. Puts on SPY, KO and AAPL near ex-dates
  carry a small upward bias that a stated dividend yield would remove.
- Hour bars were not run; daily was sufficient.

## Recommendation for the story

Adopt daily option bar VWAP paired with the underlying's daily VWAP as the input for both
backfill and the daily job, as the root review proposed. Select the weekly Friday pair
bracketing 30 DTE first and fall back to the 3rd-Friday monthly pair when any leg of the
weekly pair has no trade. Require at least one trade per leg and store the trade counts
with the reading. Drop the near-close minute approach, or keep it only as a stored
`method` value for a later recompute. Carry the stated rate stored with each reading, the
"request through the prior session" constraint, and rank clamping into the Technical
Notes. Do not screen tickers by share volume; coverage is measured directly by the
200-of-252 gate.
