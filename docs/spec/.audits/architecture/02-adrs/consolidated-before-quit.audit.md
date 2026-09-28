---
page: docs/spec/architecture/02-adrs/consolidated-before-quit.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/consolidated-before-quit.md

## Verified (4)

- ✓ `app.on('before-quit', ...)` calls `e.preventDefault()`, awaits `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])`, then `app.exit(0)` — `src/main/index.ts:337-342`.
- ✓ Exactly one `before-quit` registration in `src/main` (grep: only `src/main/index.ts:337`).
- ✓ `scheduler.stop()` drains in-flight handlers with a 5-second timeout — `src/main/services/polling-scheduler.ts:252-272`.
- ✓ Related ADR `scheduler-singleton-safe-broker.md` exists.

## Drift (0)

## Unverifiable (1)

- ? The handler now also calls `ivrAbort.abort()` before the `Promise.all` (`src/main/index.ts:339`, added with US-121 so an IVR batch stops at the next ticker boundary). The page does not mention it; this is an addition, not a contradiction.

## Missing files (1)

- ✗ Source `plans/us-35/refactor-phase-area6-results.md` does not exist (no `plans/us-35/` directory). `../../features/us-46-polling-scheduler.md` exists.
