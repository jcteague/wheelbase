# ADR: Error `field` naming convention (`__root__`, `__phase__`, field-name)

<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12, missing-ac -->

## Decision

Errors in the IPC envelope use a small, fixed vocabulary for the `field` property:

- `__root__` — position-level failures (not found, no active leg, internal error) and any error not tied to a specific input field.
- `__phase__` — phase-mismatch failures (`invalid_phase`). Used when the requested lifecycle transition is not legal from the current `phase`.
- The literal **input field name** (camelCase as the IPC sees it) — for input-validation failures: `closePricePerContract`, `fillDate`, `contracts`, `strike`, `premiumPerContract`, `assignmentDate`, `newExpiration`, `costToClosePerContract`, etc.

`code` values are short, machine-readable strings: `not_found`, `invalid_phase`, `must_be_positive`, `close_date_before_open`, `close_date_after_expiration`, `before_assignment`, `cannot_be_future`, `exceeds_shares`, `too_early`, `must_be_after_current`, `no_active_leg`, `internal_error`, `auth_failed`, `network_error`, `rate_limited`, `streaming_unsupported`.

## Context / Why

- The renderer's `IPC_TO_FORM_FIELD` mapping uses `field` to route the error message to the correct form input. Without a small fixed vocabulary, every new handler would invent its own naming.
- `__phase__` is conceptually different from "a field is wrong" — it indicates the whole operation is illegal in the current state. Separating it from `__root__` lets the renderer show it inline in the sheet body or banner rather than next to an input.
- The literal-field-name convention keeps the IPC envelope self-describing: a renderer adapter can mechanically route errors without a hard-coded mapping per channel.

## Alternatives considered

- **A single `error: string` field** — rejected; can't render field-level inline errors.
- **Nested object keyed by field name** — rejected; awkward to iterate and to distinguish root errors.
- **HTTP-style problem-details** — rejected; over-specified for a local IPC channel.

## Consequences

- New handlers must follow the convention. `__phase__` / `invalid_phase` is the canonical phase-mismatch error; `__root__` / `not_found` is the canonical lookup miss.
- The renderer's `mapIpcErrors(errors)` uses `IPC_TO_FORM_FIELD` to translate camelCase IPC field names to the snake_case form field names used by `react-hook-form` (e.g. `fillDate` → `fill_date`). The mapping must be extended whenever a new field is introduced — see ADR [renderer-snake-case-adapter](./renderer-snake-case-adapter.md).
- `__root__` errors are typically rendered in the sheet header or via an `ErrorAlert`; field errors are rendered inline next to the corresponding input.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — "Naming: error `field` value `__phase__` for phase-mismatch errors; `__root__` for not-found/internal"
- [extract: us-5](../../.extracts/us-5.md) — Error `field` naming follows the close-CSP convention
- [extract: us-6](../../.extracts/us-6.md) — Error `field` naming follows the established convention
- [extract: us-7](../../.extracts/us-7.md) — Known error codes table
- [extract: us-8](../../.extracts/us-8.md) — Known error codes table
- [extract: us-9](../../.extracts/us-9.md) — Known error cases table
- [extract: us-12](../../.extracts/us-12.md) — Known error codes table
- [extract: missing-ac](../../.extracts/missing-ac.md) — Server-side `fillDate` field errors map back onto the form field
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
