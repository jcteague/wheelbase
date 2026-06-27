# Design System

<!-- generated:from design-system,extract-sheet-primitives,fix-sheet-portal-styles,frontend-perf-reuse -->

## Overview

The renderer's visual layer is a Tailwind v4 + `wb-*` token design system layered on top of shadcn/ui primitives. The current state is the product of four overlapping refactors: a frontend cleanup that introduced shared formatters and UI primitives (`PhaseBadge`, `SectionCard`, `LoadingState`, `ErrorAlert`) and pulled hover state into CSS; a portal-target diagnostic that moved sheet portals from `document.body` into a `#sheet-portal` div inside `#root` so Tailwind utilities inside sheets land in the same `@layer` scope; a sheet-primitive extraction that consolidated five duplicated sheet-layout components (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, plus `SheetCloseButton`) into one `Sheet.tsx` module; and a global design-system migration that exposed every `wb-*` color token plus a monospace font and a sheet shadow as Tailwind utilities via `@theme inline`, then walked the renderer area by area replacing 367 static inline `style={{}}` blocks with class names.

The done state — encoded as architectural rule rather than aspiration — is that every static structural style is a Tailwind utility; only genuinely runtime-dynamic values (prop-driven widths, computed colors set via CSS custom properties) remain as inline `style`. Components stay under a 200-line budget. Formatting and phase-label logic live once in `src/renderer/src/lib/`. Hover effects are CSS pseudo-classes, not React state.

<!-- /generated -->

<!-- generated:from design-system,extract-sheet-primitives,fix-sheet-portal-styles,frontend-perf-reuse -->

## Key decisions

### Tailwind v4 `@theme inline` is the token bridge

- **Decision:** The existing `@theme inline` block in `src/renderer/src/index.css` is extended with `--color-wb-*` entries for every wb-color token, a `--font-wb-mono` stack, and a `--shadow-sheet` panel shadow. Tailwind v4 resolves these directly into utility output, so `--color-wb-gold: var(--wb-gold)` generates `bg-wb-gold`, `text-wb-gold`, `border-wb-gold`, etc., with no separate config file.
- **Why:** The project already used `@theme inline` for shadcn token mapping; Tailwind v4 has moved to CSS-based configuration and a `tailwind.config.ts` `theme.extend.colors` approach no longer applies. Treating `wb-*` tokens as named utilities (rather than inline `bg-[var(--wb-gold)]` arbitrary values everywhere) gives a flat, greppable surface and keeps the token names readable.
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md), [us-4 — Close a CSP early](../features/us-4-close-csp.md), [us-7 — Open covered call](../features/us-7-open-covered-call.md)

### Portal target lives inside `#root` so Tailwind utilities apply

- **Decision:** A `<div id="sheet-portal" />` sits as a sibling to `<main>` inside `AppShell` in `App.tsx`. The shadcn `SheetPortal` wrapper and every custom sheet's `createPortal` call use `document.getElementById('sheet-portal')` as the container, never `document.body`.
- **Why:** Radix portals into `document.body` by default. Elements outside `#root` fall outside Tailwind v4's `@layer` scope — box-model utilities (border, padding, background, border-radius) silently lose specificity to base/reset rules; only text color survives because it inherits from `:root`. The single portal-target change makes every future Sheet inherit correct utility behaviour without any per-component workaround. The HMR-artifact hypothesis was ruled out first via a fresh `pnpm dev` restart before the structural fix landed.
- **Driven by:** [us-5 — Record CSP expiration](../features/us-5-expire-csp.md), [us-7 — Open covered call](../features/us-7-open-covered-call.md)

### One canonical Sheet primitive set powers every action sheet

