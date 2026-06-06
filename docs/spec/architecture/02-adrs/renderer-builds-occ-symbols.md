# ADR: Renderer builds OCC symbols from active legs

<!-- generated:from us-33 -->

## Decision

`useOptionSnapshots(legs: ActiveLegSummary[])` builds OCC symbols on the renderer side via `buildOccSymbol` (imported directly from `src/main/core/option-symbol.ts`) and then calls `getOptionSnapshots(symbols)` over IPC. A per-leg `try/catch` around `buildOccSymbol` skips legs with invalid inputs (e.g. `strike: 0`) without breaking the batch. There is no server-side symbol-building IPC.

## Why

Mirrors `useStockQuotes(tickers)` — the renderer already has every input needed (ticker, strike, expiration, instrumentType) via the active-leg metadata surfaced on `PositionListItem`. Symbol building is pure and lives in a `src/main/core/` leaf module that the renderer can safely import. Moving construction server-side would add an IPC round-trip with no benefit.

## Alternatives considered

- **Send legs to IPC and build symbols server-side** — the renderer already has the inputs; an extra round-trip wastes effort.
- **Duplicate the builder in `src/renderer/src/lib/`** — invites drift with the canonical pure module.

## Source

- `plans/us-33/research.md`
- `plans/us-33/plan.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
