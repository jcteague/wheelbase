# ADR: No-active-leg cockpit branch renders verdict + cost-basis drawer only

<!-- generated:from us-34 -->

## Decision

When `activeLeg` is null (e.g. `HOLDING_SHARES` between selling a CSP and opening a CC), `PositionCockpit` renders only `<VerdictBlock>` (with `SHARES_VERDICT` and `pnl={null}`) plus the "Cost basis & history" `<CollapsedDrawer defaultOpen>`. `RiskSnapshot`, `ContextStrip`, and the "Leg reference" drawer are **not** rendered.

## Why

Without an option leg there are no greeks, no distance-to-strike, no P&L bar, and nothing to put under "Leg reference". The cost-basis history is the only useful information remaining — opening it by default keeps the page meaningful instead of rendering a stack of empty cards.

## Alternatives considered

- **Render the whole cockpit with empty/N-A placeholders** — clutters the page with dead UI for a phase that genuinely has no option data.
- **Hide the cockpit entirely and fall back to the old stat layout** — splits the design into two layouts for the same page.

## Source

- `plans/us-34/plan.md` (Area 9)
- `plans/us-34/data-model.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
