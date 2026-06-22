# ADR: "Refresh IVR now" extends the Settings Market Data section

<!-- generated:from us-44 -->

## Decision

The manual IVR trigger is placed in the existing `Market Data` section of `src/renderer/src/pages/SettingsPage.tsx` as a secondary action with inline success/error feedback.

## Why

US-44 explicitly calls for a Settings entry point, and no dedicated mockup or larger navigation change exists for this feature. Extending the Market Data section is the smallest change that keeps the control near other operational data-provider actions and status messaging.

Inline feedback also matches the page's current lightweight control style better than a new modal or page-level workflow.

## Alternatives considered

- **Create a new settings subsection or page** — rejected because the story does not justify new navigation structure.
- **Place the trigger on a positions page** — rejected because the story explicitly names Settings and the action is operational rather than per-position.

## Source

- `plans/us-44/research.md`
- `plans/us-44/plan.md`
- `src/renderer/src/pages/SettingsPage.tsx`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
