# ADR: Single-step phase transitions (no intermediate states)

<!-- generated:from us-5, us-6, us-9 -->

## Decision

Phase transitions go directly from one valid phase to the next. There are no synthetic intermediate states like `CSP_EXPIRED`, `ASSIGNMENT_PENDING`, or `CC_EXPIRING`. Examples:

- CSP expires worthless: `CSP_OPEN → WHEEL_COMPLETE` (one step).
- CSP assigned: `CSP_OPEN → HOLDING_SHARES` (one step).
- CC expires worthless: `CC_OPEN → HOLDING_SHARES` (one step).

The position row's `phase` column is updated in a single transaction along with the leg insert and (when applicable) the cost-basis snapshot insert.

## Context / Why

- An intermediate `CSP_EXPIRED` state would have no business semantics — the position would be in that state for zero meaningful time, and the UI would need to advance through it immediately.
- The lifecycle engine encodes valid transitions explicitly; adding intermediate states would multiply the transition matrix without unlocking new functionality.
- Story technical notes call this out explicitly: "single-step transition for simplicity; there is no business value in surfacing an intermediate `CSP_EXPIRED` state."

## Alternatives considered

- **Two-step transitions with `*_EXPIRED` / `*_PENDING` intermediate phases** — rejected; adds state-machine complexity with no UX or audit benefit.
- **Event-sourced phase derivation from leg history** — rejected; the current `phase` column on `positions` is the authoritative cached value, and reconstructing it on every query would be wasteful at this scale.

## Consequences

- Each lifecycle function returns the final phase directly: `closeCsp → CSP_CLOSED_PROFIT | CSP_CLOSED_LOSS`, `expireCsp → WHEEL_COMPLETE`, `recordAssignment → HOLDING_SHARES`, `closeCoveredCall → HOLDING_SHARES`, `expireCc → HOLDING_SHARES`, `rollCsp → CSP_OPEN` (unchanged), etc.
- The `phase` enum stays compact: no `*_PENDING` / `*_EXPIRED` variants.
- Roll is a no-op for `phase` (stays `CSP_OPEN`) because the wheel is being extended, not advanced — the linked ROLL_FROM/ROLL_TO leg pair is the audit record.

## Sources

- [extract: us-5](../../.extracts/us-5.md) — ADR "Phase transition skips `CSP_EXPIRED` intermediate state"
- [extract: us-6](../../.extracts/us-6.md) — Phase transition `CSP_OPEN → HOLDING_SHARES` (single-step)
- [extract: us-9](../../.extracts/us-9.md) — Phase transition `CC_OPEN → HOLDING_SHARES` (single-step)
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
<!-- /generated -->
