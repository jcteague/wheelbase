# Issue: Tailwind Styles Don't Apply Inside ExpirationSheet Portal

**Beads:** wheelbase-6lx
**Priority:** P3
**Status:** Open / deferred — workaround solidified via Sheet primitive extraction

---

## What's Happening

`ExpirationSheet` uses `createPortal(content, document.body)` to render the overlay outside the React component tree. This correctly fixes the positioning problem (overlays anchored to the viewport, not trapped by `overflow: hidden` ancestors), but Tailwind utility classes stop working for elements rendered inside the portal.

Specifically, layout and appearance classes fail to produce visible output:

- `border`, `border-b`, `border-[var(--wb-border)]` — no borders rendered
- `bg-[var(--wb-bg-elevated)]`, `bg-[var(--wb-green-dim)]` — no backgrounds
- `rounded-lg` — no border-radius
- `px-4 py-3` — padding appears to not apply

Text color classes (`text-[var(--wb-text-secondary)]`, `text-[var(--wb-green)]`) **do** work, as do `tailwindcss-animate` classes (`animate-in`, `slide-in-from-right`).

## Current Workaround

`ExpirationSheet.tsx` was rewritten to use 100% inline React styles (`React.CSSProperties` objects) for all layout, spacing, color, and border properties.

Subsequently, the sheet layout primitives were extracted into `src/renderer/src/components/ui/Sheet.tsx` (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`). `ExpirationSheet` now delegates all structural layout to these primitives, which also use inline styles throughout. The component renders correctly. The workaround is now systemic — the entire sheet subsystem (primitives + consumer) bypasses Tailwind — so it is internally consistent, but still diverges from the Tailwind-first pattern used elsewhere in the codebase.

## Root Cause Candidates

1. **Tailwind v4 content scan** — Arbitrary value classes like `bg-[var(--wb-bg-elevated)]` may not be emitted by the JIT compiler if the portal renders outside the scanned DOM tree. (Unlikely — the classes appear in the source file which is scanned at build time.)

2. **CSS specificity / `@layer` ordering** — Tailwind v4 uses `@layer` for utility classes. Elements rendered as direct children of `<body>` (outside `#root`) may be hit by a higher-specificity reset or base rule.

3. **`body { overflow: hidden }` stacking context** — The `index.css` sets `html, body, #root { overflow: hidden }`. This creates a stacking context on `<body>` which might interact unexpectedly with how Tailwind injects styles.

4. **Hot reload artifact** — The file was rewritten with the `Write` tool during a running dev session. Vite's HMR may not have regenerated the Tailwind CSS for the new arbitrary-value classes. A full restart (`pnpm dev`) might resolve it, making this a non-issue in production builds.

## How to Investigate

1. Start fresh: `pnpm dev` from scratch (full restart, not HMR)
2. Open the ExpirationSheet and inspect elements in DevTools
3. Check whether the Tailwind classes appear in the computed styles panel
4. If classes exist but don't apply → specificity issue
5. If classes are absent from the stylesheet → JIT scan or HMR issue
6. Compare with a non-portal component using the same arbitrary-value classes (e.g. `PositionDetailPage`) to isolate the portal vs class issue

## Files Affected

- `src/renderer/src/components/ui/Sheet.tsx` — extracted Sheet primitives; all use inline styles
- `src/renderer/src/components/ExpirationSheet.tsx` — uses Sheet primitives; additional inline styles for summary cards, P&L display, and warning callout
- `src/renderer/src/index.css` — `body { overflow: hidden }` and Tailwind config
