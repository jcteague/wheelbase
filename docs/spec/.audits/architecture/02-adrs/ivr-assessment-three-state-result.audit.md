---
page: docs/spec/architecture/02-adrs/ivr-assessment-three-state-result.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/02-adrs/ivr-assessment-three-state-result.md

## Verified (2)

- ✓ `assessIvRank` returns a status-tagged result rather than `null`, with an `unreadable` state — `src/main/core/ivr-freshness.ts:51-53,95-102`.
- ✓ No `usable` boolean on the wire; usability derived by `isUsableState` — `src/main/core/ivr-freshness.ts:38-40`; `IpcIvRank` has no `usable` field (`src/preload/index.d.ts:432-440`).

## Drift (4)

- ✗ Lines 7-9: the result is documented as three-state `{ status: 'assessed' } | { status: 'expired' } | { status: 'unreadable' }`. The code is two-state — `IvRankAssessment = { status: 'assessed'; reading } | { status: 'unreadable' }` (`src/main/core/ivr-freshness.ts:51-53`). An aged-out reading is now `assessed` with `state: 'expired'` and keeps its value (comment `:42-50`; rendered with its age in `src/renderer/src/components/ReadingNote.tsx:41-46`), so "both non-assessed states render identically as 'no IV rank'" no longer holds. Suggested fix: amend the decision (or mark it superseded by the US-121 change) to two states.
- ✗ Lines 10-11: `getAssessedIvrByUnderlying` and log key `ivr_assessment_unreadable_snapshot` do not exist in `src/`. The boundary is now `readIvRankLookup` in `src/main/services/iv-rank-lookup.ts`, logging `ivr_assessment_unreadable_reading` (`:81`).
- ✗ Line 14: `AssessedIvRank` is documented as `{ value, observedAt, ageTradingDays, state }`. It now also carries `percentile`, `low`, `high` — `src/main/core/ivr-freshness.ts:23-34`.
- ✗ Lines 30-31: "the shipped `IpcIvRank` has four fields, not five". `IpcIvRank` has seven fields (`value`, `percentile`, `low`, `high`, `observedAt`, `ageTradingDays`, `state`) — `src/preload/index.d.ts:432-440`. The no-`usable` point still stands; the count is stale.

## Unverifiable (1)

- ? "usability is derived … by the tone rule inside `IvrCell`" — `IvrCell.tsx` maps state to a colour class (`:24`) but the "tone rule" is a design description; flag for review.

## Missing files (0)

None. (`plans/us-98/contracts/` exists.)
