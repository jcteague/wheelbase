# ADR: Cockpit drawers use the shadcn `Collapsible` primitive

<!-- generated:from us-34 -->

## Decision

The two reference drawers in the Position Cockpit ("Leg reference" and "Cost basis & history") are built on the shadcn `Collapsible` primitive (installed via `pnpm dlx shadcn@latest add collapsible`) wrapped in a thin `CollapsedDrawer` component. The chevron tracks open state via shadcn's `data-[state=open]:` attribute variant.

## Why

CLAUDE.md prefers shadcn/ui for UI primitives. `Collapsible` ships accessible keyboard toggling and `aria-expanded` for free; rolling our own with `useState` would duplicate that behaviour without the accessibility wins.

## Alternatives considered

- **Native `useState` + conditional render** (the handoff prototype's approach) — works but bypasses shadcn's accessibility plumbing.
- **Custom hook** — same problem; reinvents the primitive.

## Source

- `plans/us-34/research.md`
- `plans/us-34/plan.md` (Area 5)
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
