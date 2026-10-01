# ADR: Draft retention across the toggle: both forms mounted, one imperative shared-field handle

<!-- generated:from us-101 -->

## Decision

`NewPositionSheet` renders both `NewWheelForm` and `PmccEntryForm` from the moment it opens, and hides the inactive one with the `hidden` attribute.

- **Shared fields.** Each form exposes `{ getShared(): { ticker, contracts }, setShared(v) }` through `useImperativeHandle` (`NewWheelForm` via its optional `sharedRef` prop). When the user toggles, the sheet copies ticker and contracts from the outgoing form to the incoming one.
- **Hidden forms never submit.** Each form is its own `<form>` element.
- **Pending saves.** The `Standard / PMCC` toggle is disabled while either mutation is pending. Each form reports its pending state through `onPendingChange`, and the sheet never closes while a save is pending.
- **Closing.** Cancel, ×, Escape and the scrim close via the route (see [new-route-is-list-with-sheet-open](./new-route-is-list-with-sheet-open.md)) and drop both drafts. Reopening starts fresh in Standard.
- **Failed saves.** A failed PMCC save keeps the sheet open, the mode and the draft.
- **Escape inside a portalled popover** (for example a date picker) no longer closes the sheet.
- **Focus.** On close, focus returns to the element that opened the sheet.

## Context / Why

- The story wants drafts retained across the toggle and ticker/quantity shared between modes, and this does it with the least machinery. Each form keeps its own React Hook Form state ([react-hook-form-zod](./react-hook-form-zod.md)), and only two values ever cross between them.

## Alternatives considered

- **Lift ticker/contracts into the sheet as controlled inputs.** Rejected: it splits each form's state between RHF and the parent.
- **Unmount and remount the forms from a saved snapshot.** Rejected: it adds serialise/restore code for every field.

## Consequences

- Both forms' queries and effects run while the sheet is open, including the hidden one. The PMCC chain hooks stay idle until a ticker is present.
- Any new shared field has to be added to both forms' handles.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
