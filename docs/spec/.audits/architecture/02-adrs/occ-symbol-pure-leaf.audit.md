---
page: docs/spec/architecture/02-adrs/occ-symbol-pure-leaf.md
audited_at: 2026-06-27
findings: 1
---

# Audit: occ-symbol-pure-leaf.md

## Verified (4)

- ✓ `buildOccSymbol({ ticker, expiration, strike, instrumentType })` exists and is pure — `src/shared/option-symbol.ts:31`; input type includes `ticker/expiration/strike/instrumentType` (`option-symbol.ts:17`).
- ✓ Format `{TICKER}{YYMMDD}{P|C}{STRIKE_8}` with strike ×1000 zero-padded to 8 digits — `STRIKE_SCALE = 1000` (line 10), `strikeDecimal.times(STRIKE_SCALE).toFixed(0).padStart(STRIKE_WIDTH, '0')` (line 48); doc comment example `AAPL 2026-05-16 $180 PUT` (line 26).
- ✓ No `contract_id` column added to `legs` — `grep -rn "contract_id" migrations/` returns nothing; symbol is derived on demand.
- ✓ It is a pure leaf module importable by the renderer (no DB/Electron imports in `src/shared/option-symbol.ts`).

## Drift (1)

- ✗ Page (line 7) states the builder lives in `src/main/core/option-symbol.ts`. The actual implementation lives in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts` is only a re-export barrel: `export { buildOccSymbol, type BuildOccSymbolInput } from '../../shared/option-symbol'` (`src/main/core/option-symbol.ts:1`). Suggested fix: cite `src/shared/option-symbol.ts` as the canonical location (with the core re-export noted), since the renderer imports it from `shared`.

## Unverifiable (0)

(none)
