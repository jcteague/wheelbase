# ADR: Management queue read path (`listManagementQueue`)

<!-- generated:from us-51 -->

## Decision

The dashboard management queue reads through a dedicated service function `listManagementQueue(db)` in `src/main/services/alerts.ts`, separate from the US-50 `listOpenAlerts` primitive. It JOINs open `alerts` to `positions` to attach the position's `ticker` and current `phase`, and returns rows already sorted with `ORDER BY CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, triggered_at ASC` — urgency tier first (high → medium → low), then oldest-triggered first within a tier.

It returns a purpose-built `ManagementQueueItem` view-model (`alertId`, `positionId`, `ticker`, `phase`, `urgency`, `summary`, `quickAction`, `triggeredAt`), not the raw `AlertRecord`. The view-model deliberately omits `AlertRecord` audit fields (`lastEvaluatedAt`, `resolvedAt`, `createdAt`, `updatedAt`, `status`) and adds the `ticker`/`phase` the queue needs; `alertId` is carried as a stable React key. `listOpenAlerts` is left untouched.

## Why

The queue UI needs `ticker` and the live `phase` badge, neither of which lives on the `alerts` row, and `listOpenAlerts` sorts by `rowid`, which does not satisfy the "ordered by urgency then time" acceptance criterion. Ordering in SQL keeps the service a thin mapper and leverages the existing `idx_alerts_status_urgency` index for the status filter. Oldest-triggered-first within a tier matches start-of-day triage intent — the alert that has needed attention longest surfaces first. A dedicated function and a small view-model keep the contract honest and leave the US-50 primitive (relied on by evaluation tests) stable.

## Alternatives considered

- **Sort/enrich in the renderer after a raw list call** — rejected: pushes urgency ranking and the JOIN into the UI and duplicates it per consumer.
- **Extend `listOpenAlerts` to JOIN and sort** — rejected: changes a primitive relied on by US-50 tests and conflates the "raw open alerts" concept with the "display queue" concept.
- **`triggered_at DESC` (newest first) within a tier** — rejected: a brand-new low-urgency alert would jump ahead of a long-standing one in the same tier, the opposite of triage intent.
- **Return `AlertRecord & { ticker, phase }`** — rejected: leaks unused audit fields across the IPC boundary and makes the type ambiguous about what the queue depends on.

## Source

- `plans/us-51/research.md`, `plans/us-51/data-model.md`
- Feature page: `../../features/us-51-management-queue-dashboard.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
