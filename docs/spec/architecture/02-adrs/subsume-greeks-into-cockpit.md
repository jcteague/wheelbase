# ADR: Subsume the standalone Greeks panel into the Position Cockpit

<!-- generated:from us-34 -->

## Decision

US-34's original `GreeksPanel` standalone section card is not shipped. The body of `PositionDetailContent` is replaced wholesale with `<PositionCockpit>`, which exposes greeks via two surfaces: delta in the `RiskSnapshot` gauge, and theta / IV / vega / gamma in the `ContextStrip`. Notes, the closed-position banner, and `CloseCspForm` remain below the cockpit.

## Why

The original US-34 acceptance criteria ("delta with severity color", "theta as $/day", "IV as %", "no panel when no active leg") are satisfied more comprehensively by the cockpit's verdict-driven layout than by a flat panel of numbers. The cockpit gives the trader a single glanceable answer ("ACT NOW") rather than five raw greeks they have to interpret on their own.

## Alternatives considered

- **Ship `GreeksPanel` as originally specced** — works but leaves verdict routing for a later story and duplicates greek-severity reasoning across two components.
- **Add the verdict pill above the existing stat sections** — keeps the old layout's density and loses the cockpit's tight stack.

## Source

- `plans/us-34/plan.md`
- `docs/epics/06-stories/US-34-greeks-display.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
