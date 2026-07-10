# ADR: `alerts` table uses a partial unique index keyed on open status

<!-- generated:from us-50,us-59 -->

## Decision

Migration `009_create_alerts.sql` creates the `alerts` table with a **partial unique index** `CREATE UNIQUE INDEX idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'`. This guarantees at most one open alert per `(position, rule)` while allowing any number of historical resolved/dismissed rows for the same pair. A second non-unique index `idx_alerts_status_urgency` serves the open-queue read path (US-51).

US-59 mirrors this exact shape for the `dismissed` status: migration `011_add_alerts_dismissal.sql` adds `CREATE UNIQUE INDEX idx_alerts_dismissed_unique ON alerts (position_id, rule_code) WHERE status = 'dismissed'`, guaranteeing at most one _currently_ dismissed row per `(position, rule)` while any number of historical dismissed-then-resolved rows accumulate. `dismissAlert` relies on this to make its dismissed-row lookup a simple indexed existence check rather than a most-recent-row query.

## Why

Re-evaluation must update the existing open alert in place (no duplicate), resolution must never delete (audit trail), and a later re-firing of the same rule should create a _new_ open row while leaving the old resolved row intact. A partial unique index expresses exactly that invariant at the DB layer; full uniqueness on `(position_id, rule_code)` would block re-firing after resolution.

The dismissed-status mirror exists for the same reason on the dismiss side: `upsertOpenAlert` needs a cheap, indexed way to ask "is there currently a blocking dismissed row for this key?" without an `ORDER BY rowid DESC LIMIT 1` scan, and the index shape already generalizes cleanly to a second status value.

## Alternatives considered

- **Full unique `(position_id, rule_code)` + reuse the resolved row on re-fire** — rejected; it loses the distinct `triggered_at` history.
- **No DB constraint, rely on service logic only** — rejected; the index is a cheap integrity guard against double-insert bugs.
- **(US-59) Query "most recent row regardless of status" and branch on its status** — rejected; more expensive than an indexed equality lookup and duplicates information the partial unique index already guarantees.

## Source

- `plans/us-50/research.md`, `plans/us-50/data-model.md`
- `plans/us-59/research.md`, `plans/us-59/data-model.md`
- Feature pages: `../../features/us-50-alert-engine.md`, `../../features/us-59-dismiss-alert.md`
- Schema: `../../schema/tables.md`, `../../schema/migrations.md`
<!-- /generated -->
