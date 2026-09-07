# Quickstart: US-99 — Alpaca as the sole market-data provider

## Prerequisites

- `pnpm install` done. `better-sqlite3` must be built for **system Node** to run Vitest
  (`pnpm rebuild better-sqlite3`) and for **Electron** to run `pnpm dev` / e2e
  (`npx electron-rebuild -f -w better-sqlite3`). `pnpm test` runs the system rebuild as a
  `pretest` hook — do not run it while a `pnpm dev` session you care about is open; run
  `pnpm vitest run` directly instead. If DB-backed tests fail with a `NODE_MODULE_VERSION`
  mismatch, that is the ABI build, not a test failure.
- No migrations, seed data, or new env vars. All vendor traffic is stubbed with
  `vi.stubGlobal('fetch', mockFetch)` and `vi.mock('ws')` (copy the `MockWs` pattern from the
  Massive test file before deleting it).
- After Area 9, `.env` no longer needs `MAIN_VITE_MASSIVE_API_KEY`; the app reads market data
  with the Alpaca keys saved in Settings (or `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` as the dev
  fallback).

## Running the unit tests for this story

```bash
# Area 1 — shared OCC parser
pnpm vitest run src/main/core/option-symbol.test.ts src/main/integrations/fake-market-data.test.ts

# Area 2 — shared env credential loader
pnpm vitest run src/main/integrations/alpaca-credentials.test.ts src/main/integrations/broker-factory.test.ts

# Areas 3–5 — Alpaca provider (REST stocks, options + OI, websocket)
pnpm vitest run src/main/integrations/alpaca-market-data.test.ts

# Area 6 — factory, stream restart, main wiring
pnpm vitest run src/main/integrations/market-data-factory.test.ts src/main/services/market-data.test.ts src/main/ipc/market-data.test.ts src/main/services/screener.test.ts
# (src/main/services/market-data.test.ts is NEW in Area 6 — it covers StreamState.tickers and restartStockQuoteStream)

# Area 7 — settings contract
pnpm vitest run src/main/services/settings.test.ts src/main/services/settings-connections.test.ts src/main/ipc/settings.test.ts

# Area 8 — renderer copy and components
pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx src/renderer/src/pages/PositionsListPage.test.tsx src/renderer/src/components/MarketDataStatusDot.test.tsx src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx src/renderer/src/components/ScreenerStateCard.test.tsx src/renderer/src/App.test.tsx

# Area 9 — nothing references Massive any more
grep -rni massive src e2e .env.example ; # expect no output
```

Passing criteria: every listed file green and `pnpm vitest run` shows no newly failing test.

## Post-change checklist (CLAUDE.md)

```bash
pnpm vitest run     # or pnpm test when no dev session is open
pnpm lint
pnpm typecheck
pnpm format
```

## E2E

```bash
pnpm test:e2e -- e2e/settings-environment.spec.ts e2e/provider-split.spec.ts e2e/screener-results.spec.ts e2e/live-underlying-price.spec.ts e2e/option-pnl.spec.ts
```

`settings-environment.spec.ts` and `provider-split.spec.ts` are rewritten in Area 10 (no
`massiveApiKey`, new copy). The other three are the regression gate that the
`FAKE_MARKET_DATA` path is untouched. If e2e times out waiting for `event 'window'`, run
`npx electron-rebuild -f -w better-sqlite3` and retry.

## Manual smoke against live Alpaca (optional, not CI)

With Alpaca paper keys saved in Settings → Broker (or in `.env`) and a watchlist containing
`AAPL`:

1. `pnpm dev`. Open Positions with an open CSP: expect one `alpaca_api_request` to
   `data.alpaca.markets/v2/stocks/snapshots?symbols=…&feed=iex`, then
   `alpaca_ws_authenticated` and `alpaca_ws_subscription { bars: [...] }` in the terminal.
   During market hours the price cell moves on minute bars.
2. Open the screener and refresh: expect per ticker one request to
   `…/v1beta1/options/snapshots/AAPL?…feed=indicative…limit=1000` and one to
   `paper-api.alpaca.markets/v2/options/contracts?…`, then `Watchlist chain pull completed`
   with `okCount > 0` and ranked rows.
3. Settings → switch Paper ↔ Live (or remove the active keys): expect
   `stock_quote_stream_restarted` and, with no keys, `auth_failed` in the log plus the
   "Connect Alpaca" banner on Positions and the stale banner once the stream error lands.
4. `grep -rni massive src e2e .env.example` prints nothing.
