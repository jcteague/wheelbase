---
page: docs/spec/architecture/03-design-system.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/03-design-system.md

## Verified (20)

- ✓ `@theme inline` in `src/renderer/src/index.css` defines `--color-wb-*` for every token listed in the Colours catalogue. The grep set matches exactly: bg-base/surface/elevated/hover, border/border-subtle, text-primary/secondary/muted, gold(+dim/border/subtle), green(+dim/border/subtle), red(+dim), blue(+dim), teal(+dim/bright), violet(+dim), sky.
- ✓ `--font-wb-mono` stack matches the page (`src/renderer/src/index.css:98`)
- ✓ `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)` (`src/renderer/src/index.css:101`)
- ✓ `<div id="sheet-portal" />` is a sibling of `<main>` inside `AppShell` (`src/renderer/src/App.tsx:95-110`)
- ✓ Sheets portal into `#sheet-portal` via `getSheetPortal()` (`src/renderer/src/lib/portal.ts:9-10`). Note: it falls back to `document.body` when the div is not mounted, e.g. in isolated tests.
- ✓ `Sheet.tsx` exports `SheetCloseButton`, `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter` (`src/renderer/src/components/ui/Sheet.tsx:3,16,39,56,95,103`)
- ✓ `SheetOverlay` uses hardcoded `left-[200px]` (`ui/Sheet.tsx:25`); no `SIDEBAR_WIDTH` constant exists in `src/renderer/`
- ✓ `SheetPanel` defaults `width = 400` with `bg-wb-bg-surface border-l border-wb-border shadow-sheet font-wb-mono text-wb-text-primary` (`ui/Sheet.tsx:41,48`)
- ✓ `SheetHeader({ eyebrow, title, subtitle?, onClose, eyebrowColor?, borderBottomColor? })` signature (`ui/Sheet.tsx:56-70`)
- ✓ `OpenCcSheetHeader.tsx` is deleted
- ✓ `createPortal` is called by consumer sheets, not inside primitives (`ExpirationSheet.tsx:63`, `RollCspSheet.tsx:112`, `AssignmentSheet.tsx:149`, `CcExpirationSheet.tsx:89`, `CloseCcEarlySheet.tsx:88`, `OpenCoveredCallSheet.tsx:117`, `CallAwaySheet.tsx:42`)
- ✓ Logo-dot inline `boxShadow` glow is a documented dynamic exception (`src/renderer/src/App.tsx:35`)
- ✓ `wb-nav-link` and `wb-position-row` hover rules exist; the hover border reads `var(--wb-row-phase-color)` and the background reads `var(--wb-row-bg)` (`index.css:200-221`)
- ✓ No `onMouseEnter` hover state in renderer components (grep empty)
- ✓ `lib/format.ts` exports `fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte` (`:4,14,18,40,48`)
- ✓ `lib/phase.ts` exports `PHASE_COLOR`, `PHASE_LABEL` (`CSP_OPEN: 'Sell Put'`), `PHASE_LABEL_SHORT` (`CSP_OPEN: 'CSP Open'`) (`:3,16-17,51-52`)
- ✓ `lib/tokens.ts:1` still exports `MONO`
- ✓ `PhaseBadge({ phase, variant?: 'default' | 'short' })` (`components/PhaseBadge.tsx:7,10`); `LoadingState` has `role="status"` and default `'Loading…'` (`ui/LoadingState.tsx:5,8`); `ErrorAlert` has `role="alert"` (`ui/ErrorAlert.tsx:9`)
- ✓ `NavItem`, `StatGrid`/`Stat` (`ui/Stat.tsx`), `Breadcrumb`, `FormField`, `FormButton`, `AlertBox`, `Caption`, `NumberInput`, `date-picker`, `CcPnlPreview`, `TablePrimitives`, `Badge`, `SectionCard` all exist
- ✓ `useCreatePosition` invalidates the positions query key in the hook (`src/renderer/src/hooks/useCreatePosition.ts:18`)

## Drift (6)

- ✗ Lines 37, 125: "only `RollCspSheet` overrides to `420`". `RollCcSheet.tsx:110` also sets `width={420}` and `ScreeningCriteriaSheet.tsx:33` sets `width={460}`. Suggested fix: list all overrides.
- ✗ Line 49: "The `Sheet.tsx` test suite migrates… to `toHaveClass('rounded-full')`". `src/renderer/src/components/ui/Sheet.test.tsx` (171 lines) contains no `toHaveClass` assertions; its only `toHave*` matchers are `toHaveBeenCalledTimes` (`:33,127,169`).
- ✗ Line 67: "The earlier pattern of a `useEffect` watching `mutation.isSuccess` … is removed." `src/renderer/src/components/NewWheelForm.tsx:74-78` still has `useEffect(() => { if (!mutation.isSuccess || !mutation.data) return; … navigate(...) }, [mutation.isSuccess, …])`.
- ✗ Line 73: "Every component file stays under 200 lines." Many exceed it, e.g. `ScreeningCriteriaForm.tsx` (466), `WatchlistEntryForm.tsx` (364), `NewWheelForm.tsx` (337), `CcExpirationSheet.tsx` (333), `AssignmentSheet.tsx` (324), `RollCcForm.tsx` (309), `LegHistoryTable.tsx` (258), `position-cockpit/PositionCockpit.tsx` (249), `RollCspForm.tsx` (244).
- ✗ Lines 25, 133: the portal target is described as `document.getElementById('sheet-portal')`, "never `document.body`". `getSheetPortal()` falls back to `document.body` when `#sheet-portal` is not mounted (`src/renderer/src/lib/portal.ts:10`). Minor precision gap.
- ✗ Line 144: `PageLayout` is listed among the components that "all live in `components/ui/`". It is at `src/renderer/src/components/PageLayout.tsx`.

## Unverifiable (5)

- ? Line 7: "replacing 367 static inline `style={{}}` blocks": historical count, not mechanically checkable now.
- ? Line 9 / 43: "every static structural style is a Tailwind utility". A full-codebase judgement; not mechanically audited here.
- ? Line 26: the Radix `@layer` specificity rationale and the ruled-out HMR hypothesis: narrative history.
- ? Line 37 / 92: the success-tint colour mapping per sheet (green/gold/violet) was not traced per call site.
- ? Line 62 / 68: the Vercel rule rationales: narrative.

## Missing files (1)

- ✗ Line 104 cites `plans/design-system/data-model.md`, which doesn't exist (plan dirs were deleted).

All linked feature pages (us-2, us-4 through us-12, us-34) and ADRs (sheet-component-pattern, react-hook-form-zod, shadcn-collapsible-drawers, wouter-hash-routing-query-prefill) exist.
