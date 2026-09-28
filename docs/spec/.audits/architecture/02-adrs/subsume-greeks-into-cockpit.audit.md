---
page: docs/spec/architecture/02-adrs/subsume-greeks-into-cockpit.md
audited_at: 2026-09-28
findings: 1
---

# Audit: subsume-greeks-into-cockpit.md

## Verified (6)

- ✓ No `GreeksPanel` exists — `grep -rn GreeksPanel src/renderer` returns nothing.
- ✓ `PositionDetailContent` renders `<PositionCockpit>` — `src/renderer/src/pages/PositionDetailContent.tsx:7,50`.
- ✓ Delta surfaces in `RiskSnapshot` via `DeltaGauge` — `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx:5,36-37`.
- ✓ Theta / IV / vega / gamma in `ContextStrip` — `ContextStrip.tsx:30-51`.
- ✓ Notes, closed-position banner and `CloseCspForm` remain below the cockpit — `PositionDetailContent.tsx:64,72-74,79`.
- ✓ Sources `docs/epics/06-stories/US-34-greeks-display.md` and `../../features/us-34-position-cockpit.md` exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale (verdict-driven layout satisfies the original AC more comprehensively) — narrative; `plans/us-34/plan.md` is historical (dir not present, by design).

## Missing files (0)

None.
