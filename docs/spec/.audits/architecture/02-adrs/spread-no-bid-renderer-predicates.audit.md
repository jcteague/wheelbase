---
page: docs/spec/architecture/02-adrs/spread-no-bid-renderer-predicates.md
audited_at: 2026-09-28
findings: 1
---

# Audit: spread-no-bid-renderer-predicates.md

## Verified (5)

- ✓ `src/renderer/src/lib/option-display.ts` exists.
- ✓ `isWideSpread({ bid, ask, mid })` returns `false` for `mid <= 0`, else `(ask − bid) / mid > WIDE_SPREAD_THRESHOLD` — `option-display.ts:18-23`.
- ✓ `hasNoBid({ bid })` returns `new Decimal(bid).isZero()` — `option-display.ts:28-29`.
- ✓ `WIDE_SPREAD_THRESHOLD = 0.1` exported — `option-display.ts:5`.
- ✓ `OptMidCell` consumes both predicates — `src/renderer/src/components/OptMidCell.tsx:4,50-51`; feature page `../../features/us-33-option-mid-pnl.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale (fixed 10% threshold per story; server-side flags rejected) — narrative; `plans/us-33/*` sources are historical (dir not present, by design).

## Missing files (0)

None.