- **Decision:** Sheet layout is decomposed into six children-composed primitives — `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetCloseButton` — exported from `src/renderer/src/components/ui/Sheet.tsx` and reused by every action sheet (`ExpirationSheet`, `CcExpirationSheet`, `AssignmentSheet`, `OpenCoveredCallSheet`, `CloseCcEarlySheet`, `CallAwaySheet` / `CallAwaySuccess`, `RollCspSheet`). The 200 px sidebar offset is a hardcoded Tailwind arbitrary value (`left-[200px]` in `SheetOverlay`) rather than a shared `SIDEBAR_WIDTH` constant. The pre-extraction header component `OpenCcSheetHeader.tsx` is deleted.
- **Why:** Before the extraction, each sheet redefined ~40 lines of identical overlay/panel/header/footer markup as inline styles. A single composable primitive set means a style change (token swap, shadow tweak, scrim opacity) propagates to every sheet through one file. Children-based composition matches the existing `SectionCard`/`StatGrid`/`PageLayout` codebase pattern, keeping the primitives flexible enough to serve both form and success states without a variant enum.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md), [us-5 — Record CSP expiration](../features/us-5-expire-csp.md), [us-6 — Record CSP assignment](../features/us-6-record-assignment.md), [us-7 — Open covered call](../features/us-7-open-covered-call.md), [us-8 — Close a covered call early](../features/us-8-close-cc-early.md), [us-9 — Record CC expiration](../features/us-9-expire-cc.md), [us-10 — Record shares called away](../features/us-10-call-away.md), [us-12 — Roll a CSP](../features/us-12-roll-csp.md)

### Sheet variation is handled by props, not variant enums

