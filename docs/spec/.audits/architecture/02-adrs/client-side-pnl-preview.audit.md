---
page: docs/spec/architecture/02-adrs/client-side-pnl-preview.md
audited_at: 2026-06-27
findings: 1
---

# Audit: client-side-pnl-preview.md

## Verified (6)

- ✓ `CcPnlPreview` component exists and is consumed by the close-CC form: `src/renderer/src/components/ui/CcPnlPreview.tsx:9`, used at `src/renderer/src/components/CloseCcEarlyForm.tsx:8,119`.
- ✓ `NetCreditDebitPreview` is rendered in both roll forms: `src/renderer/src/components/RollCspForm.tsx:33,220` and `RollCcForm.tsx:48,283`.
- ✓ `computeGuardrail` exists in `src/renderer/src/components/openCcGuardrail.ts:24`.
- ✓ `computeNetCreditDebit` exists in `src/renderer/src/lib/rolls.ts` (imported at `RollCspForm.tsx:5`, `RollCcForm.tsx:6`).
- ✓ Renderer uses `decimal.js` for preview math (e.g. `CcPnlPreview.tsx:24-25`, plus ~10 other renderer files import decimal.js).
- ✓ The corrected `% of max captured` formula `(openPremium − closePrice) / openPremium × 100` is present in `CcPnlPreview.tsx:33-35`; the `pct-of-max-formula.md` ADR it links to exists.

## Drift (1)

- ✗ The ADR describes `computePreview` as one of the extracted pure helpers in `src/renderer/src/lib/` (Consequences bullet: "Pure helper functions (`computeGuardrail`, `computeNetCreditDebit`, `computePreview`) are extracted to `src/renderer/src/lib/`..."). In code, `computePreview` is a **local function inside** `src/renderer/src/components/CloseCspForm.tsx:42`, not extracted to `lib/`. Minor: also `CcPnlPreview` lives under `components/ui/` rather than `components/` and `NetCreditDebitPreview` is an inline function within each roll form rather than a standalone shared component file. Suggested fix: soften the "extracted to lib/" wording for `computePreview` and note the actual locations.

## Unverifiable (1)

- ? "math runs on every keystroke via `useWatch`" and "no debounced IPC call" — the absence of a debounce/IPC preview endpoint is consistent with the code (all helpers are pure/renderer-local) but the per-keystroke timing is narrative.

## Missing files (0)

- ✓ All four linked feature pages (us-4, us-7, us-8, us-12) and the `pct-of-max-formula.md` ADR exist.
