---
plan: extract-sheet-primitives
source: plans/extract-sheet-primitives/
extracted_at: 2026-06-01
status: complete
---

# Extract: extract-sheet-primitives

## Summary
Extract 5 composable sheet layout primitives (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`) plus a `SheetCloseButton` into `src/renderer/src/components/ui/Sheet.tsx`, then migrate all 7 existing sheet components to use them. This eliminates ~40 lines of duplicated inline styles per sheet and establishes a single source of truth for sheet layout. Done state: all 7 sheets use the shared primitives, all existing tests pass, `OpenCcSheetHeader.tsx` is deleted, and `SIDEBAR_WIDTH` is consolidated.

## Architecture Decisions

### ADR: Portal Rendering Strategy
- **Decision:** Keep `createPortal(…, document.body)` inside each sheet component, not inside the shared primitive. The `SheetPortal` primitive renders the overlay/scrim/panel structure but the `createPortal` call stays in the sheet wrapper.
- **Why:** Some sheets may eventually need different portal targets, and keeping the portal call at the sheet level keeps the primitives pure layout components testable without portal mocking.
- **Alternatives considered:** Moving `createPortal` into `SheetPortal` — rejected because it couples the primitive to DOM API and complicates unit tests (every test would need `document.body` setup).
- **Source:** `plans/extract-sheet-primitives/research.md`

### ADR: Component API Style
- **Decision:** Use children-based composition (not render props or config objects). Each primitive (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetCloseButton`) is a standalone component composed via JSX nesting.
- **Why:** Matches the existing codebase pattern (e.g., `SectionCard`, `StatGrid`, `PageLayout`). Maximizes flexibility — sheets with success states can swap `SheetHeader` props without changing the primitive.
- **Alternatives considered:** Single `<Sheet>` component with slot props — rejected as too rigid for the variety of sheet layouts (form vs. success state).
- **Source:** `plans/extract-sheet-primitives/research.md`

### ADR: Width Variation Handling
- **Decision:** `SheetPanel` accepts an optional `width` prop defaulting to `400`. Only `RollCspSheet` passes `420`.
- **Why:** Only one sheet uses a non-standard width. A prop is simpler than a variant system.
- **Alternatives considered:** Named size variants (`"default" | "wide"`) — over-engineering for a single exception.
- **Source:** `plans/extract-sheet-primitives/research.md`

### ADR: Header Variation Handling
- **Decision:** `SheetHeader` accepts optional `borderBottomColor` and `eyebrowColor` props for success-state tinting. The existing `OpenCcSheetHeader` will be replaced by `SheetHeader`.
- **Why:** Success states tint the header border green/gold. A color prop handles this without variant enums.
- **Alternatives considered:** Separate `SheetSuccessHeader` — rejected because the structure is identical, only colors differ.
- **Source:** `plans/extract-sheet-primitives/research.md`

### ADR: SIDEBAR_WIDTH Consolidation
- **Decision:** Export `SIDEBAR_WIDTH` from the new `Sheet.tsx` module. Remove the 7 local definitions.
- **Why:** Single source of truth. Already used identically across all sheets.
- **Alternatives considered:** Moving to `lib/tokens.ts` — acceptable but `Sheet.tsx` is the only consumer, so co-location is cleaner.
- **Source:** `plans/extract-sheet-primitives/research.md`

### ADR: Test Strategy
- **Decision:** Write unit tests for each primitive in `Sheet.test.tsx`. Existing sheet component tests remain unchanged — they test business behavior, not layout. Run all existing tests after each migration to catch regressions.
- **Why:** The refactor is pure structural — no behavior change. Existing tests are the regression safety net. New tests verify the primitives render correctly.
- **Alternatives considered:** Snapshot tests — rejected per project convention (no snapshot tests in codebase).
- **Source:** `plans/extract-sheet-primitives/research.md`

## Contracts

### SheetOverlay
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetOverlay(props: {
  children: React.ReactNode
  onClose: () => void
}): React.ReactElement
```
Renders:
```
<div style="position:fixed; inset:0; left:SIDEBAR_WIDTH; z-index:50">
  <div style="position:absolute; inset:0" onClick={onClose} />  <!-- scrim -->
  {children}
</div>
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SheetPanel
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetPanel(props: {
  children: React.ReactNode
  width?: number // default 400
}): React.ReactElement
```
Renders:
```
<div style="position:absolute; top:0; right:0; bottom:0; width:{width}; background:var(--wb-bg-surface); border-left:1px solid var(--wb-border); display:flex; flex-direction:column; font-family:MONO; color:var(--wb-text-primary); box-shadow:-12px 0 48px rgba(0,0,0,0.5)">
  {children}
</div>
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SheetHeader
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetHeader(props: {
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  eyebrowColor?: string // default 'var(--wb-text-muted)'
  borderBottomColor?: string // default 'var(--wb-border)'
}): React.ReactElement
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SheetBody
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetBody(props: { children: React.ReactNode }): React.ReactElement
```
Renders:
```
<div style="padding:20px 24px; overflow-y:auto; display:flex; flex-direction:column; gap:16; flex:1">
  {children}
</div>
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SheetFooter
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetFooter(props: { children: React.ReactNode }): React.ReactElement
```
Renders:
```
<div style="padding:16px 24px; border-top:1px solid var(--wb-border); display:flex; gap:10; flex-shrink:0">
  {children}
