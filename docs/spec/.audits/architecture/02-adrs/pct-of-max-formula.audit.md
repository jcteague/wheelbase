---
page: docs/spec/architecture/02-adrs/pct-of-max-formula.md
audited_at: 2026-09-28
findings: 0
---

# Audit: pct-of-max-formula.md

## Verified (5)

- ✓ Profit branch `pct = (openPremium − closePrice) / openPremium × 100`, label `… % of max` — `src/renderer/src/components/ui/CcPnlPreview.tsx:33-39`.
- ✓ Loss branch `(closePrice − openPremium) / openPremium × 100` ("% above open") — `CcPnlPreview.tsx:42-46`.
- ✓ e2e fixture uses `closePrice = 1.10` and asserts `52.2% of max` — `e2e/close-cc-early.spec.ts:84-91`.
- ✓ Unit test negative assertion that `47.8% of max` is not rendered — `src/renderer/src/components/ui/CcPnlPreview.test.tsx:14`.
- ✓ Renderer-only: formula lives in a renderer component; no IPC/schema involvement.

## Drift (0)

None.

## Unverifiable (2)

- ? "Industry-standard tastytrade-popularised framing" / 50%-rule usage — domain claim.
- ? History of the original `closePrice / openPremium` implementation — history.

## Missing files (0)

None. (Component lives at `components/ui/CcPnlPreview.tsx`; the page names only the component, not a path.)
