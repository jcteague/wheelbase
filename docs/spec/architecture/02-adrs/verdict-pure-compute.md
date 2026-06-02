# ADR: Verdict routing as a pure function in `verdict.ts`

<!-- generated:from us-34 -->

## Decision

All verdict routing lives in `src/renderer/src/lib/verdict.ts` as pure functions consuming a `CockpitInput` shape. The component layer never decides "which verdict?" — it calls `computeVerdict(input)` and renders the result. The same module exports `computePnl`, `computeDistance`, `computeThetaYield`, `deltaSeverity`, `SEVERITY_COLOR`, `SHARES_VERDICT`, and `MANAGEMENT_RULES`.

## Why

Pure logic keeps the rules unit-testable in isolation — 14 verdict tests cover every branch and threshold without rendering a component. The pattern mirrors the architecture rule for `src/main/core/` engines being pure, applied at the renderer layer for management logic. Threshold changes no longer require touching JSX.

## Alternatives considered

- **Inline the precedence chain inside `PositionCockpit.tsx`** — couples rule changes to component re-renders and forces every threshold tweak to touch the render tree.
- **Hooks-as-rules** (`useVerdict`) — turning a pure function into a hook adds React lifecycle for no benefit.

## Source

- `plans/us-34/plan.md`
- `plans/us-34/research.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
