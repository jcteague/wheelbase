# ADR: Build OCC symbols in a pure leaf module

<!-- generated:from us-33 -->

## Decision

OCC option symbols are built by `buildOccSymbol({ ticker, expiration, strike, instrumentType })` in `src/main/core/option-symbol.ts`. Format: `{TICKER}{YYMMDD}{P|C}{STRIKE_8}` where the strike is multiplied by 1000 and zero-padded to 8 digits — e.g. AAPL `2026-05-16` `$180.00` PUT → `AAPL260516P00180000`. No `contract_id` column is added to the `legs` table; the symbol is derived on demand from the inputs already on the row.

## Why

The format is industry-standard and the format already accepted by `provider.getOptionSnapshots()` from US-31. Putting the rule in a pure leaf module means the renderer can import it directly (allowed for `src/main/core/`, which has no DB/Electron imports) and avoids the drift that would come from duplicating it in `src/renderer/src/lib/`. Persisting `contract_id` on every leg would buy nothing at our scale.

## Alternatives considered

- **Persist `contract_id` on each `legs` row** — no caching benefit; adds a column that has to be backfilled and migrated when format rules change.
- **Duplicate the builder in `src/renderer/src/lib/`** — symbol format is a domain rule, not a UI concern, and duplication invites drift.

## Source

- `plans/us-33/research.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
