# ADR: The IV-history e2e seam is a fake provider that synthesises bars from a programmed IV series

<!-- generated:from us-121 -->

## Decision

`FakeMarketDataProvider.getOptionDailyBars` prices every requested OCC symbol, for every fixture
session, with the **real** `core/black-scholes.ts` pricer at that session's target IV (a flat vol
surface). The real engine's selection, gates and total-variance interpolation therefore run end to
end and invert back to exactly the programmed number. `getStockDailyBars` serves the fixture price
as VWAP.

- The fixture (`FakeIvSeriesFixture`, ticker → `{ price, tradeCount?, weeklyTradeCount?, latencyMs?,
failWith?, sessions }`) is loaded from `WHEELBASE_FAKE_IV_SERIES` at boot and replaced through
  `_test:iv-series-set`. A session spec can mark legs `untraded` or set trade counts to push the
  engine onto a neighbour strike, the monthly tier, or a gap.
- Every bar request is recorded (`kind`, `underlying`, `start`, `end`) and exposed via
  `_test:daily-bar-requests`, so "no request was made" and "no request named today as `end`" are
  assertable.
- The fake decides "monthly" locally; only the pricer is shared with production code.
- `fake-ivr.ts`, `WHEELBASE_FAKE_IVR`, `_test:ivr-set-outcomes` and `_test:ivr-fetch-log` are gone.
  The fake clock (`WHEELBASE_FAKE_NOW`, `_test:ivr-set-now`) moves to `integrations/fake-clock.ts`,
  unchanged in behaviour.

## Why

- The story names the seam: "fake option and underlying bars fed to the real engine".
- A series is ~6 KB per ticker (252 numbers) instead of ~80 KB of literal bars — which would exceed
  Linux's 128 KB per-env-variable limit once four tickers are seeded.
- No copy of the pricer or of expiration selection in `e2e/`; a session's expected IV30 is exactly
  the number the spec wrote down. A flat surface means the fake needs no knowledge of which strikes
  the engine will choose.

## Alternatives considered

- **Literal bars programmed from `e2e/`** — needs a Black–Scholes copy and a mirror of selection in
  the test tree.
- **Writing an `iv30_reading` series directly** — skips selection, gates and interpolation, the parts
  the story wants exercised.

## Known limit

The fake never returns partial bars or entitlement 403s, holds spot constant, and "lists" every
strike and Friday.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "The e2e seam is a fake provider…"
- `plans/us-121/contracts/test-iv-history.md`
- `src/main/integrations/fake-market-data.ts`, `src/main/integrations/fake-clock.ts`, `src/main/ipc/test-iv-history.ts`, `e2e/ivr-helpers.ts`
- Related: [dev-only-test-scheduler-ipc](./dev-only-test-scheduler-ipc.md)
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
