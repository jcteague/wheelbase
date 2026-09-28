---
page: docs/spec/architecture/02-adrs/decimal-money-math.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/decimal-money-math.md

## Verified (6)

- ✓ Main-process money math uses `decimal.js` with `ROUND_HALF_UP` — `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` at `src/main/core/costbasis.ts:8`.
- ✓ Shared `round4` helper (`toDecimalPlaces(4)`) — `src/main/core/costbasis.ts:23-25`.
- ✓ Money columns are `TEXT` — e.g. `strike`, `premium_per_contract`, `fill_price`, `basis_per_share` in `migrations/001_initial_schema.sql:26,29,30,43`.
- ✓ Market-data adapter emits 2 dp price/bid/ask/prevClose/change and 4 dp `changePercent` — `src/main/integrations/alpaca-market-data-mappers.ts:63-71,147-148`.
- ✓ `calculateInitialCspBasis` returns `.toString()` rather than `.toFixed(4)` (`costbasis.ts:37-46`), consistent with the page's line 29 note.
- ✓ The page names `calculateCspExpiration`, `calculateCcClose`, `calculateRollBasis` etc. as decimal users; `calculateRollBasis` and the others live in `src/main/core/costbasis.ts` (e.g. `:240-244`).

## Drift (1)

- ✗ Line 7 ("Renderer-side math (P&L previews, guardrail diffs) also uses `decimal.js` to avoid `parseFloat` drift") and Consequences line 28 ("Renderer adapters never re-parse money values with `parseFloat` for math") are contradicted by the renderer preview helpers. `computeGuardrail` / `computeGuardrailComparison` use `parseFloat` (`src/renderer/src/components/openCcGuardrail.ts:10-11,28`); `getRollPreview` and `computeNetCreditDebit` use `parseFloat` / plain `number` (`src/renderer/src/lib/rolls.ts:15-19,40-53`); `computePreview` in `src/renderer/src/components/CloseCspForm.tsx:42-49` is native `number` math. Only some renderer components (e.g. `src/renderer/src/components/ui/CcPnlPreview.tsx`) use `decimal.js`. Suggested fix: narrow the claim, or fix the renderer helpers.

## Unverifiable (2)

- ? `ROUND_HALF_UP` is "the convention used by most trading platforms" — industry claim.
- ? "Tests assert on exact string outputs ... no tolerance windows" — a test-suite-wide property, not mechanically checked.

## Missing files (0)

- (none) — all seven `../../.extracts/us-*.md` and both feature pages exist.
