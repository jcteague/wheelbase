# Issue: Extract shared sheet primitives to eliminate inline style duplication

**Priority:** P2
**Type:** Tech debt / DX
**Status:** Open
**Blocked by:** None
**Related:** `design-system-tailwind-migration.md` (this is a pragmatic subset of that larger effort)

---

## Problem

Every sheet component (`AssignmentSheet`, `CallAwaySheet`, `CcExpirationSheet`, `CloseCcEarlySheet`, `ExpirationSheet`, `OpenCoveredCallSheet`, `RollCspSheet`) independently duplicates the same structural inline styles:

- **Scrim overlay** — fixed positioning, click-to-close backdrop
- **Panel** — absolute right-anchored container with `boxShadow`, border-left, flex column layout, width (400–420px), font family
- **Header** — padding, border-bottom, flex row with title/subtitle and close button
- **Body** — scrollable flex column with gap and padding
- **Footer** — border-top, flex row with Cancel + Confirm buttons

Each new sheet copies ~40 lines of identical style objects from an existing sheet, then customizes only the content. This makes it hard to change shared behavior (e.g., adjusting the panel width, animation, or shadow) without touching every file.

### Current duplication count

| Pattern                                        | Files                        | Identical lines per file |
| ---------------------------------------------- | ---------------------------- | ------------------------ |
| Panel container style                          | 7                            | ~12 lines                |
| Scrim + portal wrapper                         | 7                            | ~3 lines                 |
| Header layout                                  | 7                            | ~10 lines                |
| Close button (×)                               | 7+ (form + success variants) | ~8 lines                 |
| Footer layout                                  | 7                            | ~6 lines                 |
| `SIDEBAR_WIDTH = 200` constant                 | 7                            | 1 line                   |
| `boxShadow: var(--wb-shadow-sheet)` / raw rgba | 7                            | 1 line                   |

## Proposed Solution

Extract shared sheet primitives into `src/renderer/src/components/ui/Sheet.tsx`:

```typescript
// Composable sheet primitives — no business logic, just layout
export function SheetPortal({ open, onClose, children }) // scrim + portal + panel container
export function SheetHeader({ eyebrow, title, subtitle, variant, onClose }) // header with close button
export function SheetBody({ children }) // scrollable content area
export function SheetFooter({ children }) // sticky bottom bar
export function SheetCloseButton({ onClick }) // × button (extracted from header for success states)
```

Each existing sheet would become ~50% shorter, containing only its unique content:

```typescript
// Before: ~150 lines with duplicated layout
export function RollCspSheet(props) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, left: 200, zIndex: 50 }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, ... }}>
        {/* 40+ lines of repeated structural JSX */}

// After: ~70 lines focused on business content
export function RollCspSheet(props) {
  return (
    <SheetPortal open={open} onClose={onClose} width={420}>
      <SheetHeader eyebrow={rollType} title="Roll Cash-Secured Put" subtitle={...} onClose={onClose} />
      <SheetBody>
        {/* Only unique content here */}
      </SheetBody>
      <SheetFooter>
        <FormButton label="Cancel" ... />
        <FormButton label="Confirm Roll" ... />
      </SheetFooter>
    </SheetPortal>
  )
}
```

## Scope

- Create `src/renderer/src/components/ui/Sheet.tsx` with the 5 primitives
- Refactor all 7 sheet components to use them
- Refactor form + success sub-components that duplicate the header/close button
- Move `SIDEBAR_WIDTH` into the Sheet primitive
- Add tests for Sheet primitives

## Approach

1. Extract primitives from one sheet (e.g., `CloseCcEarlySheet` — simplest)
2. Verify all existing tests still pass
3. Migrate remaining sheets one at a time, running tests after each
4. Delete any now-unused style objects

This is a safe refactor — no behavior change, all covered by existing component tests.
