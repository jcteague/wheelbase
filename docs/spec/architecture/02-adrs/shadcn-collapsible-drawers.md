# ADR: Cockpit drawers use the shadcn `Collapsible` primitive

<!-- generated:from us-34 -->

## Decision

The two reference drawers in the Position Cockpit ("Leg reference" and "Cost basis & history") are built on the shadcn `Collapsible` primitive (installed via `pnpm dlx shadcn@latest add collapsible`) wrapped in a thin `CollapsedDrawer` component. The chevron tracks open state via shadcn's `data-[state=open]:` attribute variant.

## Why

CLAUDE.md prefers shadcn/ui for UI primitives. `Collapsible` ships accessible keyboard toggling and `aria-expanded` for free; rolling our own with `useState` would duplicate that behaviour without the accessibility wins.

## Alternatives considered

- **Native `useState` + conditional render** (the handoff prototype's approach) — works but bypasses shadcn's accessibility plumbing.
- **Custom hook** — same problem; reinvents the primitive.

## Current state

The implementation diverged from the recorded decision. `CollapsedDrawer` (`src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx`) is built on the rejected `useState` + conditional-render approach, not the shadcn `Collapsible` primitive. There is no `Collapsible` primitive in the project (`src/renderer/src/components/ui/collapsible.tsx` does not exist, and `@radix-ui/react-collapsible` is not a dependency). The chevron is a manual `▼`/`▶` toggle driven by the `open` boolean, and `aria-expanded` is set explicitly in the code rather than provided by `data-[state=open]:` attribute variants. The rationale below (shadcn accessibility wins) reflects the original intent; revisit it if the drawers are migrated to the `Collapsible` primitive.

## Source

- `plans/us-34/research.md`
- `plans/us-34/plan.md` (Area 5)
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
