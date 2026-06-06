# ADR: `cost_basis_snapshots` is append-only
<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

Every financial event that changes cost basis (CSP open, CSP close, CSP expire, assignment, CC open, roll) inserts a **new** row into `cost_basis_snapshots`. Existing rows are never mutated. The "current" snapshot is selected with `ORDER BY snapshot_at DESC LIMIT 1`. `final_pnl` is only populated when the wheel itself terminates (CSP close, CSP expire, eventually CC-call-away); on intermediate transitions (assignment, CC open, roll) `final_pnl` is `NULL`.

Two carve-outs: **closing a covered call early** and **CC expiring worthless** explicitly do **not** insert a snapshot — the CC premium was already captured in the snapshot written when the CC was opened, and the wheel is still alive.

## Context / Why

- The wheel is a sequence of premium-collecting events. Each new snapshot answers "what is the cost basis as of this moment?" given everything that has happened so far.
- Mutating snapshots in place would destroy audit trail and break the listing query (`MAX(snapshot_at)` per position) used by `listPositions` and `getPosition`.
- Consistent with the rolls-as-linked-leg-pairs principle (see ADR [rolls-as-linked-leg-pairs](./rolls-as-linked-leg-pairs.md)): history is preserved by appending, never overwriting.
- The "no new snapshot on CC close/expire" carve-out is deliberate — re-adding the CC premium would double-count it because CC-open already booked the credit against basis.

## Alternatives considered

- **Update the existing snapshot in place on close/expire** — violates immutability; loses history; breaks the latest-wins query.
- **Add a `cc_leg_pnl` column on the snapshot for CC close** — rejected; P&L is derivable from leg data, and the snapshot's role is the basis figure, not per-leg P&L. The CC close handler returns `ccLegPnl` on the IPC envelope instead.
- **Mid-snapshot recomputation across multiple legs** — rejected; the `snapshot_at + 1ms` ordering trick used for expiration keeps the table strictly chronological.

## Consequences

- Services that mutate position state insert (not update) one snapshot row per call, inside the same transaction as the leg insert and `positions` row update.
- The expiration snapshot uses `snapshot_at = now + 1ms` to guarantee it sorts after the opening snapshot when both are written in the same wall-clock tick.
- CC close and CC expire services touch only `legs` and `positions` — not `cost_basis_snapshots`.
- `final_pnl` semantics: `NULL` means "wheel still in flight"; non-null means "this is the terminal figure for this wheel".

## Sources

- [extract: us-4](../../.extracts/us-4.md) — ADR "cost_basis_snapshots — insert new vs update existing on close"
- [extract: us-5](../../.extracts/us-5.md) — Schema "cost_basis_snapshots row INSERT — expiration snapshot" (now+1ms)
- [extract: us-6](../../.extracts/us-6.md) — ADR "Cost basis snapshot on assignment — new row, final_pnl=NULL, position stays ACTIVE"
- [extract: us-7](../../.extracts/us-7.md) — Schema "cost_basis_snapshots row INSERT — post-CC-open snapshot"
- [extract: us-8](../../.extracts/us-8.md) — ADR "No new cost-basis snapshot on CC close" + Schema "cost_basis_snapshots — explicitly NOT touched"
- [extract: us-9](../../.extracts/us-9.md) — ADR "No cost basis snapshot on CC expiry"
- [extract: us-12](../../.extracts/us-12.md) — Schema "cost_basis_snapshots — new snapshot row per roll"
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
