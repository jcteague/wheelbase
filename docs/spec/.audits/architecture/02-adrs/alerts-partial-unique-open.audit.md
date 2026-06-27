---
page: docs/spec/architecture/02-adrs/alerts-partial-unique-open.md
audited_at: 2026-06-27
findings: 0
---

# Audit: alerts-partial-unique-open.md

## Verified (4)

- ✓ Migration `migrations/009_create_alerts.sql` exists and `CREATE TABLE alerts` — `009_create_alerts.sql:1`.
- ✓ Partial unique index `idx_alerts_open_unique ON alerts (position_id, rule_code) WHERE status = 'open'` — `009_create_alerts.sql:18-19`.
- ✓ Second non-unique index `idx_alerts_status_urgency` for the open-queue read path — `009_create_alerts.sql:22`.
- ✓ Resolution updates (never deletes) rows: service uses `UPDATE alerts SET status = 'resolved' ...` — `src/main/services/alerts.ts:129`, consistent with "audit trail, never delete."

## Drift (0)

None. (Note: index `WHERE status = 'open'` matches; resolved rows use `status = 'resolved'`, so re-firing creates a new open row — consistent with the partial-index rationale.)

## Unverifiable (0)

None.

## Missing files (0)

None.
