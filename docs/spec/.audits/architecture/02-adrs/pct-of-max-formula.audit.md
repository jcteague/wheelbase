---
page: docs/spec/architecture/02-adrs/pct-of-max-formula.md
audited_at: 2026-06-27
findings: 0
---

# Audit: pct-of-max-formula.md

## Verified (5)

- ✓ Profit-branch "% of max" formula `(openPremium − closePrice) / openPremium × 100` — `src/renderer/src/components/ui/CcPnlPreview.tsx:33-39` (`open.minus(closeDecimal).div(open).times(100)`), label `${pct}% of max`.
- ✓ Loss-branch "% above open" `(closePrice − openPremium) / openPremium × 100` — `CcPnlPreview.tsx:42-48`, label `${pct}% above open`.
- ✓ e2e fixture uses `closePrice = $1.10` (not midpoint $1.15) and expects `52.2% of max` — `e2e/close-cc-early.spec.ts:86,91` (comment confirms `(2.30-1.10)/2.30*100 = 52.2%`).
- ✓ Unit test includes a negative assertion that `47.8% of max` is NOT rendered — `src/renderer/src/components/ui/CcPnlPreview.test.tsx:14` (`queryByText(/47\.8% of max/)).not.toBeInTheDocument()`).
- ✓ Renderer-only correction: formula lives in the renderer component; no IPC/schema/service involved.

## Drift (0)

(none)

## Unverifiable (0)

(none)
