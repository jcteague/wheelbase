---
page: docs/spec/architecture/02-adrs/pending-assignments-table-as-notification.md
audited_at: 2026-06-27
findings: 0
---

# Audit: pending-assignments-table-as-notification.md

## Verified (4)

- ✓ `status` column with CHECK `IN ('pending', 'confirmed', 'dismissed')` exists, supporting the pending → confirmed | dismissed state machine (`migrations/008_create_pending_assignments.sql:9`).
- ✓ No separate `notifications` table exists — grep of `migrations/` finds only `pending_assignments` for assignment surfacing.
- ✓ Renderer polls every 30s via TanStack Query `refetchInterval: 30_000` (`src/renderer/src/api/assignments.ts:13`); also asserted in `src/renderer/src/components/AssignmentNotificationBanner.test.tsx:229,241`.
- ✓ The table row carries banner fields (ticker via position, `broker_symbol`, `qty`, `transaction_time`) (`migrations/008_create_pending_assignments.sql:5-7`).

## Drift (0)

## Unverifiable (1)

- ? "Notifications must survive app restart" and "no in-memory queue / no IPC pub/sub channel" are narrative/negative claims; the table-backed approach is consistent with this, but restart-resilience itself is not mechanically verifiable. Flag for human review only if doubted.

## Missing files (0)
