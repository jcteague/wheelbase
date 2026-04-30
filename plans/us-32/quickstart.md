# Quickstart: US-32 — Live Underlying Price on Position List

This guide describes how to run the test suite for US-32 locally and verify the feature manually. No new persistent state — no migrations, no seed data.

## Prerequisites

- Node + pnpm installed (project standard).
- US-31 already merged (`MarketDataProvider`, `AlpacaMarketDataProvider`, `createMarketDataProvider` factory all exist).
- `better-sqlite3` rebuilt for both ABIs (per CLAUDE.md note):
  ```bash
  npx electron-rebuild -f -w better-sqlite3
  pnpm rebuild better-sqlite3
  ```

## Environment Variables

The unit and integration tests do **not** need real Alpaca credentials — every test mocks the `MarketDataProvider`. For E2E tests, the WebSocket subscription path is also mocked at the `window.api` level (see `e2e/helpers.ts` patch in the plan), so credentials remain unused in CI.

For manual smoke testing in `pnpm dev`, set:

```bash
ALPACA_KEY_ID=...
ALPACA_SECRET_KEY=...
ALPACA_PAPER=true
ALPACA_DATA_FEED=iex   # or sip if your account has it
```

## Running the Tests

### Unit + integration (Vitest)

```bash
pnpm test
```

US-32 adds the following test files; all should pass with no real broker calls:

- `src/main/integrations/alpaca-market-data.test.ts` — extended with new `prevClose` / `change` calculation cases.
- `src/main/ipc/market-data.test.ts` — new file: handler tests for `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`.
- `src/renderer/src/api/market-data.test.ts` — new file: adapter tests for the IPC bridge.
- `src/renderer/src/hooks/useStockQuotes.test.ts` — new file: hook tests with a fake `window.api`.
- `src/renderer/src/hooks/useMarketStatus.test.ts` — new file: TanStack Query polling test.
- `src/renderer/src/components/PriceCell.test.tsx` — new file.
- `src/renderer/src/components/MarketStatusPill.test.tsx` — new file.
- `src/renderer/src/components/StaleDataBanner.test.tsx` — new file.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — extended with new column + states.

### Lint, types, format

```bash
pnpm lint
pnpm typecheck
pnpm format
```

### E2E (Playwright)

```bash
pnpm test:e2e
```

US-32 adds `e2e/live-underlying-price.spec.ts`. The spec stubs `window.api.getStockQuotes`, `window.api.setStockQuoteTickers`, `window.api.onStockQuote`, `window.api.onStreamError`, and `window.api.getMarketStatus` from the Playwright page so no real WebSocket is opened.

> Per the user's `feedback_e2e_runs_in_claude` memory: `pnpm test:e2e` runs fine inside Claude Code's shell despite the CLAUDE.md note saying otherwise.

## Manual Smoke Test

1. Start the app in dev mode with real credentials:

   ```bash
   pnpm dev
   ```

2. Open at least one wheel position (any ticker — the test list AAPL/MSFT/TSLA in the mockup is a good fit).

3. On the Positions list page, confirm:
   - A new `Price` column appears between `Phase` and `Strike`.
   - During regular hours, each row shows the live price + signed change in green/red. The market status pill (top-right of the page header) shows `LIVE` with a green pulsing dot.
   - Watch for ~30 seconds — at least one row's price should tick (assuming the underlying is liquid and active).

4. Force the failure modes (manual harness):
   - **Unavailable**: temporarily edit a position's ticker to `ZZZZZ` in the DB. Reload the app. The row's price cell should show `—` with a tooltip on hover.
   - **Closed**: launch outside market hours (or wait for after 8 PM ET). The pill should show `CLOSED` with a gray dot; prices show last close.
   - **Extended hours**: launch during pre-market (4:00–9:30 AM ET) or after-hours (4:00–8:00 PM ET). Pill shows `EXT` (amber).
   - **Stale**: temporarily disable the WebSocket connection (block `stream.data.alpaca.markets` in `/etc/hosts`) and wait 5+ minutes. The amber `Prices may be delayed — last updated Xm ago` banner should appear above the table.

## Passing Criteria

- All unit/integration tests pass: `pnpm test`.
- Lint clean: `pnpm lint`.
- No type errors: `pnpm typecheck`.
- All E2E specs pass: `pnpm test:e2e`.
- Every Gherkin scenario in `docs/epics/06-stories/US-32-live-underlying-price.md` is covered by at least one E2E test case.
- Manual smoke test confirms live price updates without page reload during market hours.
