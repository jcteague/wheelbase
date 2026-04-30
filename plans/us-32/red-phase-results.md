# Red Phase Results: US-32 — Live Underlying Price (Layer 7, E2E Tests)

## Feature Context

- **Feature directory**: `plans/us-32/`
- **User story**: `docs/epics/06-stories/US-32-live-underlying-price.md`
- **Plan file**: `plans/us-32/plan.md`

## Test Files Created

- `e2e/live-underlying-price.spec.ts` — 7 e2e tests, one per AC

## Bug Fixed During Red Phase

`AlpacaMarketDataProvider` constructor called `createClient()` eagerly, throwing
`Error: Missing credentials` when `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY` are unset
(all e2e tests). Fixed by making `this.client` a lazy getter in
`src/main/integrations/alpaca-market-data.ts` — client is now created on first use.

## Interfaces Under Test

Each test uses `page.evaluate` to stub `window.api` before navigating to `#/`:

```ts
window.api.getStockQuotes // stubbed → { ok: true, quotes: {...} }
window.api.setStockQuoteTickers // stubbed → { ok: true, subscribedTickers: [] }
window.api.getMarketStatus // stubbed → { ok: true, status: {...} }
window.api.onStockQuote // stubbed → stores cb in window.__stockQuoteCallbacks
window.api.onStreamError // stubbed → stores cb in window.__streamErrorCallbacks
```

Stream ticks fired via `fireStockQuoteTick(page, ticker, quote)`.

Staleness (AC-7) simulated by: (1) override `Date.now` to return `t − 6min`,
(2) fire a tick so TanStack Query records `dataUpdatedAt = t − 6min`, (3) restore `Date.now`.

## Missing Implementation (why tests fail)

The `PriceCell` component renders `<td>` without a `data-testid` attribute.
Tests wait for `[data-testid="position-card-{TICKER}-price"]` which never appears.

## Test Execution Results

```
AC-1: displays live underlying price with green LIVE dot during regular session
  × FAIL — times out (60 000 ms) waiting for [data-testid="position-card-AAPL-price"]
AC-2 … AC-7: · SKIP (bail: 1)
```

## Verification

- ✅ Every test fails because `data-testid="position-card-{ticker}-price"` is missing
- ✅ No test-file syntax errors
- ✅ Alpaca startup crash fixed; app window appears correctly

## Handoff to Green Phase

Green must:

1. Add `testId?: string` prop to `PriceCell` and forward it to the `<td>` element
2. Pass `testId={\`position-card-${item.ticker}-price\`}`from`PositionRow`→`PriceCell`
3. Run `pnpm test:e2e e2e/live-underlying-price.spec.ts` — all 7 tests must pass
