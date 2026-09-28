---
page: docs/spec/architecture/02-adrs/fake-provider-synthesises-bars-from-iv-series.md
audited_at: 2026-09-28
findings: 10
---

# Audit: docs/spec/architecture/02-adrs/fake-provider-synthesises-bars-from-iv-series.md

## Verified (8)

- ✓ `FakeMarketDataProvider.getOptionDailyBars` prices bars with the real `blackScholesPrice` from `core/black-scholes` at the session IV (flat surface) — `src/main/integrations/fake-market-data.ts:15,198-209,295`.
- ✓ `getStockDailyBars` serves the fixture price as VWAP — `src/main/integrations/fake-market-data.ts:319-333`.
- ✓ `FakeIvSeriesFixture` shape with `price`, `tradeCount?`, `weeklyTradeCount?`, `latencyMs?`, `failWith?`, `sessions`, and per-session `untraded` — `src/main/integrations/fake-market-data.ts:89-103`.
- ✓ Loaded from `WHEELBASE_FAKE_IV_SERIES` at construction (`:222,227`) and replaced via `_test:iv-series-set` (`src/main/ipc/test-iv-history.ts:22`).
- ✓ Every bar request recorded as `{ kind, underlying, start, end }` (`fake-market-data.ts:104-109`) and exposed via `_test:daily-bar-requests` (`src/main/ipc/test-iv-history.ts:50`).
- ✓ "Monthly" decided locally — `isMonthlyExpiration` / third-Friday comment, `fake-market-data.ts:155-184`.
- ✓ `fake-ivr.ts` removed; `WHEELBASE_FAKE_IVR`, `_test:ivr-set-outcomes`, `_test:ivr-fetch-log` absent from `src/` and `e2e/`. Fake clock in `src/main/integrations/fake-clock.ts` (`WHEELBASE_FAKE_NOW` at `:20`), `_test:ivr-set-now` at `src/main/ipc/test-iv-history.ts:28`.
- ✓ Linked files exist: `plans/us-121/contracts/test-iv-history.md`, `e2e/ivr-helpers.ts`, `./dev-only-test-scheduler-ipc.md`, feature page us-121, extract us-121.

## Drift (0)

None.

## Unverifiable (2)

- ? Size figures (~6 KB vs ~80 KB, Linux 128 KB per-env limit) — external/estimate.
- ? Known limits ("never returns partial bars or entitlement 403s, holds spot constant") — broadly consistent with `fake-market-data.ts` (`failWith` limited to `network_error | rate_limited | unknown`, `:99`) but an exhaustive negative.

## Missing files (0)

None.
