---
page: docs/spec/architecture/02-adrs/alert-compute-then-persist.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/alert-compute-then-persist.md

## Verified (6)

- ✓ `evaluateAlerts` loads evaluable positions (`EVALUABLE_QUERY`) — `src/main/services/evaluate-alerts.ts:54,196`.
- ✓ Compute phase calls `evaluatePosition` per position inside a per-position `try/catch` — `evaluate-alerts.ts:240-265`.
- ✓ Matches + skips accumulated before any write — `evaluate-alerts.ts:234-262`.
- ✓ Persist phase is a single `db.transaction(...)` upserting matches then resolving everything not kept open — `evaluate-alerts.ts:274-284` (`upsertOpenAlert` :277, `resolveAlertsNotIn` :282).
- ✓ Skipped rules are held open — `keepOpenKeys = new Set(skippedKeys)` at `evaluate-alerts.ts:275`.
- ✓ Mirrors `detect-assignments` single-transaction pattern — `src/main/services/detect-assignments.ts:122`.

## Drift (0)

## Unverifiable (0)

## Missing files (1)

- ✗ Source `plans/us-50/research.md` does not exist (no `plans/us-50/` directory). `../../features/us-50-alert-engine.md` and `../../domain/alerts.md` exist.
