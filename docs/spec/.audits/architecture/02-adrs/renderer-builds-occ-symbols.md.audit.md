---
page: docs/spec/architecture/02-adrs/renderer-builds-occ-symbols.md
audited_at: 2026-06-29
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/renderer-builds-occ-symbols.md

## Verified (11)

- ✓ `buildOccSymbol` and `BuildOccSymbolInput` are defined in the shared leaf
  module `src/shared/option-symbol.ts` (`src/shared/option-symbol.ts:13`,
  `src/shared/option-symbol.ts:31`).
- ✓ `src/main/core/option-symbol.ts` re-exports both:
  `export { buildOccSymbol, type BuildOccSymbolInput } from '../../shared/option-symbol'`
  (`src/main/core/option-symbol.ts:1`) — single builder, no duplication.
- ✓ Renderer imports `buildOccSymbol` directly from the shared module, not from
  `src/main/core/` — `src/renderer/src/hooks/useOptionSnapshots.ts:3`,
  `src/renderer/src/pages/PositionDetailPage.tsx:19`,
  `src/renderer/src/pages/PositionsListPage.tsx:10`.
- ✓ Main-process call site uses the `src/main/core/` re-export, preserving the
  historical import path — `src/main/services/detect-assignments.ts:2`
  (`import { buildOccSymbol } from '../core/option-symbol'`).
- ✓ `useOptionSnapshots(legs: ActiveLegSummary[])` is the documented signature
  (`src/renderer/src/hooks/useOptionSnapshots.ts:53-56`); `ActiveLegSummary`
  carries ticker, expiration, strike, instrumentType
  (`useOptionSnapshots.ts:11-16`).
- ✓ Per-leg `try/catch` around `buildOccSymbol` skips invalid legs without
  breaking the batch — `useOptionSnapshots.ts:29-40`.
- ✓ Hook calls `getOptionSnapshots(symbols)` over IPC
  (`useOptionSnapshots.ts:62`); `getOptionSnapshots` invokes channel
  `market-data:option-snapshots` (`src/renderer/src/api/market-data.ts:48-49`
  → `src/preload/index.ts:32`).
- ✓ IPC channel `market-data:option-snapshots` is registered in
  `src/main/ipc/market-data.ts:52`.
- ✓ No server-side symbol-building IPC exists — grep of `src/main/ipc/` for
  `buildOccSymbol`/`build-occ`/`buildSymbol` returns nothing.
- ✓ No duplicate builder in `src/renderer/src/lib/` — no symbol file present;
  the only `buildOccSymbol` definition repo-wide is in `src/shared/`.
- ✓ Output format `{TICKER}{YYMMDD}{P|C}{STRIKE×1000, zero-padded to 8}` and
  validation of ticker (non-empty), `YYYY-MM-DD` expiration, `strike > 0`, and
  instrumentType match `src/shared/option-symbol.ts:31-64`. Only `decimal.js`
  is imported (`src/shared/option-symbol.ts:7`); no DB/Electron imports.

## Drift (1)

- ✗ The ADR states the builder validates `instrumentType ∈ {PUT, CALL}`, but
  the actual `BuildOccSymbolInput` type accepts `'PUT' | 'CALL' | 'STOCK'`
  (`src/shared/option-symbol.ts:17`). `STOCK` is a permitted input value; it
  falls through `optionLetterFor`'s `default` and throws `'Invalid
instrumentType'` (`src/shared/option-symbol.ts:55-63`). The runtime effect
  (throws on non-PUT/CALL) matches the ADR's intent, but the documented input
  domain is narrower than the code's. Note: the renderer's `ActiveLegSummary`
  type does constrain `instrumentType` to `'PUT' | 'CALL' | null`
  (`useOptionSnapshots.ts:15`), so the drift is in the shared builder's input
  type, not the renderer call path. Suggested fix: either add `STOCK` to the
  ADR's documented input domain (noting it is rejected at runtime), or narrow
  `BuildOccSymbolInput.instrumentType` to `'PUT' | 'CALL'`.

## Unverifiable (0)

## Missing files (0)

- Feature page `../../features/us-33-option-mid-pnl.md` exists at
  `docs/spec/features/us-33-option-mid-pnl.md`.
