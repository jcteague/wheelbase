# ADR: The pending_assignments table IS the notification

<!-- generated:from us-35 -->

## Decision

A `pending_assignments` row with `status='pending'` is the assignment notification — there is no separate notifications collection, no in-memory queue, no IPC pub/sub channel. The renderer queries the table for pending rows and renders one banner per row.

## Why

Notifications must survive app restart per the story's acceptance criteria. SQLite is already the source of truth for everything else; adding a parallel notifications store would duplicate persistence concerns. By making the table both the state machine (pending → confirmed | dismissed) and the notification surface, restart-resilience is automatic and confirm/dismiss are simple `UPDATE` statements rather than separate state transitions.

The renderer polls every 30s via TanStack Query (`refetchInterval: 30_000`); main-process push events would be unnecessary complexity for a notification that arrives at most a few times per day.

## Alternatives considered

- **In-memory queue with push events** — loses notifications on restart; would still need a DB backing store, so this approach is a strict subset.
- **Separate `notifications` table** — extra indirection without payoff; the assignment row already has everything the banner needs (ticker, strike, expiration, qty, transaction_time).

## Source

- `plans/us-35/research.md`
- Feature page: `../../features/us-35-assignment-detection.md`
- Schema: `../../schema/tables.md#pending_assignments`
<!-- /generated -->
