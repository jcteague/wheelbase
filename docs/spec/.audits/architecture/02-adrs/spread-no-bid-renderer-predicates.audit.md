---
page: docs/spec/architecture/02-adrs/spread-no-bid-renderer-predicates.md
audited_at: 2026-06-27
findings: 0
---

# Audit: spread-no-bid-renderer-predicates.md

## Verified (5)

- ✓ Both helpers live in `src/renderer/src/lib/option-display.ts` — `isWideSpread` at `:18`, `hasNoBid` at `:28`.
- ✓ `isWideSpread` returns true when `mid > 0 && (ask − bid)/mid > 0.10` — `option-display.ts:18-23` (`spread.dividedBy(m).gt(WIDE_SPREAD_THRESHOLD)`).
- ✓ When `mid <= 0` the predicate returns `false` — `option-display.ts:20` (`if (m.lte(0)) return false`). (ADR says `mid === 0` returns false; code uses `<= 0`, a strict superset that includes the 0 case.)
- ✓ `hasNoBid` returns true when `Decimal(bid).isZero()` — `option-display.ts:29` (`new Decimal(bid).isZero()`), so `'0'`/`'0.00'`/`'0.0000'` all match.
- ✓ `WIDE_SPREAD_THRESHOLD = 0.1` exported alongside — `option-display.ts:5`.

## Drift (0)

None. (Minor wording: ADR says "When `mid === 0` ... returns false"; code guards `mid <= 0`. Behavior for `mid === 0` matches; the `< 0` extension is benign.)

## Unverifiable (2)

- ? "lets `OptMidCell` render the right state purely from inputs" — `OptMidCell.tsx` exists (`src/renderer/src/components/OptMidCell.tsx`); that it consumes these predicates was not line-verified.
- ? "10% threshold is fixed by the story (not configurable)" — story-requirement rationale, narrative.

## Missing files (0)

- `plans/us-33/...` and feature page — references.
