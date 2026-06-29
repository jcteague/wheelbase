# ADR: Renderer builds OCC symbols from active legs

<!-- generated:from us-33,market-data-massive-migration -->

## Decision

`useOptionSnapshots(legs: ActiveLegSummary[])` builds OCC symbols on the renderer side via `buildOccSymbol`, then calls `getOptionSnapshots(symbols)` over IPC (`market-data:option-snapshots`). A per-leg `try/catch` around `buildOccSymbol` skips legs with invalid inputs (e.g. `strike: 0`) without breaking the batch. There is no server-side symbol-building IPC.

`buildOccSymbol` (and its `BuildOccSymbolInput` type) is the single OCC builder, defined in the shared leaf module `src/shared/option-symbol.ts`. The renderer imports it directly from there; `src/main/core/option-symbol.ts` re-exports it for main-process call sites. Both processes therefore use one builder with no duplication. The output format is `{TICKER}{YYMMDD}{P|C}{STRIKE×1000, zero-padded to 8}` (e.g. AAPL `2026-05-16` `$180.00` PUT → `AAPL260516P00180000`); it validates ticker, `YYYY-MM-DD` expiration, and `strike > 0`, throwing on any violation. `BuildOccSymbolInput.instrumentType` is typed `'PUT' | 'CALL' | 'STOCK'`; `'STOCK'` is accepted by the type but rejected at runtime (the builder throws `'Invalid instrumentType'`), so only `PUT` and `CALL` produce a symbol. Only `decimal.js` is imported.

## Why

Mirrors `useStockQuotes(tickers)` — the renderer already has every input needed (ticker, strike, expiration, instrumentType) via the active-leg metadata surfaced on `PositionListItem`. Symbol building is a pure domain rule, so it lives in a shared leaf module the renderer can safely import (no DB/Electron imports). Placing it in `src/shared/` rather than `src/main/core/` lets both processes consume one builder without the renderer reaching into a main-process path; the `src/main/core/` re-export preserves the historical import site. Moving construction server-side would add an IPC round-trip with no benefit.

## Alternatives considered

- **Send legs to IPC and build symbols server-side** — the renderer already has the inputs; an extra round-trip wastes effort.
- **Duplicate the builder in `src/renderer/src/lib/`** — invites drift with the canonical pure module.
- **Persist a `contract_id` column on `legs`** — rejected (US-33); no caching benefit at this scale, and pure derivation keeps the rule in one place.

## Source

- `plans/us-33/research.md`, `plans/us-33/plan.md`
- `plans/market-data-massive-migration/research.md` (moved the builder to `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts` is now a re-export)
- Implementation: `src/shared/option-symbol.ts`, `src/main/core/option-symbol.ts` (re-export), `src/renderer/src/hooks/useOptionSnapshots.ts`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
