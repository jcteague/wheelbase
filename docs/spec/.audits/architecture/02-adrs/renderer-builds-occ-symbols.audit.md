---
page: docs/spec/architecture/02-adrs/renderer-builds-occ-symbols.md
audited_at: 2026-06-27
findings: 1
---

# Audit: renderer-builds-occ-symbols.md

## Verified (4)

- ✓ `useOptionSnapshots(legs: ActiveLegSummary[])` exists and builds OCC symbols renderer-side (`src/renderer/src/hooks/useOptionSnapshots.ts`; type `ActiveLegSummary` exported there).
- ✓ Per-leg `try/catch` around `buildOccSymbol` skips invalid legs without breaking the batch (`src/renderer/src/hooks/useOptionSnapshots.ts:29-41`); test covers strike 0 (`useOptionSnapshots.test.ts:171`).
- ✓ Calls `getOptionSnapshots(symbols)` over IPC (`src/renderer/src/hooks/useOptionSnapshots.test.ts:15`).
- ✓ `buildOccSymbol` is a pure leaf builder; no server-side symbol-building IPC exists (grep finds no such handler).

## Drift (1)

- ✗ Page claims `buildOccSymbol` is "imported directly from `src/main/core/option-symbol.ts`". The renderer actually imports it from `../../../shared/option-symbol` (`src/renderer/src/hooks/useOptionSnapshots.ts:3`, also `PositionDetailPage.tsx:19`, `PositionsListPage.tsx:10`). The canonical module is `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts:1` is merely a re-export of the shared module. Suggested fix: update the page to cite `src/shared/option-symbol.ts` as the canonical source (core re-exports it).

## Unverifiable (0)

## Missing files (0)
