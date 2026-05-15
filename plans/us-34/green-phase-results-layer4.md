# Green Phase Results: US-34 Layer 4 — Page Wiring

## Feature Context

- **Feature directory**: `plans/us-34/`
- **User story**: `docs/epics/06-stories/US-34-greeks-display.md`
- **Plan file**: `plans/us-34/plan.md`
- **Red phase results**: `plans/us-34/red-phase-results-layer4.md`

## Implementation Files Modified

- `src/renderer/src/pages/PositionDetailPage.tsx` — added `useStockQuotes`, derived `underlyingPrice`, passed to `PositionDetailContent`
- `src/renderer/src/pages/PositionDetailContent.tsx` — replaced old stat sections with `<PositionCockpit>`, cleaned up unused imports, kept Notes/banner/CloseCspForm below cockpit

## Public Interfaces Implemented

```typescript
// PositionDetailContent.tsx
type PositionDetailContentProps = {
  detail: PositionDetail
  overlayOpen: boolean
  snapshot?: OptionSnapshot
  underlyingPrice?: string | null // new
}

// PositionDetailPage.tsx — new hook usage
const stockQuotesQuery = useStockQuotes(data ? [data.position.ticker] : [])
const underlyingPrice = data ? (stockQuotesQuery.data?.[data.position.ticker]?.price ?? null) : null
```

## Implementation Summary

`PositionDetailPage` adds `useStockQuotes` to derive the live underlying price, then passes it alongside the existing `snapshot` into `PositionDetailContent`. `PositionDetailContent` now renders `<PositionCockpit>` in place of the hand-rolled Open Leg / Cost Basis / Leg History stat sections, delegating all cockpit layout to the already-implemented orchestrator component. The three below-fold elements (Notes, closed-position banner, CloseCspForm) are preserved.

Unused imports left over from the old stat sections were removed as part of this phase to satisfy lint/typecheck quality gates (the Refactor task notes this as well, but they couldn't be deferred).

## Test Execution Results

```
Test Files  100 passed (100)
      Tests  1150 passed (1150)
```

All 42 PositionDetailPage tests pass. No regressions in any other test file.

## Quality Checks

- ✅ `pnpm test` passed (1150/1150)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

None — unused imports cleaned up during Green (could not defer without failing quality gates). Refactor phase can review for any remaining structure improvements.

## Handoff to Refactor Phase

To resume: run `/refactor us-34 layer 4`. Refactor phase should:

1. Run `pnpm test` to confirm baseline is still green
2. Review `PositionDetailContent.tsx` and `PositionDetailPage.tsx` for any remaining cleanup
3. The `NoteBlock` helper in `PositionDetailContent.tsx` is the only non-trivial local declaration remaining — consider whether it belongs here or in a shared location
