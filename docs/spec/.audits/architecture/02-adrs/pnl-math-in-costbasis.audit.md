---
page: docs/spec/architecture/02-adrs/pnl-math-in-costbasis.md
audited_at: 2026-09-28
findings: 2
---

# Audit: pnl-math-in-costbasis.md

## Verified (5)

- ✓ `computeUnrealizedPnl({ entryPremium, currentMid, contracts })` in `src/main/core/costbasis.ts:273-308`, returning `{ pnl, pnlPercent, maxProfit }` as 4-dp strings via `round4(...).toFixed(4)` — `:303-307`.
- ✓ `ROUND_HALF_UP` rounding — `costbasis.ts:8`.
- ✓ Formulas `maxProfit = entry × shares`, `pnl = (entry − mid) × shares`, `pnlPercent = pnl / maxProfit × 100` (0–100 scale) using `sharesFromContracts` (×100) — `costbasis.ts:298-301, 27`.
- ✓ Reuses `round4` / `sharesFromContracts` helpers — `costbasis.ts:23, 27`.
- ✓ Existing decimal-string fields `basisPerShare`, `totalPremiumCollected` — `costbasis.ts:19-20`.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale against returning numbers / renderer computation — design intent. (Also note the function throws on invalid input, `:286-296`, which the page does not mention.)

## Missing files (2)

- ✗ Source `plans/us-33/research.md` — `plans/us-33/` no longer exists.
- ✗ Source `plans/us-33/data-model.md` — same.
