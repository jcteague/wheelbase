---
page: docs/spec/architecture/02-adrs/assignment-polling-cadence.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/assignment-polling-cadence.md

## Verified (3)

- ✓ `detect-assignments` job registered with `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` — `src/main/index.ts:240-247`.
- ✓ First tick fires on `scheduler.start()` regardless of session — `start()` calls `autoStart`, which for interval cadences does `scheduleTick(state, 0)` — `src/main/services/polling-scheduler.ts:226-233,245-249`.
- ✓ Related ADR `polling-scheduler-settimeout-chain.md` exists.

## Drift (0)

## Unverifiable (2)

- ? OPASN events post overnight; early-exercise corner case — domain rationale.
- ? "Single tick at market open + 30 minutes" deferred pending user feedback — planning note.

## Missing files (1)

- ✗ Source `plans/us-35/research.md` does not exist (no `plans/us-35/` directory). `../../features/us-35-assignment-detection.md` exists.
