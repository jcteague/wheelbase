# ADR: pending_assignments uniqueness is compound on (activity_id, position_id)

<!-- generated:from us-35 -->

## Decision

`pending_assignments` enforces uniqueness via `CREATE UNIQUE INDEX uq_pending_assignments_activity_position ON pending_assignments(activity_id, position_id)` — not a column-level `UNIQUE` on `activity_id` alone. One OPASN activity can produce multiple pending rows when it matches multiple open CSP positions on the same OCC symbol; dedupe is per-(activity, position) pair.

## Why

The schema permits two `CSP_OPEN` positions on the same ticker/strike/expiration/put (separate sub-strategies, partial fills tracked as separate wheels, or simply a trader doubling down). A single OPASN event from the broker is the assignment notification for both. Single-column `UNIQUE(activity_id)` would silently drop the second match, so one wheel would never receive its banner and the trader would never confirm its transition.

Compound `UNIQUE(activity_id, position_id)` allows N rows per activity (one per affected position) while still blocking the same activity reaching the same position twice on subsequent polls.

`INSERT OR IGNORE` is used at write time, so duplicate polls and multi-poll arrivals both no-op cleanly.

## Alternatives considered

- **Single-column `UNIQUE(activity_id)`** — original implementation; broken under multi-CSP collision. Fixed in-place via migration 006 edit (no shipped data to preserve).
- **Position-account modelling** — defer to a follow-on story. Today positions don't track sub-accounts; even with that, two positions per account on the same OCC symbol remains possible.

## Source

- `plans/us-35/code-review-fixes.md` (Area A2)
- Feature page: `../../features/us-35-assignment-detection.md`
- Schema: `../../schema/tables.md#pending_assignments`
<!-- /generated -->
