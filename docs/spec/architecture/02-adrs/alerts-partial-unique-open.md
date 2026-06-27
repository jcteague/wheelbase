# ADR: `alerts` table uses a partial unique index keyed on open status

<!-- generated:from us-50 -->

## Decision

Migration `009_create_alerts.sql` creates the `alerts` table with a **partial unique index** `CREATE UNIQUE INDEX idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'`. This guarantees at most one open alert per `(position, rule)` while allowing any number of historical resolved/dismissed rows for the same pair. A second non-unique index `idx_alerts_status_urgency` serves the open-queue read path (US-51).

## Why

Re-evaluation must update the existing open alert in place (no duplicate), resolution must never delete (audit trail), and a later re-firing of the same rule should create a _new_ open row while leaving the old resolved row intact. A partial unique index expresses exactly that invariant at the DB layer; full uniqueness on `(position_id, rule_code)` would block re-firing after resolution.

## Alternatives considered

- **Full unique `(position_id, rule_code)` + reuse the resolved row on re-fire** — rejected; it loses the distinct `triggered_at` history.
- **No DB constraint, rely on service logic only** — rejected; the index is a cheap integrity guard against double-insert bugs.

## Source

- `plans/us-50/research.md`, `plans/us-50/data-model.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Schema: `../../schema/tables.md`, `../../schema/migrations.md`
<!-- /generated -->
