---
page: docs/spec/architecture/03-design-system.md
audited_at: 2026-06-27
findings: 3
---

# Audit: docs/spec/architecture/03-design-system.md

## Verified (20)

- ✓ `@theme inline` block with `--color-wb-*` entries in `src/renderer/src/index.css:7,51-63`.
- ✓ `--color-wb-gold: var(--wb-gold)` style token mapping present (`index.css:51+`).
- ✓ `--font-wb-mono` / `font-wb-mono` token referenced (`index.css` `@theme inline`).
- ✓ `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)` in `index.css:101` — matches the documented value exactly.
- ✓ `<div id="sheet-portal" />` sits inside the App shell in `src/renderer/src/App.tsx:87`.
- ✓ Sheet primitives exported from `src/renderer/src/components/ui/Sheet.tsx`: `SheetCloseButton` (`:3`), `SheetOverlay` (`:16`), `SheetPanel` (`:34`), `SheetHeader` (`:51`), `SheetBody` (`:90`), `SheetFooter` (`:94`).
- ✓ `SheetPanel.width` is an optional number prop defaulting to `400` (`Sheet.tsx:34-36`).
- ✓ `SheetHeader.eyebrowColor` / `borderBottomColor` are optional string props with `var(--wb-...)` defaults (`Sheet.tsx:51+`).
- ✓ `SheetOverlay` scrim is the first child and dismisses on click (`Sheet.tsx` `onClick={onClose}` on `absolute inset-0`).
- ✓ `OpenCcSheetHeader.tsx` is deleted — `find` returns no match anywhere under `src/renderer`.
- ✓ Action sheets exist and compose the primitives: `ExpirationSheet`, `CcExpirationSheet`, `AssignmentSheet`, `OpenCoveredCallSheet`, `CloseCcEarlySheet`, `CallAwaySheet`, `RollCspSheet` (all in `src/renderer/src/components/`).
- ✓ `RollCspSheet` is the 420 px override consumer (`RollCspSheet.tsx` exists; only override per code).
- ✓ Success-state components exist: `CallAwaySuccess.tsx`, `OpenCcSuccess.tsx`.
- ✓ `src/renderer/src/lib/format.ts` exports `fmtMoney` (`:3`), `fmtPct` (`:13`), `fmtDate` (`:17`), `pnlColor` (`:25`), `computeDte` (`:33`).
- ✓ `src/renderer/src/lib/phase.ts` exports `PHASE_COLOR` (`:3`), `PHASE_LABEL` (`:16`), `PHASE_LABEL_SHORT` (`:51`).
- ✓ `MONO` constant still present in `src/renderer/src/lib/tokens.ts:1` (legacy, awaiting migration) — matches "still exists during the gradual migration".
- ✓ Hover CSS classes `.wb-nav-link` (`index.css:200`) and `.wb-position-row` (`:210`); per-row `--wb-row-phase-color` read via `border-left-color` (`index.css:221`).
- ✓ Shared primitives exist: `PhaseBadge` (`components/PhaseBadge.tsx`), `LoadingState` (`components/ui/LoadingState.tsx`), `ErrorAlert` (`components/ui/ErrorAlert.tsx`), `SectionCard` (`components/ui/SectionCard.tsx`), `NavItem` (`components/NavItem.tsx`), `TablePrimitives` (`components/ui/TablePrimitives.tsx`), `Badge` (`components/ui/Badge.tsx`).
- ✓ `createPortal` target `document.getElementById('sheet-portal')` set up once in `App.tsx` (`:87`).
- ✓ Inline-style conversion table claim `left: SIDEBAR_WIDTH (constant 200)` → `left-[200px]` matches `SheetOverlay` className `... left-[200px] ...` (`Sheet.tsx:25`).

## Drift (3)

- ✗ Page claims `SIDEBAR_WIDTH = 200` is "exported from the same module [`Sheet.tsx`]" (line 31) and listed under "Sheet primitives" as a single source of truth (`SIDEBAR_WIDTH` — line 130). No `SIDEBAR_WIDTH` symbol exists anywhere in `src/renderer/` (grep returns nothing). The 200 px sidebar offset is instead a hardcoded Tailwind arbitrary value `left-[200px]` in `Sheet.tsx:25`. Suggested fix: remove the `SIDEBAR_WIDTH` export claim, or extract the constant to actually create the documented single source of truth.

- ✗ Page (line 50) claims the migration's E2E suite is `e2e/design-system.spec.ts` and that it asserts the logo-dot background equals the resolved `--wb-gold` RGB. No file `e2e/design-system.spec.ts` exists; the `e2e/` directory contains no design-system spec (closest are feature specs like `position-cockpit.spec.ts`, `csp-flow.spec.ts`). Suggested fix: correct the filename to the actual E2E spec, or drop the claim if the suite was never landed/was renamed.

- ✗ Page (line 31) lists `CallAwaySheet` among the sheets composing the primitive set, but the success/call-away rendering is split across `CallAwaySheet.tsx` and `CallAwaySuccess.tsx`; the success tint mapping (line 37, 92) attributes the green eyebrow to `CallAwaySuccess` while the "Sheet primitive set" list names `CallAwaySheet`. Both files exist, so this is a minor naming inconsistency rather than a missing symbol. Suggested fix: clarify that `CallAwaySuccess` (not `CallAwaySheet`) carries the green success tint.

## Unverifiable (4)

- ? "replacing 367 static inline `style={{}}` blocks" (line 7) — a historical migration count; not verifiable against current source.
- ? "Components stay under a 200-line budget" / "Every component file stays under 200 lines" (lines 9, 73) — an aspirational/enforced rule; per-file line counts were not swept in this pass.
- ? "Before the extraction, each sheet redefined ~40 lines of identical ... markup" (line 32) — pre-refactor historical claim, not verifiable from current tree.
- ? "tests assert specific Tailwind class names (`toHaveClass('rounded-full')`)" (lines 49-50) — `Sheet.test.tsx` exists but individual assertion contents were not enumerated here; flag for human review if exact assertions matter.

## Missing files (0)

- (Cross-links to `../features/*.md` and `./02-adrs/*.md` were not resolved in this audit pass.)
