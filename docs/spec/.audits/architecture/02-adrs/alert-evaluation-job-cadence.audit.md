---
page: docs/spec/architecture/02-adrs/alert-evaluation-job-cadence.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/alert-evaluation-job-cadence.md

## Verified (5)

- ✓ `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` — `src/main/services/evaluate-alerts.ts:28`.
- ✓ Registered on the shared `scheduler` in `src/main/index.ts:289-306`.
- ✓ Cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `src/main/index.ts:291-296`.
- ✓ Handler uses in-scope `db` and calls `evaluateAlerts` — `src/main/index.ts:297-305` (it also reads `getAlertDefaults(db)` and passes `marketDataFactory.create()`, added by later stories).
- ✓ Not broker-gated — comment at `src/main/index.ts:286-288` and no broker check around the registration.

## Drift (0)

## Unverifiable (1)

- ? "Alerts must reflect intraday state on the polling cadence" (alternative rejected) — rationale.

## Missing files (2)

- ✗ Source `plans/us-50/plan.md` does not exist (no `plans/us-50/` directory).
- ✗ Source `plans/us-50/research.md` does not exist.
