---
page: docs/spec/architecture/02-adrs/pending-assignments-table-as-notification.md
audited_at: 2026-09-28
findings: 1
---

# Audit: pending-assignments-table-as-notification.md

## Verified (5)

- ✓ `status` column constrained to `('pending', 'confirmed', 'dismissed')` — `migrations/008_create_pending_assignments.sql:9`.
- ✓ Confirm / dismiss are plain `UPDATE`s — `src/main/services/pending-assignments.ts:81, 85`.
- ✓ Renderer polls via TanStack Query `refetchInterval: 30_000` — `src/renderer/src/api/assignments.ts:10-13` (asserted in `AssignmentNotificationBanner.test.tsx:229-241`).
- ✓ Read path is request/response `assignments:list-pending` — `src/main/ipc/assignments.ts:16`; no push channel for assignments in `src/main/ipc/`.
- ✓ Row carries `broker_symbol`, `qty`, `transaction_time` for the banner — `008_create_pending_assignments.sql:6-8`.

## Drift (0)

None.

## Unverifiable (1)

- ? "Notification arrives at most a few times per day" / push events unnecessary — rationale.

## Missing files (1)

- ✗ Source `plans/us-35/research.md` — `plans/us-35/` no longer exists.
