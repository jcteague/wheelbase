---
page: docs/spec/architecture/02-adrs/assignment-watermark-poll-start.md
audited_at: 2026-06-27
findings: 0
---

# Audit: assignment-watermark-poll-start.md

## Verified (4)

- ✓ `detectAssignments` exists at `src/main/services/detect-assignments.ts:78`.
- ✓ `pollStartedAt = new Date().toISOString()` is captured **before** the broker await: `src/main/services/detect-assignments.ts:95`, with the `getActivities` await at line 99.
- ✓ `pollStartedAt` (not a post-await timestamp) is persisted as the watermark: `appSettings.set(db, watermarkKey, pollStartedAt)` at `src/main/services/detect-assignments.ts:153`.
- ✓ `INSERT OR IGNORE` is used for pending rows: `src/main/services/detect-assignments.ts:117`.

## Drift (0)

None.

## Unverifiable (1)

- ? The latency-race rationale (an OPASN landing between call and response being permanently skipped). The behavioral claim is corroborated by the dedicated race test (`detect-assignments.test.ts:240-260`) but the narrative argument itself is not mechanically checkable.

## Missing files (0)

- ✓ Feature page `../../features/us-35-assignment-detection.md` exists.
