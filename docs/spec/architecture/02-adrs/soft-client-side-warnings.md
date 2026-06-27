# ADR: Soft client-side warnings — non-blocking, never enforced server-side

<!-- generated:from us-6, us-7 -->

## Decision

Several user-facing checks are implemented as **soft, client-side-only warnings**. They render a gold `AlertBox variant="warning"` (or an info-blue `variant="info"` for positive outcomes), but the form remains submittable. The backend explicitly does **not** reject these conditions.

Examples:

- **Future assignment date** (`assignmentDate > today`) — "This date is in the future — are you sure?" (rendered in `AssignmentSheet`).
- **Cost-basis guardrail** on CC open (`strike <= basis`) — "This strike is below your cost basis — you would lock in a loss of $X.XX/share if called away" or "...at your cost basis — you would break even...".

> **Current state:** Earlier drafts of this ADR also listed a "future CC fill date" warning and a "zero CC premium ($0.00 — are you sure?)" warning as the same soft pattern. Those were never implemented — the covered-call forms only enforce a hard "Premium is required" error plus the cost-basis guardrail, with no `fillDate > today` or `premium === 0` soft warning. The future-date soft warning currently exists only for the assignment date. The pattern below still stands for any future warnings of this kind.

Hard validation (negative price, contracts exceeding shares-held, fill-date before open) is enforced by the lifecycle engine and surfaces as a blocking IPC error.

## Context / Why

- Some brokers post assignment details over the weekend; the recorded date may technically be a future business day. Hard rejection would force the trader to lie about the date.
- A CC sold at-or-below cost basis is a deliberate trade decision (the trader may want to be called away for tax or rebalancing reasons). The app should warn, not block.
- Zero-premium CCs are unusual but legal (e.g. a deep ITM call). The original design proposed a soft warning here as a sanity check that would not prevent entry, but it was not implemented (see Current state above).
- Stories explicitly state these are warnings only: "Future-date warning is client-side only; the backend does not reject future dates."

## Alternatives considered

- **Hard backend rejection** — rejected; would force the trader to falsify entries to work around the validation.
- **Hide-the-warning pattern (silently accept)** — rejected; loses the sanity-check value.
- **Two-step confirmation modal** ("Are you sure?") — rejected; the inline `AlertBox` next to the field is less intrusive and matches the project's "let the trader make informed decisions" philosophy.

## Consequences

- Warning rendering is implemented as a pure helper (e.g. `computeGuardrail(strike, basis)` in `openCcGuardrail.ts`) so it can be unit-tested independently of the form.
- The corresponding IPC payload has no schema rule against the soft-warning condition (e.g. `AssignCspPayloadSchema` accepts any ISO date string, not just dates ≤ today).
- The `AlertBox` colour token discriminates: gold for warnings, info-blue for positive outcomes ("profit of $X.XX/share").
- The submit button is never disabled by a soft warning; only hard validation errors block submission.

## Sources

- [extract: us-6](../../.extracts/us-6.md) — ADR "Future assignment date — client-side warning only"
- [extract: us-7](../../.extracts/us-7.md) — ADR "Cost basis guardrail is client-side only and non-blocking"; CC zero-premium / future-fill-date warnings
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
<!-- /generated -->
