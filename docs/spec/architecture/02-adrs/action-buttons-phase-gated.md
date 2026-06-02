# ADR: Action buttons are gated by `phase` (and DTE where relevant) in the UI
<!-- generated:from us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

The `PositionDetailActions` component renders mutation buttons only when the position's `phase` (and sometimes DTE) permits the action. Examples:

- `CSP_OPEN`: shows `Close Early →`, `Roll CSP →`, `Record Expiration →`, `Record Assignment →`.
- `HOLDING_SHARES`: shows `Open Covered Call →`.
- `CC_OPEN`: shows `Close CC Early →`, `Record Expiration →` (the CC variant — only when `computeDte(ccLeg.expiration) <= 0`).
- `WHEEL_COMPLETE` / `CSP_CLOSED_*`: shows no mutation actions (terminal phases).

This is a UI-layer gate on top of the authoritative lifecycle engine guard (`__phase__` / `invalid_phase`). The backend still rejects illegal transitions when called directly (e.g. via an IPC call from outside the UI), but the UI never offers the button in the wrong state.

## Context / Why

- Showing irrelevant buttons in the wrong phase produces obvious dead-ends; gating them is the better UX.
- The lifecycle engine remains the authoritative validator (`invalid_phase` is one of the canonical error codes — see ADR [error-field-naming-convention](./error-field-naming-convention.md)); the UI gate is a quality-of-life layer, not a security layer.
- DTE gating for CC expiry ensures the "Record Expiration →" button only appears once the option has actually expired (DTE ≤ 0).

## Alternatives considered

- **Show all buttons and rely on backend rejection** — rejected; worse UX, exposes terminology the trader doesn't need to see.
- **Disable rather than hide buttons** — partially used (the submit button stays enabled for soft warnings — see ADR [soft-client-side-warnings](./soft-client-side-warnings.md)); for action buttons in the page header, hiding is cleaner.

## Consequences

- `PositionDetailActions` receives the position record and conditionally renders each button based on phase / DTE.
- Per-phase action gating must be updated whenever a new mutation is added (e.g. a future "Record CC Assignment" for PMCC short call assignment).
- The button name + handler convention follows: button has `data-testid="{action}-btn"` for e2e; click handler calls a builder on `PositionDetailPage` that constructs the sheet's open-context (`closeCcCtx`, `openCcCtx`, etc.) and opens the sheet.

## Sources

- [extract: us-5](../../.extracts/us-5.md) — `CloseCspForm` coexists with `Record Expiration →` on `CSP_OPEN`
- [extract: us-6](../../.extracts/us-6.md) — "Record Assignment →" only when `phase === 'CSP_OPEN'`
- [extract: us-7](../../.extracts/us-7.md) — "Open Covered Call →" only when `phase === 'HOLDING_SHARES'`
- [extract: us-8](../../.extracts/us-8.md) — "Close CC Early →" only when `phase === 'CC_OPEN'`
- [extract: us-9](../../.extracts/us-9.md) — ADR "'Record Expiration →' button visibility is frontend-guarded by DTE" (phase = CC_OPEN AND DTE ≤ 0)
- [extract: us-12](../../.extracts/us-12.md) — "Roll CSP →" button for `CSP_OPEN`
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
