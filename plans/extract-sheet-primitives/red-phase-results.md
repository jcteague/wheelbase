# Red Phase Results: Extract Shared Sheet Primitives

## Feature Context

- **Feature directory**: `plans/extract-sheet-primitives/`
- **Issue**: `docs/issues/extract-shared-sheet-primitives.md`
- **Plan file**: `plans/extract-sheet-primitives/plan.md`

## Test Files Created

- `src/renderer/src/components/ui/Sheet.test.tsx` — 13 tests covering all 6 primitives + `SIDEBAR_WIDTH`

## Interfaces Under Test

```typescript
// src/renderer/src/components/ui/Sheet.tsx
export const SIDEBAR_WIDTH = 200

export function SheetOverlay(props: {
  children: React.ReactNode
  onClose: () => void
}): React.ReactElement

export function SheetPanel(props: {
  children: React.ReactNode
  width?: number  // default 400
}): React.ReactElement

export function SheetHeader(props: {
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  eyebrowColor?: string    // default 'var(--wb-text-muted)'
  borderBottomColor?: string // default 'var(--wb-border)'
}): React.ReactElement

export function SheetBody(props: {
  children: React.ReactNode
}): React.ReactElement

export function SheetFooter(props: {
  children: React.ReactNode
}): React.ReactElement

export function SheetCloseButton(props: {
  onClick: () => void
}): React.ReactElement
```

## Test Coverage Summary

### SheetOverlay (2 tests)
- [x] Renders children and scrim with onClick handler; asserts `left: SIDEBAR_WIDTH` on overlay
- [x] Calls onClose when scrim is clicked

### SheetPanel (2 tests)
- [x] Renders children in right-anchored container with default width 400
- [x] Accepts custom width (420)

### SheetHeader (5 tests)
- [x] Renders eyebrow, title, and close button
- [x] Renders subtitle when provided
- [x] Omits subtitle when not provided (no data-testid="sheet-subtitle" element)
- [x] Applies custom eyebrowColor and borderBottomColor
- [x] Close button calls onClose

### SheetBody (1 test)
- [x] Renders scrollable children with `overflow-y: auto`

### SheetFooter (1 test)
- [x] Renders children with `border-top` style

### SheetCloseButton (2 tests)
- [x] Renders × button with `aria-label="Close sheet"`
- [x] Calls onClick when clicked

## Test Design Assumptions

- Style assertions use `getAttribute('style')` + `toContain()` matching the existing Badge.test.tsx pattern
- Scrim is the first child of the overlay div; panel content follows it
- Subtitle absence is verified both by `queryByText` and by checking no `data-testid="sheet-subtitle"` element exists
- `SIDEBAR_WIDTH` is imported and used in assertions to avoid hardcoding the value

## Test Execution Results

```
FAIL src/renderer/src/components/ui/Sheet.test.tsx
  Error: Failed to resolve import "./Sheet" from "src/renderer/src/components/ui/Sheet.test.tsx". Does the file exist?

Test Files  1 failed (1)
Tests       no tests
```

## Verification

- Every test fails because `Sheet.tsx` does not exist yet — not due to test bugs
- No syntax errors in the test file
- No fixture or import errors caused by test setup mistakes

## Handoff to Green Phase

To resume: run `/green`. Green phase should:
1. Read this file for all interfaces to implement
2. Read `plans/extract-sheet-primitives/data-model.md` for exact render structure
3. Create `src/renderer/src/components/ui/Sheet.tsx` with the 6 exports + `SIDEBAR_WIDTH`
