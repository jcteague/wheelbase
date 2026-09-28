---
page: docs/spec/architecture/02-adrs/assignment-watermark-poll-start.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/assignment-watermark-poll-start.md

## Verified (4)

- ✓ `pollStartedAt = new Date().toISOString()` captured before the broker call — `src/main/services/detect-assignments.ts:95` precedes `await brokerProvider.getActivities({ type: 'OPASN', since })` at `:99`.
- ✓ `pollStartedAt` is what is persisted as the watermark — `appSettings.set(db, watermarkKey, pollStartedAt)` at `detect-assignments.ts:153` (key `assignments_last_poll_at:${env}`, `:87`).
- ✓ `INSERT OR IGNORE` absorbs re-processing — `detect-assignments.ts:117`.
- ✓ `detectAssignments` / `brokerProvider.getActivities` names match (`getActivities` takes a filter with `since`; the page's `{ since }` omits `type: 'OPASN'`, which is not a contradiction).

## Drift (0)

## Unverifiable (1)

- ? The race analysis and "surfaced by the code-review pass" history — narrative.

## Missing files (1)

- ✗ Source `plans/us-35/code-review-fixes.md` does not exist (no `plans/us-35/` directory). `../../features/us-35-assignment-detection.md` exists.
