---
page: docs/spec/architecture/02-adrs/pnl-math-in-costbasis.md
audited_at: 2026-06-27
findings: 0
---

# Audit: pnl-math-in-costbasis.md

## Verified (7)

- ✓ `computeUnrealizedPnl(input)` exists in `src/main/core/costbasis.ts:285`.
- ✓ Returns `{ pnl, pnlPercent, maxProfit }` as 4dp decimal strings (`.toFixed(4)`) (`src/main/core/costbasis.ts:280-282,304-306`).
- ✓ `maxProfit = entryPremium × contracts × 100`: `entry.times(shares)` where `shares = sharesFromContracts(contracts) = contracts × 100` (`src/main/core/costbasis.ts:299-300`, `sharesFromContracts` at line 27).
- ✓ `pnl = (entryPremium − currentMid) × contracts × 100`: `entry.minus(current).times(shares)` (`src/main/core/costbasis.ts:300`).
- ✓ `pnlPercent = (pnl / maxProfit) × 100`, on the 0–100 scale: `pnlDec.dividedBy(maxProfitDec).times(100)` (`src/main/core/costbasis.ts:301`).
- ✓ Rounding via `round4` which uses `Decimal.ROUND_HALF_UP` (`src/main/core/costbasis.ts:23`).
- ✓ Reuses existing engine helpers `sharesFromContracts` and `round4`; engine already returns `basisPerShare`/`totalPremiumCollected`/`finalPnl` as decimal strings (`src/main/core/costbasis.ts:19-20,45-46,80`).

## Drift (0)

## Unverifiable (1)

- ? "The sign convention (positive when the option decayed below entry) matches the AC" — sign follows from `entry.minus(current)` which is verified; the AC-match assertion itself is narrative.

## Missing files (0)
