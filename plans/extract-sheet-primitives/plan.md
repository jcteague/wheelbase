# Implementation Plan: Extract Shared Sheet Primitives

## Summary

Extract 5 composable sheet layout primitives (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`) plus a `SheetCloseButton` into `src/renderer/src/components/ui/Sheet.tsx`, then migrate all 7 existing sheet components to use them. This eliminates ~40 lines of duplicated inline styles per sheet and establishes a single source of truth for sheet layout. Done state: all 7 sheets use the shared primitives, all existing tests pass, `OpenCcSheetHeader.tsx` is deleted, and `SIDEBAR_WIDTH` is consolidated.

## Supporting Documents

- **Issue:** `docs/issues/extract-shared-sheet-primitives.md`
- **Research & Design Decisions:** `plans/extract-sheet-primitives/research.md`
- **Data Model (Component API):** `plans/extract-sheet-primitives/data-model.md`
- **Quickstart & Verification:** `plans/extract-sheet-primitives/quickstart.md`

## Prerequisites

All 7 sheet components are fully implemented and covered by existing unit tests and E2E tests. No schema, migration, or dependency changes needed.

## Implementation Areas

### 1. Sheet Primitives — Create `Sheet.tsx` + `Sheet.test.tsx`

**Files to create:**
- `src/renderer/src/components/ui/Sheet.tsx` — 6 primitives + `SIDEBAR_WIDTH` export
- `src/renderer/src/components/ui/Sheet.test.tsx` — unit tests for each primitive

**Red — tests to write:**

In `src/renderer/src/components/ui/Sheet.test.tsx`:

- `SheetOverlay renders children and scrim with onClick handler` — render with children, assert scrim div exists with `onClick`, assert `left: 200` on outer div
- `SheetOverlay calls onClose when scrim is clicked` — click the scrim div, assert `onClose` callback fires
- `SheetPanel renders children in a right-anchored container with default width 400` — render, assert `width: 400` in panel styles
- `SheetPanel accepts custom width` — render with `width={420}`, assert `width: 420`
- `SheetHeader renders eyebrow, title, and close button` — render with props, assert eyebrow text, title text, and close button present
- `SheetHeader renders subtitle when provided` — render with `subtitle`, assert it appears
- `SheetHeader omits subtitle when not provided` — render without `subtitle`, assert no subtitle element
- `SheetHeader applies custom eyebrowColor and borderBottomColor` — render with color overrides, assert styles applied
- `SheetHeader close button calls onClose` — click close button, assert callback fires
- `SheetBody renders scrollable children` — render with children, assert `overflowY: 'auto'` and children visible
- `SheetFooter renders children with top border` — render with button children, assert `borderTop` style and children visible
- `SheetCloseButton renders × button with aria-label` — render, assert `aria-label="Close sheet"` and `×` text content
- `SheetCloseButton calls onClick when clicked` — click button, assert callback fires

**Green — implementation:**

In `src/renderer/src/components/ui/Sheet.tsx`:

- Export `SIDEBAR_WIDTH = 200` constant
- `SheetOverlay({ children, onClose })` — fixed overlay with scrim backdrop. Uses `SIDEBAR_WIDTH` for `left` offset. Scrim div has `onClick={onClose}`.
- `SheetPanel({ children, width = 400 })` — absolute right-anchored flex column container. Applies `MONO` font family, `var(--wb-bg-surface)` background, `var(--wb-border)` left border, box shadow.
- `SheetHeader({ eyebrow, title, subtitle, onClose, eyebrowColor, borderBottomColor })` — flex row with left side (eyebrow span + title div + optional subtitle div) and right side (`SheetCloseButton`). Eyebrow uses uppercase, letter-spacing, `MONO` font. Default colors from `var(--wb-text-muted)` and `var(--wb-border)`.
- `SheetBody({ children })` — scrollable flex column with `padding: '20px 24px'`, `gap: 16`, `flex: 1`, `overflowY: 'auto'`.
- `SheetFooter({ children })` — flex row with `padding: '16px 24px'`, `borderTop`, `gap: 10`, `flexShrink: 0`.
- `SheetCloseButton({ onClick })` — 28×28 button with `aria-label="Close sheet"`, border, elevated background, `×` content.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with existing `ui/` components.

**Acceptance criteria covered:**
- "Create `src/renderer/src/components/ui/Sheet.tsx` with the 5 primitives"
- "Add tests for Sheet primitives"

---

### 2. Migrate `CloseCcEarlySheet` (simplest sheet)

**Files to modify:**
- `src/renderer/src/components/CloseCcEarlySheet.tsx` — replace overlay/panel structure with `SheetOverlay` + `SheetPanel`
- `src/renderer/src/components/CloseCcEarlyForm.tsx` — replace inline header/body/footer styles with `SheetHeader` + `SheetBody` + `SheetFooter`
- `src/renderer/src/components/CloseCcEarlySuccess.tsx` — replace inline header/body with `SheetHeader` + `SheetBody` + `SheetCloseButton`

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/CloseCcEarlySheet.test.tsx` serve as the regression safety net. Run them to confirm they still pass after migration.

**Green — implementation:**

In `CloseCcEarlySheet.tsx`:
- Remove local `SIDEBAR_WIDTH` constant
- Import `SheetOverlay`, `SheetPanel` from `./ui/Sheet`
- Replace the inline overlay div + scrim div + panel div with `<SheetOverlay onClose={props.onClose}><SheetPanel>…</SheetPanel></SheetOverlay>`
- Keep `createPortal(…, document.body)` wrapping the entire structure

In `CloseCcEarlyForm.tsx`:
- Import `SheetHeader`, `SheetBody`, `SheetFooter` from `./ui/Sheet`
- Replace the inline header div (padding, border-bottom, flex layout, close button) with `<SheetHeader eyebrow="Close CC Early" title={…} subtitle={…} onClose={onClose} />`
- Replace the inline body div (scrollable flex column) with `<SheetBody>…</SheetBody>`
- Replace the inline footer div (border-top, flex row with buttons) with `<SheetFooter>…</SheetFooter>`
- Remove now-unused inline style objects

In `CloseCcEarlySuccess.tsx`:
- Import `SheetHeader`, `SheetBody` from `./ui/Sheet`
- Replace inline success header with `<SheetHeader eyebrow="Trade Closed" title={…} onClose={onClose} />`
- Replace inline body wrapper with `<SheetBody>…</SheetBody>`

**Refactor — cleanup to consider:**
- Remove any unused style constants or imports from all three files.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (1 of 7)

---

### 3. Migrate `ExpirationSheet`

**Files to modify:**
- `src/renderer/src/components/ExpirationSheet.tsx` — replace overlay/panel/header/body/footer with primitives

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/ExpirationSheet.test.tsx` are the regression net.

**Green — implementation:**

In `ExpirationSheet.tsx`:
- Remove local `SIDEBAR_WIDTH`, `overlayStyle`, `scrimStyle`, `panelStyle`, `headerStyle`, `bodyStyle`, `footerStyle` constants
- Import `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetCloseButton` from `./ui/Sheet`
- Replace overlay + scrim + panel with `<SheetOverlay><SheetPanel>…</SheetPanel></SheetOverlay>`
- Replace header div with `<SheetHeader eyebrow="CSP Expiration" title={…} onClose={onClose} />`
- For the success state header, use `<SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="Expired Worthless" title={…} onClose={onClose} />`
- Replace body div with `<SheetBody>…</SheetBody>`
- Replace footer div with `<SheetFooter>…</SheetFooter>`

**Refactor — cleanup to consider:**
- Check that the form state vs. success state branching still reads cleanly after migration.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (2 of 7)

---

### 4. Migrate `CcExpirationSheet`

**Files to modify:**
- `src/renderer/src/components/CcExpirationSheet.tsx` — replace overlay/panel/header/body/footer with primitives

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/CcExpirationSheet.test.tsx` are the regression net.

**Green — implementation:**

In `CcExpirationSheet.tsx`:
- Remove local `SIDEBAR_WIDTH`, `overlayStyle`, `scrimStyle`, `panelStyle`, `headerStyle`, `bodyStyle`, `footerStyle` constants
- Import primitives from `./ui/Sheet`
- Replace overlay structure with `<SheetOverlay><SheetPanel>…</SheetPanel></SheetOverlay>`
- Replace form-state header with `<SheetHeader eyebrow="Expire CC" title={…} subtitle={…} onClose={onClose} />`
- Replace success-state header with `<SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="CC Expired Worthless" title={…} onClose={onClose} />`
- Replace body/footer wrappers with `<SheetBody>` / `<SheetFooter>`

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (3 of 7)

---

### 5. Migrate `AssignmentSheet`

**Files to modify:**
- `src/renderer/src/components/AssignmentSheet.tsx` — replace overlay/panel structure and inline header/body/footer with primitives

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/AssignmentSheet.test.tsx` are the regression net.

**Green — implementation:**

In `AssignmentSheet.tsx`:
- Remove local `SIDEBAR_WIDTH` and panel/overlay style constants
- Import primitives from `./ui/Sheet`
- Replace overlay structure with `<SheetOverlay><SheetPanel>…</SheetPanel></SheetOverlay>`
- The `AssignmentSheet` has an inline `AssignmentHeader` function — replace it with `<SheetHeader>` using appropriate `eyebrow`, `title`, `subtitle`, `eyebrowColor`, `borderBottomColor` props
- The success state uses different eyebrow/border colors (gold for assignment) — pass `eyebrowColor="var(--wb-gold)"` and `borderBottomColor="rgba(230,168,23,0.2)"`
- Replace body wrapper with `<SheetBody>`, footer with `<SheetFooter>`

**Refactor — cleanup to consider:**
- Remove the local `AssignmentHeader` function after replacing it with `SheetHeader`.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (4 of 7)

---

### 6. Migrate `CallAwaySheet`

**Files to modify:**
- `src/renderer/src/components/CallAwaySheet.tsx` — replace overlay/panel with primitives
- `src/renderer/src/components/CallAwayForm.tsx` — replace inline header/body/footer with primitives
- `src/renderer/src/components/CallAwaySuccess.tsx` — replace inline header/body with primitives

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/CallAwaySheet.test.tsx` are the regression net.

**Green — implementation:**

In `CallAwaySheet.tsx`:
- Remove local `SIDEBAR_WIDTH`, import `SheetOverlay`, `SheetPanel`
- Replace overlay/panel structure

In `CallAwayForm.tsx`:
- Import `SheetHeader`, `SheetBody`, `SheetFooter`
- Replace inline header (padding, border, flex layout, close button) with `<SheetHeader eyebrow="Record Call-Away" title={…} onClose={onClose} />`
- Replace body/footer wrappers

In `CallAwaySuccess.tsx`:
- Import `SheetHeader`, `SheetBody`
- Replace success header with `<SheetHeader eyebrowColor="var(--wb-green)" borderBottomColor="rgba(63,185,80,0.2)" eyebrow="Shares Called Away" title={…} onClose={onClose} />`
- Replace body wrapper

**Refactor — cleanup to consider:**
- Remove unused style objects from all three files.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (5 of 7)

---

### 7. Migrate `OpenCoveredCallSheet` + Delete `OpenCcSheetHeader`

**Files to modify:**
- `src/renderer/src/components/OpenCoveredCallSheet.tsx` — replace overlay/panel with primitives
- `src/renderer/src/components/OpenCcForm.tsx` — replace `OpenCcSheetHeader` usage with `SheetHeader`, replace body/footer
- `src/renderer/src/components/OpenCcSuccess.tsx` — replace `OpenCcSheetHeader` usage with `SheetHeader`, replace body
- `src/renderer/src/components/OpenCcSheetHeader.tsx` — **delete** (fully replaced by `SheetHeader`)

**Red — tests to write:**

No new tests. Existing tests (including E2E `e2e/open-covered-call.spec.ts`) serve as regression net.

**Green — implementation:**

In `OpenCoveredCallSheet.tsx`:
- Remove local `SIDEBAR_WIDTH`, import `SheetOverlay`, `SheetPanel`
- Replace overlay/panel structure

In `OpenCcForm.tsx`:
- Replace `import { OpenCcSheetHeader }` with `import { SheetHeader, SheetBody, SheetFooter }`
- Replace `<OpenCcSheetHeader eyebrow={…} title={…} subtitle={…} onClose={…} />` with `<SheetHeader eyebrow={…} title={…} subtitle={…} onClose={…} />`
- Replace body/footer wrappers

In `OpenCcSuccess.tsx`:
- Replace `OpenCcSheetHeader` import with `SheetHeader, SheetBody`
- Replace header and body usage
- Use `eyebrowColor="var(--wb-violet)"` and `borderBottomColor="rgba(188,140,255,0.2)"` for the success state

Delete `OpenCcSheetHeader.tsx`:
- Verify no remaining imports reference it (`grep -r "OpenCcSheetHeader"`)
- Remove the file

**Refactor — cleanup to consider:**
- Verify no remaining references to `OpenCcSheetHeader` anywhere in the codebase.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (6 of 7)
- "Refactor form + success sub-components that duplicate the header/close button"
- "Delete any now-unused style objects"

---

### 8. Migrate `RollCspSheet` (420px width)

**Files to modify:**
- `src/renderer/src/components/RollCspSheet.tsx` — replace overlay/panel with primitives, pass `width={420}`
- `src/renderer/src/components/RollCspForm.tsx` — replace inline header/body/footer with primitives
- `src/renderer/src/components/RollCspSuccess.tsx` — replace inline header/body with primitives

**Red — tests to write:**

No new tests. Existing tests in `src/renderer/src/components/RollCspSheet.test.tsx` and E2E `e2e/csp-roll.spec.ts` are the regression net.

**Green — implementation:**

In `RollCspSheet.tsx`:
- Remove local `SIDEBAR_WIDTH`, import `SheetOverlay`, `SheetPanel`
- Replace overlay/panel with `<SheetOverlay><SheetPanel width={420}>…</SheetPanel></SheetOverlay>`

In `RollCspForm.tsx`:
- Import `SheetHeader`, `SheetBody`, `SheetFooter`
- Replace inline header with `<SheetHeader eyebrow={rollTypeLabel} title="Roll Cash-Secured Put" subtitle={…} onClose={onClose} />`
- Replace body/footer wrappers

In `RollCspSuccess.tsx`:
- Import `SheetHeader`, `SheetBody`
- Replace success header with `<SheetHeader eyebrowColor={heroColor} borderBottomColor={heroBorder} eyebrow={rollType} title="Roll Confirmed" onClose={onClose} />`
- Replace body wrapper

**Refactor — cleanup to consider:**
- Check that the `width={420}` override is the only non-default prop needed.

**Acceptance criteria covered:**
- "Refactor all 7 sheet components to use them" (7 of 7)
- "Move `SIDEBAR_WIDTH` into the Sheet primitive"

---

### 9. Final Cleanup

**Files to modify:**
- All 7 sheet files and their sub-components — verify no remaining inline overlay/panel/header/body/footer styles

**Red — tests to write:**

No new tests. This area runs the full test suite as a final gate.

**Green — implementation:**

- Run `grep -r "SIDEBAR_WIDTH" src/renderer/` to confirm only `Sheet.tsx` defines it
- Run `grep -r "position: 'fixed'" src/renderer/src/components/` to confirm no remaining inline overlay styles in sheet components (some non-sheet components may legitimately use fixed positioning)
- Run `grep -r "OpenCcSheetHeader" src/` to confirm no remaining references
- Run `pnpm test && pnpm typecheck && pnpm lint` — all must pass
- Run `pnpm build && pnpm test:e2e` — all E2E tests must pass

**Refactor — cleanup to consider:**
- If any inline style objects remain in sheet files that duplicate what the primitives provide, remove them.

**Acceptance criteria covered:**
- All acceptance criteria verified via full regression suite.

---

### 10. E2E Tests

No new E2E tests are needed. This is a zero-behavior-change refactor. The existing E2E test suite covers all sheet interactions end-to-end:

**Existing E2E coverage (run as regression gate):**

- `e2e/csp-flow.spec.ts` — CSP open/close/expire flow (covers `ExpirationSheet`)
- `e2e/csp-assignment.spec.ts` — CSP assignment flow (covers `AssignmentSheet`)
- `e2e/open-covered-call.spec.ts` — Open CC flow (covers `OpenCoveredCallSheet`)
- `e2e/close-cc-early.spec.ts` — Close CC early flow (covers `CloseCcEarlySheet`)
- `e2e/cc-expiration.spec.ts` — CC expiration flow (covers `CcExpirationSheet`)
- `e2e/call-away.spec.ts` — Call-away flow (covers `CallAwaySheet`)
- `e2e/csp-roll.spec.ts` — CSP roll flow (covers `RollCspSheet`)

Each test exercises the full sheet lifecycle (open sheet, fill form, submit, verify success state, navigate away). If any structural regression is introduced by the migration, these tests will catch it.

**Verification command:**
```bash
pnpm build && pnpm test:e2e
```

All 8 E2E spec files must pass with zero failures.
