---
page: docs/spec/architecture/02-adrs/shadcn-collapsible-drawers.md
audited_at: 2026-09-28
findings: 1
---

# Audit: shadcn-collapsible-drawers.md

## Verified (6)

- ✓ "Current state" section: `CollapsedDrawer` uses `useState` + conditional render — `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx:1,16,32`.
- ✓ No `src/renderer/src/components/ui/collapsible.tsx` (directory listing) and no `@radix-ui/react-collapsible` in `package.json` (grep empty).
- ✓ Chevron is a manual `▼`/`▶` toggle — `CollapsedDrawer.tsx:27`.
- ✓ `aria-expanded` set explicitly — `CollapsedDrawer.tsx:23`.
- ✓ Two drawers "Leg reference" and "Cost basis & history" — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:97,138`.
- ✓ Feature link `../../features/us-34-position-cockpit.md` exists.

## Drift (0)

None. The Decision section describes the original intent; the page's own "Current state" section records the divergence accurately.

## Unverifiable (1)

- ? Rationale on shadcn accessibility — narrative; sources are historical `plans/us-34/*` (dir not present, by design).

## Missing files (0)

None.