</div>
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SheetCloseButton
- **Type:** React component (renderer primitive)
- **Shape:**
```typescript
export function SheetCloseButton(props: { onClick: () => void }): React.ReactElement
```
Renders:
```
<button type="button" aria-label="Close sheet" style="width:28; height:28; border-radius:6; border:1px solid var(--wb-border); background:var(--wb-bg-elevated); color:var(--wb-text-muted); cursor:pointer">×</button>
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

### SIDEBAR_WIDTH (exported constant)
- **Type:** Renderer constant
- **Shape:**
```typescript
export const SIDEBAR_WIDTH = 200
```
- **Source:** `plans/extract-sheet-primitives/data-model.md`, `plans/extract-sheet-primitives/red-phase-results.md`
- **Implementation:** `src/renderer/src/components/ui/Sheet.tsx`

## Schema Changes
None recorded. Per `plans/extract-sheet-primitives/data-model.md`: "No new data model, IPC surface, or DB schema. This is a pure renderer-layer refactor."

## Acceptance Criteria
- Create `src/renderer/src/components/ui/Sheet.tsx` with the 5 primitives
- Add tests for Sheet primitives
- Refactor all 7 sheet components to use them
- Refactor form + success sub-components that duplicate the header/close button
- Delete any now-unused style objects
- Move `SIDEBAR_WIDTH` into the Sheet primitive
- All Red tasks complete (primitive tests written and failing)
- All Green tasks complete (all tests passing)
- All Refactor tasks complete (lint + typecheck clean)
- E2E regression suite passes — all 9 spec files green (59 tests)
- `OpenCcSheetHeader.tsx` deleted with no remaining references
- `SIDEBAR_WIDTH` consolidated to single export in `Sheet.tsx`
- `pnpm test && pnpm lint && pnpm typecheck` — all clean

## Decisions & Tradeoffs
- **All inline styles, no CSS modules:** Each primitive is a single function component returning a styled `<div>` (or `<button>` for `SheetCloseButton`). All styles are inline, matching the existing codebase pattern. Imports `MONO` from `lib/tokens` for font consistency. (Source: `plans/extract-sheet-primitives/green-phase-results.md`)
- **JSDOM space normalization in test assertions:** `borderBottomColor` assertion needed adjustment (`rgba(63,185,80,0.2)` → `rgba(63, 185, 80, 0.2)`) to match how JSDOM stringifies styles. (Source: `plans/extract-sheet-primitives/green-phase-results.md`)
- **Drop default `React` import:** Refactor removed `import React, { type ReactNode } from 'react'` in favor of `import { type ReactNode } from 'react'` because the project uses the `react-jsx` runtime and no other `ui/` component imports `React` as default. (Source: `plans/extract-sheet-primitives/refactor-phase-results.md`)
- **Style assertion pattern:** Tests use `getAttribute('style')` + `toContain()` matching the existing `Badge.test.tsx` pattern; scrim is verified as first child of the overlay; subtitle absence is checked via both `queryByText` and `data-testid="sheet-subtitle"`. (Source: `plans/extract-sheet-primitives/red-phase-results.md`)
- **Migration order:** `CloseCcEarlySheet` first as the simplest sheet, then `ExpirationSheet`, `CcExpirationSheet`, `AssignmentSheet`, `CallAwaySheet`, `OpenCoveredCallSheet` (with `OpenCcSheetHeader` deletion), and `RollCspSheet` last because it uses the 420px width override. (Source: `plans/extract-sheet-primitives/plan.md`)
- **Success-state color tints per sheet:** green (`var(--wb-green)` + `rgba(63,185,80,0.2)`) for ExpirationSheet, CcExpirationSheet, and CallAwaySuccess; gold (`var(--wb-gold)` + `rgba(230,168,23,0.2)`) for AssignmentSheet; violet (`var(--wb-violet)` + `rgba(188,140,255,0.2)`) for OpenCcSuccess. (Source: `plans/extract-sheet-primitives/plan.md`)

## Source Code References
- `src/renderer/src/components/ui/Sheet.tsx`
- `src/renderer/src/components/ui/Sheet.test.tsx`
- `src/renderer/src/components/CloseCcEarlySheet.tsx`
- `src/renderer/src/components/CloseCcEarlyForm.tsx`
- `src/renderer/src/components/CloseCcEarlySuccess.tsx`
- `src/renderer/src/components/ExpirationSheet.tsx`
- `src/renderer/src/components/CcExpirationSheet.tsx`
- `src/renderer/src/components/AssignmentSheet.tsx`
- `src/renderer/src/components/CallAwaySheet.tsx`
- `src/renderer/src/components/CallAwayForm.tsx`
- `src/renderer/src/components/CallAwaySuccess.tsx`
- `src/renderer/src/components/OpenCoveredCallSheet.tsx`
- `src/renderer/src/components/OpenCcForm.tsx`
- `src/renderer/src/components/OpenCcSuccess.tsx`
- `src/renderer/src/components/RollCspSheet.tsx`
- `src/renderer/src/components/RollCspForm.tsx`
- `src/renderer/src/components/RollCspSuccess.tsx`
- `src/renderer/src/components/OpenCcSheetHeader.tsx` (deleted — verified absent)

## Open Questions
None recorded.
