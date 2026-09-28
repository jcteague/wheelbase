---
page: docs/spec/architecture/02-adrs/iv30-from-daily-bar-vwap.md
audited_at: 2026-09-28
findings: 10
---

# Audit: docs/spec/architecture/02-adrs/iv30-from-daily-bar-vwap.md

## Verified (9)

- ✓ Option price = contract daily-bar `vw`; the mapped `DailyBar` carries `vwap`, `close`, `volume`, `tradeCount` and no IV field — `src/main/core/iv30.ts:28-34`, `mapDailyBar` in `src/main/integrations/alpaca-market-data-mappers.ts:367-375`.
- ✓ Underlying = SIP daily bar — `DAILY_STOCK_FEED = 'sip'`, `alpaca-market-data-mappers.ts:314`; used as `spot` in `computeIv30` (`iv30.ts:174-179`).
- ✓ `r = 0.045`, `q = 0` defaults, stored per reading — `DEFAULT_RISK_FREE_RATE = '0.0450'`, `DEFAULT_DIVIDEND_YIELD = '0.0000'` (`iv30.ts:20-21`), `rate`/`dividend_yield` columns in `migrations/016_create_iv30_history.sql`.
- ✓ Call and put inverted at the chosen strike and averaged; interpolated in total variance with `T = DTE/365`, `σ30 = σ_near` when `far` is null — `iv30.ts:24,86-93`.
- ✓ One engine: `computeIv30` in `src/main/core/iv30.ts:162`.
- ✓ Pricer in IEEE doubles: Abramowitz–Stegun CDF, bisection on `[0.001, 10]` for 100 iterations, `null` at/below discounted intrinsic — `src/main/core/black-scholes.ts:16-21,46-59`.
- ✓ Decimal applied only at storage (`fourDp`, `iv30.ts:66`) and in rank/percentile rounding (`src/main/core/iv-metrics.ts:16-18`).
- ✓ Opening line "IV rank is computed from the app's own IV30 series" matches the retirement of Barchart (`migrations/016_create_iv30_history.sql:1,53-55`).
- ✓ Cited files exist: `plans/us-121/research.md`, `docs/opt-27-spike-results.md`, `src/main/core/black-scholes.ts`.

## Drift (0)

None.

## Unverifiable (1)

- ? Spike figures (10-rank-point disagreement, half-a-vol-point agreement, 251/251 sessions, 9-43% incomplete minute sessions) and "daily bars back to January 2024 on the free plan" — external/experimental.

## Missing files (0)

None.
