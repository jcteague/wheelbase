# ADR: IV30 is inverted from daily bar VWAP against a stored constant rate

<!-- generated:from us-121 -->

## Decision

IV rank is computed from the app's own IV30 series. For each session and each selected
expiration:

- **Option price** = the contract's Alpaca daily bar `vw` (VWAP).
- **Underlying** = the same session's SIP daily bar `vw`.
- Invert European Black–Scholes (no dividends; `r = 0.045`, `q = 0`, both stored on every
  reading) for the call and the put at the chosen strike, and average the two.
- Interpolate the near and far expirations to exactly 30 days in **total variance**:

```
T      = DTE / 365
λ      = (T30 − T_near) / (T_far − T_near)
w30    = σ_near² · T_near · (1 − λ) + σ_far² · T_far · λ
σ30    = sqrt(w30 / T30)          // far = null  →  σ30 = σ_near
```

Today's reading, the one-year backfill and the nightly catch-up all run this one engine
(`computeIv30` in `src/main/core/iv30.ts`). Alpaca's per-contract `impliedVolatility` is never
used for rank — `DailyBar` has no such field.

The pricer (`src/main/core/black-scholes.ts`) computes in IEEE doubles: an Abramowitz–Stegun
normal CDF and bisection on `[0.001, 10]` for 100 iterations, returning `null` when the price is
at or below discounted intrinsic. `Decimal` (`ROUND_HALF_UP`, 4 dp) is applied only when a reading
is stored, and for rank/percentile rounding. An implied volatility is a model output, not money.

## Why

- Alpaca serves no historical option quotes, so the story's earlier closing-mid / implied-forward
  design had no input. Daily bars are served back to January 2024 on the free plan.
- Rank is self-relative: the series only has to be consistent with itself. Mixing an inverted
  history with vendor IV for today would rank apples against oranges — the OPT-27 spike saw the
  two methods disagree on AAPL's 52-week high by 10 rank points.
- Daily VWAP agreed with near-close minute bars to within half a vol point, at a tenth of the
  request cost and with no coverage gaps (spike: 251/251 sessions, zero inversion failures).

## Alternatives considered

- **Near-close 1-minute bars** — 10× the requests, tripped the rate limit, 9–43% of sessions
  incomplete.
- **Implied forward from a simultaneous call/put quote** — no simultaneous historical quotes exist.
- **A risk-free rate series** — deferred; because the rate is stored with each reading, adding one
  later is a recompute, not a refetch.
- **`Decimal` throughout the pricer, or a Black–Scholes dependency** — slow bisection for no gain;
  the pricer is thirty lines.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADRs "IV30 is inverted from daily bar VWAP…", "The pricer uses `Number`…"
- `plans/us-121/research.md`, `docs/opt-27-spike-results.md`
- `src/main/core/iv30.ts`, `src/main/core/black-scholes.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
