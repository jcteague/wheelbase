# Quickstart: US-121 — IV rank from our own IV history

## Prerequisites

- `pnpm install` done; Node ABI for `better-sqlite3` matches the command you run (see below).
- No Alpaca credentials are needed for any test: unit tests mock the provider, e2e uses
  `FakeMarketDataProvider`. The live spike (`scripts/spike-iv-history.mjs`) is the only thing that
  talks to Alpaca and is not part of the test run.

## Migrations

`migrations/016_create_iv30_history.sql` creates `iv30_reading` and `iv30_gap`. The runner applies
it at startup and in `makeTestDb()`; nothing to do by hand. It also drops `ivr_snapshot` (007); `trading_session` (015) is unchanged.

## Unit + integration tests (Vitest)

```bash
pnpm rebuild:node          # only when switching from an e2e run
pnpm test                  # whole suite
pnpm test -- src/main/core/black-scholes src/main/core/iv30 src/main/core/iv-metrics   # engine only
pnpm test -- src/main/services/iv-history src/main/services/ivr-collector src/main/services/ivr-snapshots
pnpm test -- src/main/integrations/alpaca-market-data src/main/integrations/fake-market-data
pnpm test -- src/renderer/src/components/IvrCell src/renderer/src/lib/ivr-tooltip
```

Passing criteria: every file green, `pnpm lint` clean, `pnpm typecheck` clean, `pnpm format`
applied. The `ipc/*.test.ts` files flake under CPU load (5 s first-case timeout) — rerun in
isolation before investigating.

## E2E (Playwright `_electron` via Vitest)

```bash
pnpm rebuild:electron      # Electron ABI — required after any `pnpm test`
pnpm test:e2e              # builds, then runs every e2e/*.spec.ts (bail on first failure)
pnpm build && npx vitest run --config vitest.e2e.config.ts e2e/iv-history.spec.ts   # this story only
```

Symptom of the wrong ABI: `NODE_MODULE_VERSION <n> … requires <m>` from Vitest, or an e2e hang on
`waiting for event 'window'`. If e2e reports `Electron failed to install correctly`:
`node node_modules/electron/install.js && pnpm rebuild:electron`.

### What the e2e harness needs

- Launch env: `FAKE_MARKET_DATA=true`, `WHEELBASE_FAKE_NOW=<ISO>` (the shared fake clock),
  `WHEELBASE_FAKE_IV_SERIES=<JSON>` (the programmed series; see `contracts/test-iv-history.md`),
  and no `WHEELBASE_FAKE_IVR` — that variable is retired.
- Series fixtures are built by helpers in `e2e/ivr-helpers.ts`: `seriesForRank(rank, opts)`,
  `seriesWithRange({ low, high, today, ... })`, `seriesWithPercentile(...)`,
  `seriesEndingSessionsAgo(k)`. All anchor to `FAKE_NOW_DAY` and the weekday calendar.
- Assertions read `_test:iv30-history`, `_test:iv30-gaps`, `_test:daily-bar-requests`; the bench
  is read through `ivrCell(page, ticker)` / `hoverIvrRing` as in `e2e/ivr-staleness.spec.ts`.

## Verifying against the live account (optional, manual)

```bash
ALPACA_KEY_ID=… ALPACA_SECRET_KEY=… ALPACA_PAPER=true pnpm dev
```

Add AAPL to the watchlist; within ~10 s the card's IVR cell should resolve from `n/a` to an
integer with a tooltip naming the 52-week range. `pino` INFO lines to look for:
`iv_history_collected` (readings/gaps per ticker), `IVR snapshot collection completed`. Compare the
rank against the spike table in the Linear story (AAPL read 36 on 2026-09-18); the SIP feed will
move it by a point or two.
