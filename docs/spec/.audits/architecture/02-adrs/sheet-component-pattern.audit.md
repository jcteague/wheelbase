---
page: docs/spec/architecture/02-adrs/sheet-component-pattern.md
audited_at: 2026-09-28
findings: 5
---

# Audit: sheet-component-pattern.md

## Verified (7)

- ✓ Confirmable mutations render via `createPortal` — `ExpirationSheet.tsx:2,63,143`, `AssignmentSheet.tsx:3,149`, `OpenCoveredCallSheet.tsx:2,117`, `RollCspSheet.tsx:5,112`, plus `CloseCcEarlySheet`, `CcExpirationSheet`, `CallAwaySheet`, `RollCcSheet` (all under `src/renderer/src/components/`).
- ✓ 400 px default panel, 420 px for roll CSP — `src/renderer/src/components/ui/Sheet.tsx:41` (`width = 400`), `RollCspSheet.tsx:114` (`width={420}`).
- ✓ Fixed-position panel offset by sidebar width, with a scrim — `ui/Sheet.tsx:25` (`fixed … left-[200px]`), `ui/Sheet.tsx:29` (`data-testid="sheet-scrim"`).
- ✓ Form/success two-state sheets keyed off a `successState` — e.g. `AssignmentSheet.tsx:43,69`, `OpenCoveredCallSheet.tsx:30,82`.
- ✓ Four-file split for open CC: `OpenCoveredCallSheet.tsx` + `OpenCcForm.tsx` + `OpenCcSuccess.tsx` + `openCcGuardrail.ts` (all exist in `src/renderer/src/components/`).
- ✓ `ExpirationSheet` now uses the custom `createPortal` pattern (no shadcn `Sheet`), consistent with "now the canonical approach" — `ExpirationSheet.tsx:2,10`.
- ✓ Links `./action-buttons-phase-gated.md`, extracts us-5/6/7/8/9/12 and the six feature pages all exist.

## Drift (4)

- ✗ Page claims sheets have "slide-in animation, and Escape-to-close" (line 7). `grep -rln "Escape"` over `src/renderer/src` returns nothing, and `ui/Sheet.tsx` has no animation class or keydown handler; sheets close via the scrim click or the `SheetCloseButton` (`ui/Sheet.tsx:3-14,32`). Suggested fix: drop the claims or implement them.
- ✗ Page gives `overlayOpen = expirationCtx || assignmentCtx || openCcCtx || closeCcCtx || ccExpCtx || rollCspOpen` owned by `PositionDetailPage` (line 32). Actual lives in `src/renderer/src/pages/usePositionDetailSheets.ts:119-124` and also includes `callAwayCtx` and `rollCcOpen` (and the context is named `ccExpirationCtx`); the blur/opacity is applied in `PositionDetailContent.tsx:10-11,48`. Suggested fix: update the expression and owner.
- ✗ Tech-debt note (line 34) says `ExpirationSheet` state reset uses `useEffect` with an ESLint disable. `ExpirationSheet.tsx` contains no `useEffect` or `eslint-disable` (grep empty). Suggested fix: remove the stale tech-debt note.
- ✗ Page says `onSuccess` sets a `successState` **ref** (line 9); it is React state — `useState<…>(null)` in `AssignmentSheet.tsx:43`, `OpenCoveredCallSheet.tsx:30`, `RollCspSheet.tsx:69`, `ExpirationSheet.tsx:34`. Minor wording fix.

## Unverifiable (1)

- ? Rationale (focused decision moment, blur context, modal rejection) and the ~649-line historical split — narrative.

## Missing files (0)

None.
