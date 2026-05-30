# Quickstart: US-39 + US-31 (rewrite) + US-40

## Prerequisites

1. **Massive API key.** Sign up at https://massive.com, copy your key from the dashboard. Export for tests:
   ```bash
   export MASSIVE_API_KEY="your_key_here"
   ```
2. **Alpaca paper credentials** (you already have these from previous work). E2E tests for broker side reuse the existing env vars (`ALPACA_API_KEY_ID_PAPER`, `ALPACA_API_SECRET_KEY_PAPER`).
3. **`better-sqlite3` rebuilt for both runtimes:**
   ```bash
   npx electron-rebuild -f -w better-sqlite3
   pnpm rebuild better-sqlite3
   ```

## Verify the Massive endpoint manually

Before writing code, smoke-test that your key works and that `api.massive.com` resolves:

```bash
curl -s -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v3/quotes/AAPL/last" | jq '.'

curl -s -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v3/snapshot/options/AAPL/AAPL250620C00200000" | jq '.results.greeks, .results.implied_volatility'
```

If the chain-snapshot URL prefix returns 404, the base URL may still be the legacy `https://api.polygon.io`. Capture which works and update the provider constant.

## Run the test suites

```bash
pnpm test            # unit + integration (Vitest)
pnpm test src/main/integrations/  # narrower scope while iterating
pnpm test:e2e        # E2E (Playwright _electron) — must run from a GUI terminal
pnpm typecheck
pnpm lint
```

The plan's Red phases create:

- `src/main/integrations/market-data-provider.test.ts` — interface shape regression tests
- `src/main/integrations/broker-provider.test.ts` — new interface shape tests
- `src/main/integrations/massive-market-data.test.ts` — Massive REST adapter (mocked fetch)
- `src/main/integrations/alpaca-broker.test.ts` — Alpaca broker adapter (mocked SDK)
- `src/main/integrations/market-data-factory.test.ts` — updated wiring
- `src/main/ipc/market-data.test.ts` + new `src/main/ipc/broker.test.ts` — IPC routing

E2E that hits real Massive can be gated behind `MASSIVE_E2E=1` so CI runs cheap unit tests by default.

## What "done" looks like

- `pnpm test` green
- `pnpm typecheck` green
- `pnpm lint` green
- Manual: `pnpm dev`, configure a Massive API key via the Settings page, open any position — live underlying price and option mid-price refresh on a 60s interval (US-32/US-33 behavior already wired, now powered by Massive)
- Renderer console shows zero references to Alpaca-as-market-data
- `src/main/integrations/alpaca-market-data.ts` and its tests are deleted
