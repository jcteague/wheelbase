---
page: docs/spec/architecture/02-adrs/assignment-polling-cadence.md
audited_at: 2026-06-27
findings: 0
---

# Audit: assignment-polling-cadence.md

## Verified (3)

- ✓ `detect-assignments` job (`DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'`, `src/main/services/detect-assignments.ts:8`) registered with cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `src/main/index.ts:182-189`.
- ✓ 60s regular / 5min extended / parked overnight (`marketClosedMs: null`) matches the policy values exactly — `index.ts:185-188`.
- ✓ Single tick on start: `scheduler.start()` invoked once — `index.ts:251` (the scheduler's first-tick-on-start behavior is the scheduler contract; consistent with the ADR's "first tick fires once on scheduler.start()").

## Drift (0)

None.

## Unverifiable (2)

- ? "OPASN events post overnight ... first poll of the next session catches everything" — broker/domain rationale; not auditable in this repo.
- ? Alternatives ("single tick at open+30min", "always-on 60s") — deferred design notes.

## Missing files (0)

Page references related ADR `polling-scheduler-settimeout-chain.md` (sibling); not opened in this audit.
