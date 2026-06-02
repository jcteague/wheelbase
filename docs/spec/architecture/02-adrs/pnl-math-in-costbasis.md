# ADR: Unrealized-P&L math lives in `costbasis.ts`

<!-- generated:from us-33 -->

## Decision

`computeUnrealizedPnl({ entryPremium, currentMid, contracts })` is added to `src/main/core/costbasis.ts`. It returns `{ pnl, pnlPercent, maxProfit }` — all 4 dp decimal strings via `Decimal.ROUND_HALF_UP`. `pnlPercent` is on the 0–100 scale (not 0–1) so it can be compared directly against the story's `50` and `25` thresholds. Formula: `maxProfit = entryPremium × contracts × 100`; `pnl = (entryPremium − currentMid) × contracts × 100`; `pnlPercent = (pnl / maxProfit) × 100`.

## Why

The cost-basis engine already returns decimal strings (`basisPerShare`, `totalPremiumCollected`, `finalPnl`); keeping unrealized P&L there preserves the convention and reuses existing helpers (`sharesFromContracts`, `round4`). The sign convention (positive when the option decayed below entry) matches the AC. Keeping `pnlPercent` on the 0–100 scale removes the silent multiplication ambiguity that would come from a 0–1 representation.

## Alternatives considered

- **Return numbers** — breaks the engine's decimal-string convention and reintroduces floating-point drift in the renderer.
- **Compute in the renderer** — duplicates the rounding/sign rules outside `src/main/core/`.

## Source

- `plans/us-33/research.md`
- `plans/us-33/data-model.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
