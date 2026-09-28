---
page: docs/spec/architecture/02-adrs/client-side-pnl-preview.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/client-side-pnl-preview.md

## Verified (6)

- ✓ `CcPnlPreview` lives under `components/ui/` — `src/renderer/src/components/ui/CcPnlPreview.tsx`, computed with `decimal.js` and `ROUND_HALF_UP` (`CcPnlPreview.tsx:23-47`).
- ✓ `NetCreditDebitPreview` is an inline component inside each roll form — `src/renderer/src/components/RollCspForm.tsx:33`, `src/renderer/src/components/RollCcForm.tsx:48`.
- ✓ `computeGuardrail` in `src/renderer/src/components/openCcGuardrail.ts:24`.
- ✓ `computeNetCreditDebit` in `src/renderer/src/lib/rolls.ts:40`.
- ✓ `computePreview` is a local (non-exported) function in `src/renderer/src/components/CloseCspForm.tsx:42`, driven by `useWatch` (`:88`).
- ✓ No IPC round-trip for previews — none of these helpers import from `api/` or call `window.api`.

## Drift (2)

- ✗ Line 7 says all in-form previews are computed "using `decimal.js`", line 15 says they match the server "byte-for-byte (same `decimal.js` library, same `ROUND_HALF_UP`)", and line 21 lists native `number` math as a _rejected_ alternative. Only `CcPnlPreview` uses `decimal.js`. `computePreview` uses plain `number` arithmetic (`CloseCspForm.tsx:42-49`), `computeNetCreditDebit` does too (`rolls.ts:40-53`), and `computeGuardrail` / `getRollPreview` use `parseFloat` (`openCcGuardrail.ts:10-11,28`; `rolls.ts:15-19`). Suggested fix: scope the decimal.js claim to `CcPnlPreview`, or treat it as a code issue to fix.
- ✗ Consequences line 26 ("The renderer imports `decimal.js` directly and applies `ROUND_HALF_UP` for parity") is true only for some components (e.g. `CcPnlPreview.tsx`, `src/renderer/src/lib/option-display.ts:3`). The four preview helpers the ADR names, apart from `CcPnlPreview`, do not. Same fix as above.

## Unverifiable (1)

- ? "Renderer-side helpers are unit-tested with the same numeric fixtures the server tests use" — fixture parity not mechanically checkable.

## Missing files (0)

- (none) — `../../.extracts/us-{4,7,8,12}.md`, the four feature pages, and `./pct-of-max-formula.md` exist.
