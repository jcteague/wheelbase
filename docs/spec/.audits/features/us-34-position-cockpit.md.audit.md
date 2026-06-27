---
page: docs/spec/features/us-34-position-cockpit.md
audited_at: 2026-06-27
findings: 2
---

# Audit: docs/spec/features/us-34-position-cockpit.md

Cockpit decomposition, pure verdict module, and page wiring all verify. The
only drift is the "shadcn Collapsible" implementation claim, which contradicts
the actual `useState`-based drawer.

## Verified (8)

- ✓ `src/renderer/src/lib/verdict.ts` exports `MANAGEMENT_RULES` (`:38`),
  `deltaSeverity` (`:67`), `SEVERITY_COLOR` (`:88`), `computeDistance` (`:103`),
  `computePnl` (`:118`), `computeThetaYield` (`:128`), `computeVerdict`
  (`:138`), `SHARES_VERDICT` (`:213`).
- ✓ All eight cockpit components + `.spec.tsx` files present under
  `src/renderer/src/components/position-cockpit/` (PnlBar, DeltaGauge,
  DistanceThermo, CollapsedDrawer, ContextStrip, RiskSnapshot, VerdictBlock,
  PositionCockpit).
- ✓ `verdict.spec.ts` exists in `src/renderer/src/lib/`.
- ✓ `e2e/position-cockpit.spec.ts` exists.
- ✓ `PositionDetailPage.tsx` imports `useOptionSnapshots` (`:17`) and
  `useStockQuotes` (`:18`); calls `useStockQuotes(data ? [data.position.ticker]
: [])` (`:54`) and derives `underlyingPrice` (`:55`), threaded down
  (`:151`).
- ✓ `useOptionSnapshots(legSummaries)` called (`PositionDetailPage.tsx:53`).
- ✓ `PositionDetailPage.test.tsx` exists; `PositionDetailContent.tsx` exists.
- ✓ All `./` and `../` spec links resolve.

## Drift (2)

- ✗ Page asserts (Summary AC-7, ADR "shadcn `Collapsible` for drawers", "What
  was built" → `CollapsedDrawer` = "shadcn-`Collapsible` wrapper", and source
  bullet `components/ui/collapsible.tsx` "added via pnpm dlx shadcn add
  collapsible"). **`src/renderer/src/components/ui/collapsible.tsx` does not
  exist.** `CollapsedDrawer.tsx:1` imports only
  `{ useState, type ReactNode } from 'react'` — it rolls its own toggle with
  `useState`, exactly the approach the ADR says was rejected. The accessible-
  keyboard / `aria-expanded` "for free" rationale does not hold for the
  shipped code.

- ✗ Source-files list includes
  `src/renderer/src/components/ui/collapsible.tsx`. That file is absent from
  the `ui/` directory.

## Unverifiable (2)

- ? Exact e2e test count ("24 Playwright tests"), unit test counts (14 verdict,
  11 ContextStrip, 12 PositionCockpit, 42 page-level) — not mechanically
  counted in this audit; flag for human review if the numbers matter.
- ? `ivRank` "forward-compat, not yet sourced" — narrative; not drift.

## Missing files (1)

- ✗ `src/renderer/src/components/ui/collapsible.tsx` (claimed source file)
  does not exist.

Suggested fix: either replace the shadcn-Collapsible ADR/claims with the
actual `useState`-based `CollapsedDrawer` implementation, or (if shadcn
Collapsible is the intended state) add the primitive. Remove the
`ui/collapsible.tsx` source-file bullet until the file exists.
