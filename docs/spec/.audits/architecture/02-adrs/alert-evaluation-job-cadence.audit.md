---
page: docs/spec/architecture/02-adrs/alert-evaluation-job-cadence.md
audited_at: 2026-06-27
findings: 0
---

# Audit: alert-evaluation-job-cadence.md

## Verified (5)

- ✓ Single job `ALERT_EVAL_JOB_NAME = 'alert-evaluation'` — `src/main/services/evaluate-alerts.ts:21`; matches test fixture `index.test.ts:108`.
- ✓ Registered on the shared `scheduler` singleton in `src/main/index.ts:219-228`.
- ✓ Cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `index.ts:222-226`.
- ✓ Handler resolves in-scope `db` and calls `evaluateAlerts`: `handler: async () => evaluateAlerts({ db })` — `index.ts:227`.
- ✓ Not broker-gated: handler has no `activeBrokerEnv`/`brokerFactory` guard, unlike `detect-assignments` (`index.ts:191-201`).

## Drift (0)

None.

## Unverifiable (0)

None.

## Missing files (0)

None.
