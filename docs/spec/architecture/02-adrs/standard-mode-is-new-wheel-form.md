# ADR: Standard mode is the shipped `NewWheelForm`, success behaviour included

<!-- generated:from us-101 -->

## Decision

The **Standard** side of the `Standard / PMCC` toggle renders the existing `NewWheelForm` unchanged: the same field ids, validation, promote chrome, in-form `✓ WHEEL OPENED` status card, and 2-second redirect. Only **PMCC** mode closes the sheet on success and shows the list-level `PMCC recorded — XYZ · LEAPS + short call open` banner with `View position →`.

`NewWheelForm` gained three optional props, and without them it renders exactly as before:

- `onCancel`: when present, the form renders its fields in a `SheetBody` and `Cancel` + `Open Wheel` in a `SheetFooter`, matching `PmccEntryForm`.
- `sharedRef`: the imperative shared-field handle (see [draft-retention-both-forms-mounted](./draft-retention-both-forms-mounted.md)).
- `onPendingChange`: lets the sheet disable the toggle while a save is in flight.

## Context / Why

- The story says Standard "retains the existing opening-put workflow". `csp-flow.spec.ts` and `promote-to-trade.spec.ts` assert on that `[role="status"]` card.
- The UI notes say to keep Cancel and the active strategy's primary action in the fixed footer, and the active form owns the footer. The `onCancel` sheet-mode footer follows both.

## Alternatives considered

- **Close the sheet on wheel success and show a list banner, as the mockup does for both modes.** Deferred: it would rewrite six e2e assertions for behaviour the AC does not require. It is logged as a follow-up.

## Consequences

- The two modes end differently: Standard shows an in-form card and redirects, while PMCC closes the sheet and shows a list banner.
- **Watch-out:** with the list underneath, `LoadingState` and `AssignmentNotificationBanner` also use `role="status"`. If a spec flakes on that selector, scope it to `[role="dialog"] [role="status"]`.
- The form still follows [react-hook-form-zod](./react-hook-form-zod.md) and lives inside the [sheet-component-pattern](./sheet-component-pattern.md).

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
