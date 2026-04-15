# Story: Standardize on Tailwind + shadcn/ui Design System

**Priority:** P3
**Type:** Tech debt / Infrastructure
**Status:** Phase 2 complete (different design than planned). Phases 1, 3, 4 open.

---

## Problem

The renderer has no centralized design system. Styles are scattered across 202 inline `style={{}}` instances in ~30 component files. The `wb-*` CSS variable token system exists in `index.css` but is not mapped into Tailwind, so components hardcode `var(--wb-gold)` rather than using Tailwind utilities. As a result:

- Changing a color, spacing value, or border radius requires touching every file individually
- New sheets (ExpirationSheet, AssignmentSheet, OpenCoveredCallSheet) each duplicate the same overlay/panel inline style objects
- There is no enforced visual consistency — each component makes its own style decisions
- The Tailwind + shadcn/ui infrastructure is already installed but only used in 7 base primitives

## Goal

**As a** developer building new sheets and components,
**I want** a centralized Tailwind-based design system with wb-\* tokens mapped as utilities,
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

### Phase 2 — Sheet primitives ✅ Complete (different design than planned)

The implementation diverged from the `SheetPortal` single-wrapper design. Instead, five separate primitives were extracted into `components/ui/Sheet.tsx`: `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`. All seven sheets (`ExpirationSheet`, `AssignmentSheet`, `OpenCoveredCallSheet`, `RollCspSheet`, `CloseCcEarlySheet`, `CcExpirationSheet`, `CallAwaySheet`) use these primitives. `SIDEBAR_WIDTH` is centralized in `Sheet.tsx`. Note: `createPortal(content, document.body)` is still called in each sheet consumer, not inside the primitives.

```gherkin
Scenario: All sheets use shared layout primitives
  Given Sheet.tsx exports SheetOverlay, SheetPanel, SheetHeader, SheetBody, SheetFooter
  When any sheet component renders
  Then it uses these primitives for overlay, panel chrome, header, body, and footer
  And no sheet file contains its own overlay or panel style objects
  And SIDEBAR_WIDTH is defined once in Sheet.tsx
```

```gherkin
Scenario: Style change propagates to all sheets
  Given the panel width or box-shadow is changed in SheetPanel
  When all sheets are rendered
  Then all reflect the updated style without any per-sheet changes
```

### Phase 3 — High-impact component migration

```gherkin
Scenario: Sheet content components use Tailwind classes
  Given all seven sheet components and their associated form/success components
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

### Sheet.tsx primitive API (as implemented)

```tsx
// consumers still call createPortal themselves
createPortal(
  <SheetOverlay onClose={onClose}>
    <SheetPanel>
      <SheetHeader eyebrow="..." title="..." subtitle="..." onClose={onClose} />
      <SheetBody>{content}</SheetBody>
      <SheetFooter>{actions}</SheetFooter>
    </SheetPanel>
  </SheetOverlay>,
  document.body
)
```

`Sheet.tsx` owns: `SIDEBAR_WIDTH`, overlay positioning, panel chrome (background, border, shadow, flex layout), header layout (eyebrow/title/subtitle/close button), body scroll, footer border. All implemented with inline styles. Consumers own: the `createPortal` call, and content-level inline styles (summary cards, P&L displays, warning callouts).

### Migration order (by impact)

1. `tailwind.config` / `@theme` — token integration (unlocks everything else)
2. ~~`components/ui/Sheet.tsx` — Sheet primitives~~ ✅ Done (inline styles; Tailwind migration deferred to Phase 3)
3. All seven sheets + associated form/success components — migrate content styles to Tailwind (highest inline style concentration: `AssignmentSheet` 41, `CallAwayForm` 38, `CallAwaySuccess` 31, `CcExpirationSheet` 22, `CloseCcEarlyForm` 21, `CloseCcEarlySuccess` 20, `ExpirationSheet` 19)
4. `NewWheelForm.tsx`, `CloseCspForm.tsx`, `OpenCcForm.tsx`, `RollCspForm.tsx`, `FormField.tsx` — form components
5. `pages/PositionDetailContent.tsx`, `pages/PositionsListPage.tsx` — page layouts
6. Remaining components (`PositionCard`, `LegHistoryTable`, `Stat`, `App.tsx`, etc.)

### Inline styles that should remain

Dynamic values that cannot be expressed as Tailwind utilities are acceptable:

- `style={{ width: calculatedPixelValue }}`
- `style={{ left: SIDEBAR_WIDTH }}` (if not expressible as a utility)
- Truly runtime-computed values

## Out of Scope

- Dark/light theme toggle (the wb-\* tokens are dark-only today; theme switching is a separate feature)
- Replacing shadcn/ui base primitives (button, input, form) — they already use Tailwind correctly
- Changing the visual design — this migration should be visually transparent

## Audit Summary (as of 2026-04-08)

Counts grew since March because additional sheets and success components were implemented (RollCspSheet, CloseCcEarlySheet, CcExpirationSheet, CallAwaySheet, and associated form/success components).

| Category                                                                                                              | Files                               | Inline style instances |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------- |
| Heavy inline (≥6 instances — sheets, forms, success states, pages, Sheet.tsx)                                         | 18                                  | ~315                   |
| Mixed (3–5 instances)                                                                                                 | 5                                   | ~18                    |
| Minimal inline (1–2 instances)                                                                                        | 15                                  | ~26                    |
| Single instance (AlertBox, Badge, Caption, CcPnlPreview, ErrorAlert, FormButton, NewWheelPage, PositionDetailActions) | 8                                   | 8                      |
| Already clean (shadcn primitives + zero-instance files)                                                               | ~10                                 | 0                      |
| **Total**                                                                                                             | **38 files with styles, ~48 total** | **367**                |

## Related

- `docs/issues/expiration-sheet-portal-styles.md` — original portal Tailwind issue that surfaced this problem
