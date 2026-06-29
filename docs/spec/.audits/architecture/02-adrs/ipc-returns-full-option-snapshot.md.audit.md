---
page: docs/spec/architecture/02-adrs/ipc-returns-full-option-snapshot.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/ipc-returns-full-option-snapshot.md

## Verified (8)

- ✓ Cited source `src/main/integrations/market-data-provider.ts` exists.
- ✓ Cited source `src/main/ipc/market-data.ts` exists.
- ✓ `OptionSnapshot` type carries the full shape — `bid`, `ask`, `mid`, `lastTrade`, `openInterest`, `volume`, `timestamp` — at `src/main/integrations/market-data-provider.ts:36-51`.
- ✓ `impliedVolatility?` is a **top-level optional** field on `OptionSnapshot` (a sibling of `greeks`, **not** nested under it) at `src/main/integrations/market-data-provider.ts:49`.
- ✓ `greeks?` is an optional object with `delta`/`gamma`/`theta`/`vega` (string-typed) at `src/main/integrations/market-data-provider.ts:43-48`.
- ✓ Both `greeks` and `impliedVolatility` are optional (`?`), so a snapshot with no analytics omits them entirely — matches the "renderer must remain robust to their absence" claim at `src/main/integrations/market-data-provider.ts:43,49`.
- ✓ Greeks and IV are formatted to 4 decimal places (the "4-dp greeks" claim). Confirmed in the active Massive provider: `delta/gamma/theta/vega` via `new Decimal(...).toFixed(4)` at `src/main/integrations/massive-market-data.ts:92-95`, and `impliedVolatility` via `new Decimal(r.implied_volatility).toFixed(4)` at `src/main/integrations/massive-market-data.ts:99`.
- ✓ The `market-data:option-snapshots` IPC handler returns the full snapshot 1:1 with no field stripping: handler at `src/main/ipc/market-data.ts:52-57` delegates to `fetchOptionSnapshots`, which forwards the provider's `OptionSnapshot` unchanged into the keyed `snapshots` map (`src/main/services/market-data.ts:54-83`, esp. lines 63-64, 77). No projection/omission of `greeks`/`impliedVolatility`.

## Drift (0)

None.

## Unverifiable (1)

- ? The ADR contrasts this handler with "the stock-quote path, which drops fields the renderer can't use." The `StockQuote` type (`market-data-provider.ts:25-34`) is a fixed flattened shape, but whether it intentionally "drops" provider fields is a design-intent claim not mechanically verifiable from the option-snapshot sources cited. Narrative contrast only — flag for human review if precision matters.

## Missing files (0)

- ✓ Linked feature page `docs/spec/features/us-33-option-mid-pnl.md` exists.
- ✓ Linked feature page `docs/spec/features/market-data-massive-migration.md` exists.
