---
page: docs/spec/features/us-33-option-mid-pnl.md
audited_at: 2026-06-27
findings: 3
---

# Audit: docs/spec/features/us-33-option-mid-pnl.md

Strongest of the five pages. Core math, migration, schema extension, and
renderer surface all verify. Minor drift in where `buildOccSymbol` is defined
and in the provider method name used by the service.

## Verified (10)

- ✓ Migration `005_add_profit_target_percent.sql` exists and matches exactly:
  `ALTER TABLE positions ADD COLUMN profit_target_percent INTEGER;`.
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50` and `resolveProfitTarget(override)`
  (explicit `=== null`) in `src/main/core/profit-target.ts:4-7`.
- ✓ `computeUnrealizedPnl` exists in `src/main/core/costbasis.ts:285`.
- ✓ `GetOptionSnapshotsPayloadSchema = z.object({ symbols:
z.array(z.string().min(1).max(25)).max(50) })` — `schemas.ts:371`.
- ✓ `market-data:option-snapshots` IPC handler registered
  (`src/main/ipc/market-data.ts:52`).
- ✓ `positions:list` extension: `list-positions.ts` selects
  `p.profit_target_percent` (`:39`) and `l.instrument_type, l.contracts,
l.premium_per_contract` (`:41`), mapped to `instrumentType`, `contracts`,
  `entryPremiumPerContract` (`:79-82`).
- ✓ `fetchOptionSnapshots(provider, symbols)` in
  `src/main/services/market-data.ts:54`.
- ✓ Renderer hook `useOptionSnapshots.ts`, lib `option-display.ts`
  (`isWideSpread`, `hasNoBid`, etc.), components `OptMidCell.tsx`,
  `UnrealizedPnlCell.tsx`, `TargetBadge.tsx` all present.
- ✓ Preload exposes flat `getOptionSnapshots(payload)` →
  `market-data:option-snapshots` (`preload/index.ts:32`).
- ✓ `e2e/option-pnl.spec.ts` exists; all `./` and `../` spec links resolve.

## Drift (3)

- ✗ Page states `buildOccSymbol` lives in (and is imported from)
  `src/main/core/option-symbol.ts`. That file only **re-exports** it:
  `export { buildOccSymbol, type BuildOccSymbolInput } from
'../../shared/option-symbol'` (`option-symbol.ts:1`). The real definition
  moved to `src/shared/option-symbol.ts`. Path is still importable, but the
  "only imports `decimal.js` → src/main/core/option-symbol.ts" claim and the
  source-file bullet now point at a barrel, not the implementation.

- ✗ ADR/Contracts imply the service calls the provider's plural
  `getOptionSnapshots(symbols)`. The actual provider interface method is
  `getOptionSnapshot` (singular) and `fetchOptionSnapshots` loops calling
  `provider.getOptionSnapshot(s)` per symbol
  (`services/market-data.ts:63`). The IPC _channel_ name is plural, but the
  provider _method_ is singular.

- ✗ Page documents `FakeMarketDataProvider.getOptionSnapshots` reading
  `WHEELBASE_MOCK_OPTION_SNAPSHOTS`. The provider interface method is now
  `getOptionSnapshot` (singular); confirm the fake's method name matches the
  current singular interface rather than the documented plural.

## Unverifiable (0)

## Missing files (0)

Suggested fix: repoint the `buildOccSymbol` source-file bullet to
`src/shared/option-symbol.ts` (re-exported through core), and reconcile the
singular provider method name (`getOptionSnapshot`) with the plural names used
in the ADRs / FakeMarketDataProvider note.
