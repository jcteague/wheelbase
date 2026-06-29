# ADR: Build OCC symbols in a pure leaf module

<!-- generated:from us-33,market-data-massive-migration -->

## Decision

OCC option symbols are built by `buildOccSymbol(input: BuildOccSymbolInput)` — input fields `ticker`, `expiration`, `strike`, `instrumentType` — defined in `src/shared/option-symbol.ts`, the pure leaf module (no DB/Electron imports). `src/main/core/option-symbol.ts` re-exports `buildOccSymbol` and `BuildOccSymbolInput` for core/main callers; the renderer imports the shared module directly. Format: `{TICKER}{YYMMDD}{P|C}{STRIKE_8}` where the strike is multiplied by 1000 and zero-padded to 8 digits — e.g. AAPL `2026-05-16` `$180.00` PUT → `AAPL260516P00180000`. No `contract_id` column is added to the `legs` table; the symbol is derived on demand from the inputs already on the row.

## Why

The format is industry-standard and is the form accepted by the market-data provider's option-snapshot reads (`getOptionSnapshot` / `getOptionChainSnapshot`). Defining the rule in a `src/shared/` leaf — importable from both the main process and the renderer — means there is exactly one OCC builder and no main/renderer drift. Persisting `contract_id` on every leg would buy nothing at our scale.

## Alternatives considered

- **Persist `contract_id` on each `legs` row** — no caching benefit; adds a column that has to be backfilled and migrated when format rules change.
- **Duplicate the builder in `src/renderer/src/lib/`** — symbol format is a domain rule, not a UI concern, and duplication invites drift.

## Revisions

- **us-33** (original): introduced `buildOccSymbol` as a new pure module at `src/main/core/option-symbol.ts`, consumed by the renderer via direct import.
- **market-data-massive-migration**: moved the definition (and `BuildOccSymbolInput`) to `src/shared/option-symbol.ts` so both processes share one leaf; `src/main/core/option-symbol.ts` became a thin re-export rather than the definition.

## Source

- `plans/us-33/research.md`, `plans/market-data-massive-migration/research.md`
- Definition: `src/shared/option-symbol.ts` (re-exported by `src/main/core/option-symbol.ts`)
- Feature page: [us-33 — Option mid & unrealized P&L](../../features/us-33-option-mid-pnl.md)
<!-- /generated -->
