---
page: docs/spec/architecture/02-adrs/occ-symbol-pure-leaf.md
audited_at: 2026-09-28
findings: 1
---

# Audit: occ-symbol-pure-leaf.md

## Verified (6)

- ✓ `buildOccSymbol(input: BuildOccSymbolInput)` with `ticker`, `expiration`, `strike`, `instrumentType` defined in `src/shared/option-symbol.ts:13-31`; imports only `decimal.js` (no DB/Electron).
- ✓ Format `{TICKER}{YYMMDD}{P|C}{STRIKE*1000, 8 digits}`, example `AAPL260516P00180000` — `src/shared/option-symbol.ts:4-5, 10-11, 26-27`.
- ✓ `src/main/core/option-symbol.ts` is a thin re-export of `buildOccSymbol` / `BuildOccSymbolInput` (also `parseOccSymbol`, `OccIdentity`) from `../../shared/option-symbol` — `core/option-symbol.ts:1-6`.
- ✓ Renderer imports the shared module directly — `src/renderer/src/hooks/useOptionSnapshots.ts:3` (also `usePromotedQuote.ts`, `PositionDetailPage.tsx`).
- ✓ No `contract_id` column on `legs` — no match in `migrations/`.
- ✓ Provider reads `getOptionSnapshot` / `getOptionChainSnapshot` exist — `src/main/integrations/market-data-provider.ts:132-133`.

## Drift (0)

None.

## Unverifiable (1)

- ? "Persisting `contract_id` would buy nothing at our scale" — rationale.

## Missing files (1)

- ✗ Source `plans/us-33/research.md` — `plans/us-33/` no longer exists (`plans/market-data-massive-migration/research.md` exists).
