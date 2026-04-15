# Extract Shared Sheet Primitives — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Sheet Primitives (no dependencies)

> Create the shared primitives that all migrations depend on.

### Sheet Primitives

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ui/Sheet.test.tsx`
  - Test cases:
    - `SheetOverlay renders children and scrim with onClick handler`
    - `SheetOverlay calls onClose when scrim is clicked`
    - `SheetPanel renders children in a right-anchored container with default width 400`
    - `SheetPanel accepts custom width`
    - `SheetHeader renders eyebrow, title, and close button`
    - `SheetHeader renders subtitle when provided`
    - `SheetHeader omits subtitle when not provided`
    - `SheetHeader applies custom eyebrowColor and borderBottomColor`
    - `SheetHeader close button calls onClose`
    - `SheetBody renders scrollable children`
    - `SheetFooter renders children with top border`
    - `SheetCloseButton renders × button with aria-label`
    - `SheetCloseButton calls onClick when clicked`
  - Run `pnpm test src/renderer/src/components/ui/Sheet.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ui/Sheet.tsx` _(depends on: Sheet Primitives Red ✓)_
  - Export `SIDEBAR_WIDTH = 200`
  - `SheetOverlay({ children, onClose })` — fixed overlay with scrim, `left: SIDEBAR_WIDTH`
  - `SheetPanel({ children, width = 400 })` — absolute right-anchored flex column
  - `SheetHeader({ eyebrow, title, subtitle?, onClose, eyebrowColor?, borderBottomColor? })` — header bar with close button
  - `SheetBody({ children })` — scrollable flex column, `padding: '20px 24px'`, `gap: 16`
  - `SheetFooter({ children })` — flex row with top border, `padding: '16px 24px'`
  - `SheetCloseButton({ onClick })` — 28×28 button, `aria-label="Close sheet"`, `×` content
  - Run `pnpm test src/renderer/src/components/ui/Sheet.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ui/Sheet.tsx` _(depends on: Sheet Primitives Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Sheet Migrations (depends on Layer 1)

> All 7 migrations can run in parallel after Sheet Primitives Green is complete. Each replaces inline overlay/panel/header/body/footer styles with the shared primitives.

### Migrate CloseCcEarlySheet (simplest)

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `CloseCcEarlySheet.tsx`, `CloseCcEarlyForm.tsx`, `CloseCcEarlySuccess.tsx` _(depends on: Sheet Primitives Green ✓)_
  - `CloseCcEarlySheet.tsx`: Remove local `SIDEBAR_WIDTH`, replace overlay/scrim/panel with `SheetOverlay` + `SheetPanel`, keep `createPortal`
  - `CloseCcEarlyForm.tsx`: Replace inline header with `SheetHeader eyebrow="Close CC Early"`, body with `SheetBody`, footer with `SheetFooter`
  - `CloseCcEarlySuccess.tsx`: Replace inline header with `SheetHeader eyebrow="Trade Closed"`, body with `SheetBody`
  - Run `pnpm test src/renderer/src/components/CloseCcEarlySheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `CloseCcEarlySheet.tsx`, `CloseCcEarlyForm.tsx`, `CloseCcEarlySuccess.tsx` _(depends on: Migrate CloseCcEarlySheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Remove unused style constants/imports
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate ExpirationSheet

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `ExpirationSheet.tsx` _(depends on: Sheet Primitives Green ✓)_
  - Remove local `SIDEBAR_WIDTH`, `overlayStyle`, `scrimStyle`, `panelStyle`, `headerStyle`, `bodyStyle`, `footerStyle`
  - Replace overlay structure with `SheetOverlay` + `SheetPanel`
  - Form-state header: `SheetHeader eyebrow="CSP Expiration"`
  - Success-state header: `SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="Expired Worthless"`
  - Body → `SheetBody`, Footer → `SheetFooter`
  - Run `pnpm test src/renderer/src/components/ExpirationSheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `ExpirationSheet.tsx` _(depends on: Migrate ExpirationSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate CcExpirationSheet

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `CcExpirationSheet.tsx` _(depends on: Sheet Primitives Green ✓)_
  - Remove local `SIDEBAR_WIDTH`, overlay/panel/header/body/footer style constants
  - Replace overlay with `SheetOverlay` + `SheetPanel`
  - Form-state header: `SheetHeader eyebrow="Expire CC"`
  - Success-state header: `SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="CC Expired Worthless"`
  - Body → `SheetBody`, Footer → `SheetFooter`
  - Run `pnpm test src/renderer/src/components/CcExpirationSheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `CcExpirationSheet.tsx` _(depends on: Migrate CcExpirationSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate AssignmentSheet

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `AssignmentSheet.tsx` _(depends on: Sheet Primitives Green ✓)_
  - Remove local `SIDEBAR_WIDTH` and inline style constants
  - Replace overlay with `SheetOverlay` + `SheetPanel`
  - Replace local `AssignmentHeader` function with `SheetHeader` — gold success tint: `eyebrowColor="var(--wb-gold)"`, `borderBottomColor="rgba(230,168,23,0.2)"`
  - Body → `SheetBody`, Footer → `SheetFooter`
  - Run `pnpm test src/renderer/src/components/AssignmentSheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `AssignmentSheet.tsx` _(depends on: Migrate AssignmentSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Remove local `AssignmentHeader` function
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate CallAwaySheet

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `CallAwaySheet.tsx`, `CallAwayForm.tsx`, `CallAwaySuccess.tsx` _(depends on: Sheet Primitives Green ✓)_
  - `CallAwaySheet.tsx`: Remove local `SIDEBAR_WIDTH`, replace overlay/panel with `SheetOverlay` + `SheetPanel`
  - `CallAwayForm.tsx`: Replace inline header with `SheetHeader eyebrow="Record Call-Away"`, body with `SheetBody`, footer with `SheetFooter`
  - `CallAwaySuccess.tsx`: Replace inline header with `SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="Shares Called Away"`, body with `SheetBody`
  - Run `pnpm test src/renderer/src/components/CallAwaySheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `CallAwaySheet.tsx`, `CallAwayForm.tsx`, `CallAwaySuccess.tsx` _(depends on: Migrate CallAwaySheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate OpenCoveredCallSheet + Delete OpenCcSheetHeader

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `OpenCoveredCallSheet.tsx`, `OpenCcForm.tsx`, `OpenCcSuccess.tsx` _(depends on: Sheet Primitives Green ✓)_
  - `OpenCoveredCallSheet.tsx`: Remove local `SIDEBAR_WIDTH`, replace overlay/panel with `SheetOverlay` + `SheetPanel`
  - `OpenCcForm.tsx`: Replace `OpenCcSheetHeader` import with `SheetHeader, SheetBody, SheetFooter`; replace usage accordingly
  - `OpenCcSuccess.tsx`: Replace `OpenCcSheetHeader` with `SheetHeader` using `eyebrowColor="var(--wb-violet)"`, `borderBottomColor="rgba(188,140,255,0.2)"`; body with `SheetBody`
  - Delete `OpenCcSheetHeader.tsx` — verify no remaining imports via `grep -r "OpenCcSheetHeader" src/`
  - Run `pnpm test` — all existing tests must pass (including E2E `e2e/open-covered-call.spec.ts`)
- [x] **[Refactor]** `/refactor` — `OpenCoveredCallSheet.tsx`, `OpenCcForm.tsx`, `OpenCcSuccess.tsx` _(depends on: Migrate OpenCoveredCallSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Migrate RollCspSheet (420px width)

**Requires:** Sheet Primitives Green ✓

- [x] **[Green]** Migrate — `RollCspSheet.tsx`, `RollCspForm.tsx`, `RollCspSuccess.tsx` _(depends on: Sheet Primitives Green ✓)_
  - `RollCspSheet.tsx`: Remove local `SIDEBAR_WIDTH`, replace overlay/panel with `SheetOverlay` + `SheetPanel width={420}`
  - `RollCspForm.tsx`: Replace inline header with `SheetHeader eyebrow={rollTypeLabel} title="Roll Cash-Secured Put"`, body with `SheetBody`, footer with `SheetFooter`
  - `RollCspSuccess.tsx`: Replace inline header with `SheetHeader eyebrowColor={heroColor} borderBottomColor={heroBorder}`, body with `SheetBody`
  - Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — existing tests must pass
- [x] **[Refactor]** `/refactor` — `RollCspSheet.tsx`, `RollCspForm.tsx`, `RollCspSuccess.tsx` _(depends on: Migrate RollCspSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Final Cleanup + E2E Verification (depends on Layer 2)

> Run after all migrations are complete.

### Final Cleanup

**Requires:** All Layer 2 Green + Refactor tasks ✓

- [x] **[Green]** Verify cleanup _(depends on: all Layer 2 tasks ✓)_
  - `grep -r "SIDEBAR_WIDTH" src/renderer/` — only `Sheet.tsx` defines it
  - `grep -r "position: 'fixed'" src/renderer/src/components/` — no remaining inline overlay styles in sheet components
  - `grep -r "OpenCcSheetHeader" src/` — no remaining references
  - Run `pnpm test && pnpm typecheck && pnpm lint` — all clean

### E2E Regression Suite

**Requires:** Final Cleanup ✓

- [x] **[Green]** Run full E2E suite _(depends on: Final Cleanup ✓)_
  - `pnpm build && pnpm test:e2e` — all 8 E2E spec files must pass with zero failures
  - Coverage: `csp-flow`, `csp-assignment`, `open-covered-call`, `close-cc-early`, `cc-expiration`, `call-away`, `csp-roll`

---

## Completion Checklist

- [x] All Red tasks complete (primitive tests written and failing)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E regression suite passes — all 9 spec files green (59 tests)
- [x] `OpenCcSheetHeader.tsx` deleted with no remaining references
- [x] `SIDEBAR_WIDTH` consolidated to single export in `Sheet.tsx`
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
