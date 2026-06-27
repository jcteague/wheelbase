---
page: docs/spec/architecture/02-adrs/decimal-money-math.md
audited_at: 2026-06-27
findings: 0
---

# Audit: decimal-money-math.md

## Verified (4)

- ✓ `round4` helper exists as the rounding step: `src/main/core/costbasis.ts:23` (`function round4(value: Decimal): Decimal`).
- ✓ `ROUND_HALF_UP` convention is used in core money math (referenced throughout `costbasis.ts` and asserted in `costbasis.test.ts:43,50,116`).
- ✓ Renderer reuses `decimal.js` for preview/guardrail math rather than `parseFloat` (imported by ~10 renderer components incl. `CcPnlPreview.tsx`, `UnrealizedPnlCell.tsx`, `PriceCell.tsx`).
- ✓ 4 dp TEXT money strings are asserted exactly in tests (no tolerance windows), consistent with the Consequences section.

## Drift (0)

None.

## Unverifiable (3)

- ? "Money fields are stored as `TEXT` in SQLite" — broadly true for money columns but not exhaustively grepped across all migrations in this page-scoped audit; flagged for completeness.
- ? Market-data 2 dp / 4 dp convention (`"182.45"` prices, `changePercent` 4 dp) — describes the REST adapter; not re-verified line-by-line here, narrative-adjacent.
- ? The floating-point-corruption and platform-convention rationale is narrative.

## Missing files (0)

- ✓ Linked feature pages `../../features/us-4-close-csp.md` and `../../features/us-32-live-position-prices.md` exist (extract links under `.extracts/` not audited here).
