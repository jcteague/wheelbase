# Red Phase Results: PositionCockpit (Area 9)

## Feature Context

- **Feature directory**: `plans/us-34/`
- **Plan file**: `plans/us-34/plan.md`

## Test Files Created

- `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` — orchestrator component tests (12 cases)

## Interfaces Under Test

```typescript
// src/renderer/src/components/position-cockpit/PositionCockpit.tsx
export function PositionCockpit(props: PositionCockpitProps): React.JSX.Element

type PositionCockpitProps = {
  detail: PositionDetail
  snapshot?: OptionSnapshot
  underlyingPrice?: string | null
  ivRank?: number | null
}
```

## Test Coverage Summary

- [x] Renders ticker in VerdictBlock when active leg + snapshot present
- [x] Renders RiskSnapshot when snapshot + underlyingPrice present
- [x] Renders ContextStrip when snapshot with greeks present
- [x] Renders "Leg reference" CollapsedDrawer when active leg exists
- [x] Renders "Cost basis & history" CollapsedDrawer when costBasisSnapshot present
- [x] No-active-leg: VerdictBlock shows "NO ACTIVE LEG"
- [x] No-active-leg: RiskSnapshot absent
- [x] No-active-leg: ContextStrip absent
- [x] No-active-leg: "Cost basis & history" drawer open by default (aria-expanded=true)
- [x] Snapshot-absent: neither RiskSnapshot nor ContextStrip rendered
- [x] underlyingPrice=null: RiskSnapshot not rendered (dist is null)
- [x] LegHistoryTable visible inside "Cost basis & history" drawer after expand

## Test Execution Results

```
FAIL renderer src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx
Error: Failed to resolve import "./PositionCockpit" from "src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx". Does the file exist?

Test Files  1 failed (1)
      Tests  no tests
```

## Verification

- ✅ Every test fails because `PositionCockpit.tsx` does not exist yet
- ✅ No syntax errors in the test file
- ✅ No fixture or import errors from test setup

## Handoff to Green Phase

Green phase should create `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` with:

- Props: `{ detail, snapshot?, underlyingPrice?, ivRank? }`
- No-active-leg branch: VerdictBlock (SHARES_VERDICT) + optional cost-basis CollapsedDrawer (defaultOpen)
- Active-leg branch: VerdictBlock → (dist && RiskSnapshot) → ContextStrip → leg-ref drawer → cost-basis drawer
- `instrument = phase === 'CC_OPEN' ? 'CALL' : 'PUT'`
- Parse all `snapshot.greeks.*` via `parseFloat()`
- `iv: parseFloat(snapshot.greeks.iv)` — NOT `snapshot.impliedVolatility`
- `underlying: underlyingPrice ? parseFloat(underlyingPrice) || null : null`
- `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` for LegHistoryTable
