---
page: docs/spec/architecture/02-adrs/shadcn-collapsible-drawers.md
audited_at: 2026-06-27
findings: 1
---

# Audit: shadcn-collapsible-drawers.md

## Verified (3)

- ✓ Two reference drawers exist in the Position Cockpit ("Leg reference", "Cost basis & history") — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:97,138`.
- ✓ Wrapped in a thin `CollapsedDrawer` component — `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx:10`.
- ✓ Chevron tracks open state — `CollapsedDrawer.tsx:27` toggles `▼`/`▶` from the `open` boolean (and sets `aria-expanded`).

## Drift (1)

- ✗ Page claims the drawers are "built on the shadcn `Collapsible` primitive (installed via `pnpm dlx shadcn@latest add collapsible`)" with the chevron tracked "via shadcn's `data-[state=open]:` attribute variant". The actual implementation is the _rejected_ alternative: `useState` + conditional render (`CollapsedDrawer.tsx:16` `useState`, `:32` `{open ? <div>{children}</div> : null}`), with a manual `▼`/`▶` chevron (`:27`) and no `data-[state=open]:` variant. No `collapsible` primitive exists (`src/renderer/src/components/ui/collapsible.tsx` absent; no `@radix-ui/react-collapsible` in `package.json`). Suggested fix: rewrite the ADR to reflect the `useState` implementation, or migrate `CollapsedDrawer` to the shadcn `Collapsible` primitive the ADR describes.

## Unverifiable (1)

- ? "ships accessible keyboard toggling and `aria-expanded` for free" — rationale for the (non-implemented) shadcn approach; `aria-expanded` is in fact set manually in the current code.

## Missing files (0)

- `plans/us-34/...` and feature page — plan/feature references.
