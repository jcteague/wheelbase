---
page: docs/spec/architecture/02-adrs/management-queue-read-path.md
audited_at: 2026-06-27
findings: 0
---

# Audit: management-queue-read-path.md (us-51, newly created)

## Verified (8)

- ✓ `listManagementQueue(db)` exists in `src/main/services/alerts.ts:184`, separate from `listOpenAlerts` (`alerts.ts:141`).
- ✓ JOINs open `alerts` to `positions` attaching `ticker` and `phase`: `JOIN positions p ON p.id = a.position_id`, selecting `p.ticker`, `p.phase` (`alerts.ts:190-197`).
- ✓ ORDER BY matches the page verbatim: `CASE a.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, a.triggered_at ASC` (`alerts.ts:199-201`).
- ✓ Filters `WHERE a.status = 'open'` (`alerts.ts:198`).
- ✓ Returns `ManagementQueueItem` view-model via `mapQueueRow` (`alerts.ts:166,206`), not raw `AlertRecord`.
- ✓ `ManagementQueueItem` in `src/main/schemas.ts:484-493` has exactly `alertId, positionId, ticker, phase, urgency, summary, quickAction, triggeredAt` — omits `lastEvaluatedAt/resolvedAt/createdAt/updatedAt/status` audit fields as claimed.
- ✓ `listOpenAlerts` left untouched, still `ORDER BY rowid` (`alerts.ts:143`), confirming the "sorts by rowid, doesn't satisfy AC" rationale.
- ✓ `idx_alerts_status_urgency` index exists (`migrations/009_create_alerts.sql:22`), supporting the status-filter claim.

## Drift (0)

## Unverifiable (0)

## Missing files (0)

- ✓ Source links resolve: `../../features/us-51-management-queue-dashboard.md` and `../../domain/alerts.md` both exist. (`plans/us-51/*` are pre-spec working dirs, not in docs/spec.)

One-line: Audited management-queue-read-path.md: 8 verified, 0 drift, 0 unverifiable, 0 missing.
