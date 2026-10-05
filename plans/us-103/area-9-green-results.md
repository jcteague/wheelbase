# Green Phase Results: US-103 Area 9 — Renderer (`fmtPct1`, `PmccCostBasis`, cockpit stack)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan**: `plans/us-103/plan.md` § 9. Renderer; tasks: `plans/us-103/tasks.md` Area 9
- **Red results**: `plans/us-103/area-9-red-results.md`
- **Mockup (layout of record)**: `mockups/epic-09-pmcc-position-detail.mdx` — `Cost basis` CollapsedDrawer (~L2573). Followed label order, `minWidth={150}`, `fieldCount={6}`, `defaultOpen`, sky basis. Two intentional departures: `OwnerNote` → production `Caption` (wrapped in `px-5 pt-3`), and the mockup's green credits colour is ruled out by the story — credits render neutral.

## Files touched (production)

- `src/renderer/src/lib/format.ts` — `fmtPct1(value: string)`: Decimal half-up to 1 dp + `%`
- `src/renderer/src/api/positions.ts` — `export type { PmccLedgerResult } from '../../../main/core/costbasis'`
- `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx` (new) — the Cost basis drawer
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — PMCC branch now a `flex flex-col gap-3` stack: `PmccLegReference` then `PmccCostBasis` when `detail.pmccLedger` is non-null; wheel branches untouched

## E2E coverage added or modified

None.

## Public Interfaces Implemented

```typescript
export function fmtPct1(value: string): string
export type { PmccLedgerResult } from '../../../main/core/costbasis'
export function PmccCostBasis({ ledger }: { ledger: PmccLedgerResult }): React.JSX.Element
```

## Implementation Summary

Six stats in mockup order: Cost basis / share (`text-wb-sky`, `fmtMoney`), Total (`fmtMoneyGrouped`), LEAPS cost to date (`fmtMoney`), Short-call credits to date (`fmtMoney` of `Decimal.neg()` of `shortCreditsPerShare`, neutral), Effective share cost (`fmtMoney` or `—`), Premium recovered (`fmtPct1` or `—`). No strike, profit, realized, or "paid for" wording.

### Deviations from Plan

None.

## Test Execution Results

- Targeted: `format.test.ts` 39, `PmccCostBasis.spec.tsx` 24, `PositionCockpit.spec.tsx` 33 — 96/96 pass
- Full: `pnpm test` — 263 files, 3920 tests passed

## Quality Checks

- ✅ `pnpm test` passed
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)

## Known Limitations / Tech Debt (Refactor input)

- `PmccLegReference` already returns its own `flex flex-col gap-3` wrapper, so the PMCC branch now nests two identical flex stacks. Refactor could have `PmccLegReference` return a fragment (or lift its children) so the cockpit owns the one stack, matching the wheel branches.
- `fmtMoney` uses `parseFloat`; the credits negation goes through Decimal then back to string for it. Fine at display precision; a Decimal-based `fmtMoney` is a wider, separate concern.
- `fmtPct1` sits beside the number-based `fmtPct`; the two names differ only by precision and input type — consider whether a single string-based percent formatter is worth it (only if another caller appears).