- **Decision:** `SheetPanel.width` is an optional number prop defaulting to `400`; only `RollCspSheet` overrides to `420`. `SheetHeader.borderBottomColor` and `eyebrowColor` are optional string props used by success states to tint the header (green for `ExpirationSheet`/`CcExpirationSheet`/`CallAwaySuccess`, gold for `AssignmentSheet`, violet for `OpenCcSuccess`).
- **Why:** A single override (the roll panel's 420 px width) does not earn a `"default" | "wide"` variant system, and the small set of success tints is cleaner expressed as colour strings than as named themes.
- **Driven by:** [us-12 — Roll a CSP](../features/us-12-roll-csp.md), [us-6 — Record CSP assignment](../features/us-6-record-assignment.md), [us-7 — Open covered call](../features/us-7-open-covered-call.md)

### Inline `style` is reserved for runtime-dynamic values

- **Decision:** Static structural styles must be Tailwind classes. Inline `style` is acceptable only when a value is unknown at build time: `SheetPanel.width` (runtime prop), `SheetHeader.eyebrowColor` / `borderBottomColor` (runtime prop), the Wheelbase logo dot's `boxShadow` glow (no Tailwind equivalent without custom config), per-row CSS custom properties on `PositionRow` (`--wb-row-bg`, `--wb-row-phase-color`), and multi-stop linear gradients used in success hero cards.
- **Why:** Tailwind v4's JIT scanner reads source statically — runtime-computed class names like `` `w-[${width}px]` `` never produce CSS. Inline styles are the correct tool for those genuinely dynamic cases, and the architectural rule (in `CLAUDE.md`) draws the line cleanly so reviewers know which inline styles are intentional. Conditional class strings where both branches are present in source (e.g. `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'`) are JIT-safe and remain the preferred pattern.
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md), [us-12 — Roll a CSP](../features/us-12-roll-csp.md)

### Class-name assertions are the migration's TDD signal

- **Decision:** For each migrated component, tests assert specific Tailwind class names on rendered elements (`expect(element).toHaveClass('border-t')`). The `Sheet.tsx` test suite migrates from `toHaveStyle({ borderRadius: '50%' })`-style assertions to `toHaveClass('rounded-full')` as part of its Red phase. Existing behaviour tests (text content, interactions) serve as regression guard.
- **Why:** Without class-asserting tests the migration has no Red → Green signal; snapshot tests are brittle for class-heavy markup, and visual-only verification has no regression net. Component-level class assertions are the migration's regression net; no dedicated design-system E2E spec landed in `e2e/`.
- **Driven by:** [us-7 — Open covered call](../features/us-7-open-covered-call.md), [us-12 — Roll a CSP](../features/us-12-roll-csp.md)

### Shared formatters and phase labels live once in `lib/`

- **Decision:** `src/renderer/src/lib/format.ts` exports the pure formatters `fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte`. `src/renderer/src/lib/phase.ts` exports both `PHASE_LABEL` (descriptive — e.g. `CSP_OPEN: 'Sell Put'`) and `PHASE_LABEL_SHORT` (compact — e.g. `CSP_OPEN: 'CSP Open'`); `PHASE_COLOR` lives alongside them. `src/renderer/src/lib/tokens.ts` exports the `MONO` font-family constant; deletion is deferred until every consumer migrates to the `font-wb-mono` Tailwind utility.
- **Why:** Pre-refactor the codebase had three slight variations of the same formatter (`fmt`, `fmtMoney`, `formatPremium`) across 4+ files, and two different `PHASE_LABEL` records — one descriptive (detail page), one short (table cells). Centralising the pure functions makes formatting consistent and shrinks every page that consumed them. Keeping `MONO` co-located lets the migration proceed area by area without a flag day.
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md), [us-11 — Wheel leg-chain display](../features/us-11-leg-history.md), [us-34 — Position cockpit](../features/us-34-position-cockpit.md)

### Hover is CSS, not React state

- **Decision:** Hover effects use `:hover` pseudo-class utility rules (e.g. `wb-nav-link`, `wb-position-row` defined in `index.css`), never `useState(false)` + `onMouseEnter`/`onMouseLeave`. The `PositionRow` phase-coloured left border on hover is the one exception: the color is per-row dynamic, so the row sets `--wb-row-phase-color` as an inline CSS custom property and the hover rule reads it via `border-left-color: var(--wb-row-phase-color)` — no React state involved.
- **Why:** React state for transient hover is a Vercel `rerender-use-ref-transient-values` violation — every mouse enter/leave triggers a full re-render, which adds up across a multi-row position table. CSS hover is zero-cost from React's perspective and matches the existing Tailwind-first stack.
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md)

### Effect-to-callback discipline for mutation side effects

- **Decision:** Form components call `mutation.mutate(payload, { onSuccess, onError })` and put redirect + error-mapping logic directly in those callbacks. The earlier pattern of a `useEffect` watching `mutation.isSuccess` / `mutation.error` is removed.
- **Why:** Vercel `rerender-derived-state-no-effect` — co-locating cause (mutation completes) and effect (set form errors / navigate) avoids stale-closure bugs and double-fire risks from effects, and is simpler to read. TanStack Query's per-call `onSuccess` / `onError` already fire exactly once per mutation. Hook-level invalidation lives in the mutation hook (e.g. `useCreatePosition` calls `queryClient.invalidateQueries(['positions'])`); component-specific form-error mapping with `setError` belongs in the component's `mutate()` call.
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md), [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### 200-line file budget

- **Decision:** Every component file stays under 200 lines. Long sheets split into orchestrator + form + success + optional pure helper (canonical case: the `OpenCoveredCallSheet` four-file split, mirrored by every subsequent sheet that grew). Long pages extract `StatGrid`/`Stat`, breadcrumb, and section-card-style chunks into their own files.
- **Why:** Forces the natural seams of a sheet (orchestrate → form → success → guardrail math) into named files, which lines up with the existing `SheetX.tsx` / `SheetXForm.tsx` / `SheetXSuccess.tsx` naming. Keeps reviewers oriented and makes diff size predictable.
- **Driven by:** [us-7 — Open covered call](../features/us-7-open-covered-call.md), [us-12 — Roll a CSP](../features/us-12-roll-csp.md)

<!-- /generated -->

<!-- generated:from design-system,extract-sheet-primitives,fix-sheet-portal-styles,frontend-perf-reuse -->

## Token catalogue

All tokens flow through the `@theme inline` block in `src/renderer/src/index.css` and are consumed as named Tailwind utilities (`bg-wb-*`, `text-wb-*`, `border-wb-*`, `font-wb-mono`, `shadow-sheet`).

### Colours

- **Backgrounds:** `wb-bg-base`, `wb-bg-surface`, `wb-bg-elevated`, `wb-bg-hover`.
- **Borders:** `wb-border`, `wb-border-subtle`.
- **Text:** `wb-text-primary`, `wb-text-secondary`, `wb-text-muted`.
- **Accents:** `wb-gold` (+ `-dim`, `-border`, `-subtle`), `wb-green` (+ `-dim`, `-border`, `-subtle`), `wb-red` (+ `-dim`), `wb-blue` (+ `-dim`), `wb-teal` (+ `-dim`, `-bright`), `wb-violet` (+ `-dim`), `wb-sky`.

Phase tones in success-state sheet headers follow a stable mapping: green for `ExpirationSheet` / `CcExpirationSheet` / `CallAwaySuccess`, gold for `AssignmentSheet`, violet for `OpenCcSuccess`. P&L direction is `text-wb-green` (gain) / `text-wb-red` (loss), with `-dim` variants for muted contexts.

### Typography

- `font-wb-mono` — the canonical monospace stack (`ui-monospace`, `'SF Mono'`, `Menlo`, `'Cascadia Code'`, `'Fira Code'`, `monospace`). The legacy `MONO` constant in `src/renderer/src/lib/tokens.ts` still exists during the gradual migration; new code uses `font-wb-mono`.

### Shadows

- `shadow-sheet` — `-12px 0 48px rgba(0, 0, 0, 0.5)` for right-side sheet panels.

### Inline-style conversion patterns

Standardised in `plans/design-system/data-model.md` and applied through every migrated component:

| Inline style                           | Tailwind utility          |
| -------------------------------------- | ------------------------- |
| `fontFamily: MONO`                     | `font-wb-mono`            |
| `background: 'var(--wb-bg-elevated)'`  | `bg-wb-bg-elevated`       |
| `border: '1px solid var(--wb-border)'` | `border border-wb-border` |
| `borderRadius: 8`                      | `rounded-lg`              |
| `borderRadius: 6`                      | `rounded-md`              |
| `flex: 1`                              | `flex-1`                  |
| `flexShrink: 0`                        | `shrink-0`                |
| `opacity: 0.5`                         | `opacity-50`              |
| `left: 200` (sidebar offset)           | `left-[200px]`            |

`SheetPanel.width`, `SheetHeader.eyebrowColor` / `borderBottomColor`, the logo-dot glow, per-row phase-colour custom properties, and multi-stop linear gradients are intentionally NOT converted — they are documented dynamic exceptions (see Key decisions).

## Sheet primitives

`src/renderer/src/components/ui/Sheet.tsx` exports the layout pieces every action sheet composes:

- `SheetOverlay({ children, onClose })` — fixed-position scrim + frame, offset from the left by the hardcoded `left-[200px]` so the sidebar stays visible. Scrim is the first child of the overlay and dismisses on click.
- `SheetPanel({ children, width = 400 })` — right-anchored full-height panel, `bg-wb-bg-surface`, left border `border-wb-border`, `shadow-sheet`, `font-wb-mono` colour `text-wb-text-primary`. Width is a runtime prop (only `RollCspSheet` overrides to 420).
- `SheetHeader({ eyebrow, title, subtitle?, onClose, eyebrowColor?, borderBottomColor? })` — uppercase eyebrow + title + optional subtitle, with a close button on the right. `eyebrowColor` / `borderBottomColor` tint the header for success states.
- `SheetBody({ children })` — vertically scrolling content area with consistent padding and gap.
- `SheetFooter({ children })` — bottom action bar with top border and horizontal flex layout for buttons.
- `SheetCloseButton({ onClick })` — the standalone `×` button used inside `SheetHeader` (exported so callers can place a close affordance elsewhere if needed).

The 200 px sidebar left-offset is a hardcoded `left-[200px]` Tailwind arbitrary value in `SheetOverlay`, not a shared `SIDEBAR_WIDTH` constant.

`createPortal` is called by the consumer sheet (e.g. `ExpirationSheet`), not inside the primitive, so the primitives are pure layout components that don't need DOM mocking in unit tests. The portal target is always `document.getElementById('sheet-portal')` — set up once in `App.tsx`.

## Shared renderer primitives

Reusable components above shadcn that the design system relies on. Located in `src/renderer/src/components/` (top-level) or `src/renderer/src/components/ui/` (lower-level primitives):

- `PhaseBadge({ phase, variant?: 'default' | 'short' })` — phase colour dot + label + tinted background. `short` variant is used in `PositionCard` table rows; `default` on detail pages.
- `LoadingState({ message? })` — `role="status"` pulsing gold dot + message; default "Loading…".
- `ErrorAlert({ children })` — `role="alert"` `bg-wb-red-dim` / `text-wb-red` block for inline errors.
- `SectionCard({ header?, children })` — bordered surface card with optional uppercase header bar.
- `NavItem({ href, label, icon, active })` — sidebar nav row using the `wb-nav-link` CSS hover class.
- `PageLayout`, `StatGrid`, `Stat`, `Breadcrumb`, `FormField`, `FormButton`, `AlertBox`, `Caption`, `NumberInput`, `DatePicker`, `CcPnlPreview`, `TablePrimitives`, `Badge` — all live in `components/ui/`. Referenced for completeness; not exhaustively detailed here.

`src/renderer/src/lib/format.ts` (`fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte`) and `src/renderer/src/lib/phase.ts` (`PHASE_LABEL`, `PHASE_LABEL_SHORT`, `PHASE_COLOR`) are the canonical pure-function modules every page imports.

## Mount-point contract

`src/renderer/src/App.tsx` renders (referenced for completeness):

```
<div id="root">
  <AppShell>
    <Sidebar />
    <main>{routes}</main>
    <div id="sheet-portal" />
  </AppShell>
</div>
```

Every Sheet's `createPortal(..., document.getElementById('sheet-portal'))` mounts inside `#root` so Tailwind `@layer utilities` rules apply with full specificity.

<!-- /generated -->

<!-- generated:from design-system,extract-sheet-primitives,fix-sheet-portal-styles,frontend-perf-reuse -->

## Driven by

- [us-2 — Position list](../features/us-2-position-list.md)
- [us-4 — Close a CSP early](../features/us-4-close-csp.md)
- [us-5 — Record CSP expiration](../features/us-5-expire-csp.md)
- [us-6 — Record CSP assignment](../features/us-6-record-assignment.md)
- [us-7 — Open covered call](../features/us-7-open-covered-call.md)
- [us-8 — Close a covered call early](../features/us-8-close-cc-early.md)
- [us-9 — Record CC expiration](../features/us-9-expire-cc.md)
- [us-10 — Record shares called away](../features/us-10-call-away.md)
- [us-11 — Wheel leg-chain display](../features/us-11-leg-history.md)
- [us-12 — Roll a CSP](../features/us-12-roll-csp.md)
- [us-34 — Position cockpit](../features/us-34-position-cockpit.md)

## Related ADRs

- [Sheet component pattern](./02-adrs/sheet-component-pattern.md) — portal + form-then-success structure of every action sheet.
- [React Hook Form + Zod resolver](./02-adrs/react-hook-form-zod.md) — the form layer the design system styles.
- [shadcn collapsible drawers](./02-adrs/shadcn-collapsible-drawers.md) — where shadcn primitives sit beneath the `wb-*` token surface.
- [wouter hash routing](./02-adrs/wouter-hash-routing-query-prefill.md) — the routing layer the layout primitives live inside.

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
