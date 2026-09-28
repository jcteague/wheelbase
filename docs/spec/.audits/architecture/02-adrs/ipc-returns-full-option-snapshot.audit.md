---
page: docs/spec/architecture/02-adrs/ipc-returns-full-option-snapshot.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/architecture/02-adrs/ipc-returns-full-option-snapshot.md

## Verified (5)

- ✓ `OptionSnapshot` carries `bid`, `ask`, `mid`, `lastTrade`, `openInterest`, `volume`, `timestamp`, optional `greeks { delta, gamma, theta, vega }` and a top-level optional `impliedVolatility` — `src/main/integrations/market-data-provider.ts:37-52`.
- ✓ `market-data:option-snapshots` handler exists and returns the provider snapshots unflattened via `fetchOptionSnapshots` — `src/main/ipc/market-data.ts:65-69`, `src/main/services/market-data.ts:57-67`.
- ✓ The stock-quote path drops fields (`IpcStockQuote` has no `change`/`changePercent`) — `src/preload/index.d.ts:212-219`.
- ✓ Linked feature pages exist: `us-33-option-mid-pnl.md`, `market-data-massive-migration.md` (cited as revision history, not current vendor).
- ✓ Cited source files exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "renderer must remain robust to their absence" / Greeks-display motivation — narrative.

## Missing files (0)

None.
