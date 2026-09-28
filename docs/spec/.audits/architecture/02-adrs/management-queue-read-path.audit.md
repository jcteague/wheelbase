---
page: docs/spec/architecture/02-adrs/management-queue-read-path.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/02-adrs/management-queue-read-path.md

## Verified (5)

- ✓ `listManagementQueue(db)` in `src/main/services/alerts.ts:274`, separate from `listOpenAlerts` (`:231`).
- ✓ JOINs `alerts` to `positions` for `ticker` and `phase`, filters `status = 'open'`, and orders `CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, triggered_at ASC` — `alerts.ts:276-292`.
- ✓ `ManagementQueueItem` = `alertId, positionId, ticker, phase, urgency, summary, quickAction, triggeredAt` — `src/main/schemas.ts:622-631`.
- ✓ `listOpenAlerts` sorts by `rowid` — `alerts.ts:233`.
- ✓ `idx_alerts_status_urgency` exists — `migrations/009_create_alerts.sql:22`; feature and domain pages exist.

## Drift (0)

None.

## Unverifiable (0)

None.

## Missing files (2)

- ✗ `plans/us-51/research.md` — `plans/us-51/` no longer exists (plan dirs retired).
- ✗ `plans/us-51/data-model.md` — same.
