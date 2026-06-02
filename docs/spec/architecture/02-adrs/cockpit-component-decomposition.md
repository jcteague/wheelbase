# ADR: Position Cockpit — one file per cockpit part

<!-- generated:from us-34 -->

## Decision

Eight new files live under `src/renderer/src/components/position-cockpit/`:

- `PnlBar.tsx` — progress bar.
- `DeltaGauge.tsx` — circular SVG gauge (108px, stroke 6, clockwise arc, optional `· TIGHT` label when `dte ≤ 7`).
- `DistanceThermo.tsx` — horizontal red→gold→green gradient track with strike marker + clamped underlying marker.
- `CollapsedDrawer.tsx` — shadcn-Collapsible wrapper with chevron + title + "N fields" right label.
- `ContextStrip.tsx` — four-column Theta / IV / Vega / Gamma strip inside `<SectionCard header="Context">`.
- `RiskSnapshot.tsx` — two-pane card composing `<DeltaGauge>` + `<DistanceThermo>` inside `<SectionCard header="Risk snapshot">`.
- `VerdictBlock.tsx` — tinted container with ticker, phase pill, key-facts strip, verdict pill, and `PnlSummary` sub-component built on `<PnlBar>`.
- `PositionCockpit.tsx` — top-level orchestrator that composes the seven above plus `<LegHistoryTable>`.

## Why

Each unit is testable in isolation against its own `*.spec.tsx`, and the decomposition mirrors the handoff prototype's structure (`plans/us-33/handoff/src/components/position-cockpit/*`) file-for-file so the visual reference maps cleanly. The split also enables parallel implementation — Layer 1 (foundation: gauge, thermo, drawer, pnlbar) has no cross-dependencies, so multiple agents can build it concurrently.

## Alternatives considered

- **One monolithic `PositionCockpit.tsx`** — harder to test individual visual pieces; merge conflicts likely during parallel work.
- **Two files** (one orchestrator, one "internals") — saves a few imports but loses per-piece test files and the visual file-for-file mapping to the handoff prototype.

## Source

- `plans/us-34/plan.md` (Areas 2–9)
- `plans/us-34/tasks.md` (layered build)
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
