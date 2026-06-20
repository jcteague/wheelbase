# ADR: Capture assignment-poll watermark at the start of the poll, not the end

<!-- generated:from us-35 -->

## Decision

`detectAssignments` captures `pollStartedAt = new Date().toISOString()` **before** awaiting `brokerProvider.getActivities({ since })`. That timestamp — not `new Date()` after the response lands — is persisted as the new watermark.

## Why

Stamping after the await opens a read-then-update race: an OPASN whose `transactionTime` falls between the moment we called the broker and the moment the response materialised can be missing from the response (it landed too late to be included) and yet the watermark advances past it. The next poll then asks `since = postAwaitNow`, and the missed activity is permanently skipped.

Stamping at the start guarantees the next poll's `since` is `<= pollStartedAt`, so anything that arrived during the gap is included in the next window. `INSERT OR IGNORE` handles the small amount of re-processing that creates.

## Alternatives considered

- **Persist `MAX(transaction_time)` from the returned batch** — works but is more code and depends on the batch being non-empty; `pollStartedAt` is correct in the empty-batch case too.
- **Keep stamping at the end** — original implementation; broken under broker latency, surfaced by the code-review pass.

## Source

- `plans/us-35/code-review-fixes.md` (Area A1)
- Feature page: `../../features/us-35-assignment-detection.md`
<!-- /generated -->
