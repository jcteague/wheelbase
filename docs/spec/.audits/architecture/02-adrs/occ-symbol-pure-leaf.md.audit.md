---
page: docs/spec/architecture/02-adrs/occ-symbol-pure-leaf.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/occ-symbol-pure-leaf.md

## Verified (9)

- ✓ `buildOccSymbol(input: BuildOccSymbolInput)` is defined in the pure leaf module `src/shared/option-symbol.ts:31` (function) and `src/shared/option-symbol.ts:13` (interface). Input fields `ticker`, `expiration`, `strike`, `instrumentType` all match `src/shared/option-symbol.ts:14-17`.
- ✓ `src/shared/option-symbol.ts` has no DB/Electron imports — only `import Decimal from 'decimal.js'` (`src/shared/option-symbol.ts:7`); header comment confirms "Pure engine — no database or broker imports allowed here."
- ✓ `src/main/core/option-symbol.ts` is a thin re-export of both `buildOccSymbol` and `BuildOccSymbolInput`: `export { buildOccSymbol, type BuildOccSymbolInput } from '../../shared/option-symbol'` (`src/main/core/option-symbol.ts:1`, the file's only line).
- ✓ The renderer imports the shared module directly: `import { buildOccSymbol } from '../../../shared/option-symbol'` in `src/renderer/src/hooks/useOptionSnapshots.ts:3`, `src/renderer/src/pages/PositionDetailPage.tsx:19`, and `src/renderer/src/pages/PositionsListPage.tsx:10`.
- ✓ Format `{TICKER}{YYMMDD}{P|C}{STRIKE_8}` matches the implementation: returns `${ticker}${yy}${mm}${dd}${optionLetter}${strikeInt}` (`src/shared/option-symbol.ts:55`).
- ✓ Strike is multiplied by 1000 and zero-padded to 8 digits: `STRIKE_SCALE = 1000` (`src/shared/option-symbol.ts:10`), `STRIKE_WIDTH = 8` (`src/shared/option-symbol.ts:11`), `strikeDecimal.times(STRIKE_SCALE).toFixed(0).padStart(STRIKE_WIDTH, '0')` (`src/shared/option-symbol.ts:49`).
- ✓ Example `AAPL 2026-05-16 $180.00 PUT → AAPL260516P00180000` matches the JSDoc example in `src/shared/option-symbol.ts:23-24` and header comment `src/shared/option-symbol.ts:5`.
- ✓ No `contract_id` column on the `legs` table: grep for `contract_id` across `migrations/` returns no matches.
- ✓ Provider option-snapshot reads named `getOptionSnapshot` / `getOptionChainSnapshot` exist with those exact names: `src/main/integrations/massive-market-data.ts:211` and `:220`, and `src/main/integrations/fake-market-data.ts:47` and `:57` (interface `MarketDataFeed` in `src/main/integrations/market-data-provider.ts`).

## Drift (0)

None.

## Unverifiable (2)

- ? "Defining the rule in a `src/shared/` leaf ... means there is exactly one OCC builder and no main/renderer drift." Narrative rationale; the single-definition claim is structurally supported by the re-export pattern (verified above) but the "no drift" benefit is a design judgment, not mechanically checkable.
- ? "Persisting `contract_id` on every leg would buy nothing at our scale." Design rationale; not mechanically verifiable.

## Missing files (0)

- ✓ Feature page link `../../features/us-33-option-mid-pnl.md` resolves to `docs/spec/features/us-33-option-mid-pnl.md` (exists).
