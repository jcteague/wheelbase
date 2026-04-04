# Story: Standardize on Tailwind + shadcn/ui Design System

**Priority:** P3
**Type:** Tech debt / Infrastructure
**Status:** Open

---

## Problem

The renderer has no centralized design system. Styles are scattered across 202 inline `style={{}}` instances in ~30 component files. The `wb-*` CSS variable token system exists in `index.css` but is not mapped into Tailwind, so components hardcode `var(--wb-gold)` rather than using Tailwind utilities. As a result:

- Changing a color, spacing value, or border radius requires touching every file individually
- New sheets (ExpirationSheet, AssignmentSheet, OpenCoveredCallSheet) each duplicate the same overlay/panel inline style objects
- There is no enforced visual consistency — each component makes its own style decisions
- The Tailwind + shadcn/ui infrastructure is already installed but only used in 7 base primitives

## Goal

**As a** developer building new sheets and components,
**I want** a centralized Tailwind-based design system with wb-* tokens mapped as utilities,
**So that** style changes propagate across all components from one place and new components are easy to build consistently.

## Acceptance Criteria

### Phase 1 — Token integration (prerequisite for all other phases)

```gherkin
Scenario: wb-* tokens available as Tailwind utilities
  Given the Tailwind config is extended with wb-* color tokens
  When a developer writes className="bg-wb-surface text-wb-text-primary"
  Then the correct CSS variable values are applied
  And no inline var(--wb-*) references are needed
```

```gherkin
Scenario: MONO font available as Tailwind utility
  Given the monospace font stack is registered in Tailwind's fontFamily config
  When a developer writes className="font-mono-wb"
  Then the correct monospace font stack is applied
  And the MONO constant in lib/tokens.ts is no longer needed at call sites
```

### Phase 2 — SheetPortal primitive

```gherkin
Scenario: All sheets use a shared portal wrapper
  Given SheetPortal exists in components/ui/
  When ExpirationSheet, AssignmentSheet, and OpenCoveredCallSheet render
  Then each uses <SheetPortal> for the overlay, scrim, and panel chrome
  And no sheet file contains its own overlayStyle or panelStyle objects
  And SIDEBAR_WIDTH is defined once inside SheetPortal
```

```gherkin
Scenario: Style change propagates to all sheets
  Given the panel width or box-shadow is changed in SheetPortal
  When all three sheets are rendered
  Then all three reflect the updated style without any per-sheet changes
```

### Phase 3 — High-impact component migration

```gherkin
Scenario: Sheet content components use Tailwind classes
  Given AssignmentSheet, OpenCoveredCallSheet, and ExpirationSheet content
  When a developer inspects the JSX
  Then layout, spacing, color, and typography use className with Tailwind utilities
  And inline style={} is absent except for truly dynamic values (e.g. calculated widths)
```

```gherkin
Scenario: Form components use Tailwind classes
  Given NewWheelForm, CloseCspForm, OpenCcForm, and FormField
  When a developer inspects the JSX
  Then all spacing, color, and typography use Tailwind utilities
  And no inline style objects exist for static properties
```

### Phase 4 — Full migration

```gherkin
Scenario: No static inline styles remain
  Given the full renderer source
  When searched for style={{ with static values
  Then only truly dynamic inline styles remain (e.g. style={{ width: calculatedPx }})
  And all static layout, color, spacing, and typography use Tailwind utilities
```

## Technical Notes

### Tailwind config extension needed

Map all `wb-*` CSS variables so they are usable as Tailwind utilities:

```typescript
// tailwind.config.ts (or @theme block in index.css for Tailwind v4)
colors: {
  'wb-bg-base':         'var(--wb-bg-base)',
  'wb-bg-surface':      'var(--wb-bg-surface)',
  'wb-bg-elevated':     'var(--wb-bg-elevated)',
  'wb-bg-hover':        'var(--wb-bg-hover)',
  'wb-border':          'var(--wb-border)',
  'wb-text-primary':    'var(--wb-text-primary)',
  'wb-text-secondary':  'var(--wb-text-secondary)',
  'wb-text-muted':      'var(--wb-text-muted)',
  'wb-gold':            'var(--wb-gold)',
  'wb-green':           'var(--wb-green)',
  'wb-red':             'var(--wb-red)',
  'wb-blue':            'var(--wb-blue)',
  'wb-teal':            'var(--wb-teal)',
}
```

Note: Tailwind v4 uses `@theme` in CSS rather than `tailwind.config.ts`. Confirm approach before implementing.

### SheetPortal API

```tsx
<SheetPortal onClose={onClose} isClosing={isClosing}>
  {content}
</SheetPortal>
```

Owns: `SIDEBAR_WIDTH` constant, `overlayStyle`, `panelStyle`, scrim click-to-close, `createPortal` call.

### Migration order (by impact)

1. `tailwind.config` / `@theme` — token integration (unlocks everything else)
2. `components/ui/SheetPortal.tsx` — new primitive
3. `ExpirationSheet.tsx`, `AssignmentSheet.tsx`, `OpenCoveredCallSheet.tsx` — adopt SheetPortal, migrate to Tailwind
4. `NewWheelForm.tsx`, `CloseCspForm.tsx`, `OpenCcForm.tsx`, `FormField.tsx` — form components
5. `pages/PositionDetailPage.tsx`, `pages/PositionsListPage.tsx` — page layouts
6. Remaining components (PositionCard, Stat, Badge, etc.)

### Inline styles that should remain

Dynamic values that cannot be expressed as Tailwind utilities are acceptable:
- `style={{ width: calculatedPixelValue }}`
- `style={{ left: SIDEBAR_WIDTH }}` (if not expressible as a utility)
- Truly runtime-computed values

## Out of Scope

- Dark/light theme toggle (the wb-* tokens are dark-only today; theme switching is a separate feature)
- Replacing shadcn/ui base primitives (button, input, form) — they already use Tailwind correctly
- Changing the visual design — this migration should be visually transparent

## Audit Summary (as of 2026-03-20)

| Category | Files | Inline style instances |
|---|---|---|
| Fully inline (sheets, forms, pages) | 9 | 124 |
| Mixed (inline + some Tailwind) | 7 | 78 |
| Minimal inline (≤3 instances) | 13 | 23 |
| Already Tailwind (shadcn primitives) | 7 | 0 |
| **Total** | **36** | **202** |

## Related

- `docs/issues/expiration-sheet-portal-styles.md` — original portal Tailwind issue that surfaced this problem
