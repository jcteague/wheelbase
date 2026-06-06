# ADR: Right-side sheet component pattern (portal, form-then-success)
<!-- generated:from us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

Every confirmable position mutation (record expiration, record assignment, open covered call, close covered call early, record CC expiry, roll CSP) is presented as a right-side **sheet** rendered via `createPortal(... , document.body)`. The sheet is a 400 px (420 px for roll) fixed-position panel offset by the sidebar width, with a scrim backdrop, slide-in animation, and Escape-to-close.

Each sheet has two internal states: a **form** state (inputs + inline P&L or guardrail preview + irrevocable warning + submit footer) and a **success** state (hero card with the financial outcome, optional strategic nudge `AlertBox`, and a CTA to the next logical action). State transitions are driven by the mutation's `onSuccess` callback setting a `successState` ref.

Sheets are composed of three files when they grow past ~200 lines: `XSheet.tsx` (orchestrator only), `XForm.tsx` (form body), `XSuccess.tsx` (success body), plus optional pure helper modules (e.g. `openCcGuardrail.ts`).

US-5's `ExpirationSheet` originally used shadcn `Sheet` (Radix Dialog primitive). All subsequent sheets (`AssignmentSheet`, `OpenCoveredCallSheet`, `CloseCcEarlySheet`, `CcExpirationSheet`, `RollCspSheet`) use the custom `createPortal` pattern instead, which is now the canonical approach.

## Context / Why

- Position mutations are irrevocable; a sheet (not an inline form) gives the user a deliberate moment of focus before submitting and shows the resulting outcome before they leave the page.
- A right-side panel keeps the position context (left sidebar + main detail area) visible behind a blur/dim — the user never loses sight of what they're acting on.
- `createPortal` keeps the sheet outside the position-detail-page DOM tree so the dim/blur can be applied to `<main>` independently.
- The form-to-success transition inside the same sheet keeps the entire flow within a single dismissible surface; the user reads the outcome and dismisses with one click.

## Alternatives considered

- **Inline forms on the position detail page** — rejected; clutters the page, no focused-decision moment, no easy success-state surface.
- **Modal dialogs (`Dialog.Root`)** — rejected; modals interrupt rather than overlay context; user loses position summary.
- **shadcn `Sheet` primitive for every sheet** — partially explored in US-5; later sheets adopted the custom-portal pattern (US-7 onward) for finer control over the slide-in animation and the blur-the-page-behind effect. The "use shadcn Sheet" decision in US-5 is superseded by the custom pattern for subsequent stories.
- **Separate route per mutation** — rejected; introduces hash-routing concerns for what is conceptually a modal interaction.

## Consequences

- Adding a new mutation flow follows the recipe: new orchestrator sheet + form + success components, mutation hook with `onSuccess` setting success state, `PositionDetailPage` owns the open/close state and renders the sheet conditionally, the corresponding action button in `PositionDetailActions` is gated by phase (see ADR [action-buttons-phase-gated](./action-buttons-phase-gated.md)).
- `PositionDetailPage` applies a shared blur/opacity to `<main>` whenever any sheet is open (`overlayOpen = expirationCtx || assignmentCtx || openCcCtx || closeCcCtx || ccExpCtx || rollCspOpen`).
- The CC-Open sheet hit a ~649-line limit and was split into the four-file orchestrator/form/success/helper pattern that all newer sheets follow.
- Outstanding tech debt: `ExpirationSheet` state reset uses `useEffect` with an ESLint disable; the canonical fix is a parent-supplied `key` prop. Tracked in the US-5 extract's tech debt notes.

## Sources

- [extract: us-5](../../.extracts/us-5.md) — ADR "Use shadcn/ui `Sheet` for the right-side confirmation pattern" (original; later superseded)
- [extract: us-6](../../.extracts/us-6.md) — `AssignmentSheet` 400 px portal pattern
- [extract: us-7](../../.extracts/us-7.md) — ADR "Sheet component pattern — mirror `AssignmentSheet`"
- [extract: us-8](../../.extracts/us-8.md) — ADR "Sheet component pattern — mirror `OpenCoveredCallSheet`"
- [extract: us-9](../../.extracts/us-9.md) — `CcExpirationSheet` portal pattern
- [extract: us-12](../../.extracts/us-12.md) — ADR "RollCspSheet uses portal pattern (420px)"
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
