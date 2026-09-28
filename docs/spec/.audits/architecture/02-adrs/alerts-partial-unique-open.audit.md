---
page: docs/spec/architecture/02-adrs/alerts-partial-unique-open.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/architecture/02-adrs/alerts-partial-unique-open.md

## Verified (6)

- ✓ `CREATE UNIQUE INDEX idx_alerts_open_unique` on `alerts (position_id, rule_code) WHERE status = 'open'` — `migrations/009_create_alerts.sql:18`.
- ✓ Non-unique `idx_alerts_status_urgency` — `migrations/009_create_alerts.sql:22`.
- ✓ `CREATE UNIQUE INDEX idx_alerts_dismissed_unique ... WHERE status = 'dismissed'` — `migrations/011_add_alerts_dismissal.sql:6`.
- ✓ Resolution never deletes — resolution is an `UPDATE ... SET status = 'resolved'` (`src/main/services/alerts.ts:161`).
- ✓ `upsertOpenAlert` and `dismissAlert` exist — `src/main/services/alerts.ts:80,203`.
- ✓ `upsertOpenAlert` finds a blocking open-or-dismissed row via a `UNION ALL` of two status-equality arms, each served by its partial unique index (line 15's claim) — `src/main/services/alerts.ts:86-95`.

## Drift (1)

- ✗ Line 9 says "`dismissAlert` relies on this to make its dismissed-row lookup a simple indexed existence check". `dismissAlert` (`src/main/services/alerts.ts:203-225`) looks the row up by primary key (`SELECT * FROM alerts WHERE id = ?`) and never queries by dismissed status; the indexed dismissed-row check is in `upsertOpenAlert` (`alerts.ts:86-95`). Suggested fix: name `upsertOpenAlert` instead of `dismissAlert`.

## Unverifiable (1)

- ? "The index is a cheap integrity guard against double-insert bugs" — rationale.

## Missing files (2)

- ✗ Source `plans/us-50/research.md` does not exist.
- ✗ Source `plans/us-50/data-model.md` does not exist. (`plans/us-59/research.md`, `plans/us-59/data-model.md`, `../../schema/tables.md`, `../../schema/migrations.md` exist.)
