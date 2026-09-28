---
page: docs/spec/architecture/02-adrs/ivr-freshness-in-completed-sessions.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/ivr-freshness-in-completed-sessions.md

## Verified (7)

- ✓ `assessIvRank` in `src/main/core/ivr-freshness.ts:95` maps age via `tierForAge` onto `fresh` (0–1), `aging` (2–3), `stale` (4–10), `expired` (>10) — `:11-13,63-69`.
- ✓ `isUsableState` derives usability from state — `ivr-freshness.ts:38-40`.
- ✓ `countCompletedSessionsAfter` in `src/main/core/trading-calendar.ts:164`, pure over a caller-supplied `TradingCalendar`, counting sessions strictly after that have closed by `now`.
- ✓ Observation belongs to the latest session closed at or before its timestamp — `getMostRecentCompletedSession`, `trading-calendar.ts:150-157`, used at `ivr-freshness.ts:98`.
- ✓ `AssessContext` requires `now` and `calendar` explicitly — `ivr-freshness.ts:55-61`.
- ✓ A calendar that cannot answer yields `null` → `unreadable`, never a guessed age — `trading-calendar.ts:169-173`, `ivr-freshness.ts:99-102`.
- ✓ Tier constants `FRESH_MAX_AGE`, `AGING_MAX_AGE`, `STALE_MAX_AGE` in one module; linked ADR `trading-calendar-fetched-and-cached.md` and us-98 pages exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "not duplicated in Signal, services or JSX" — an exhaustive negative; spot greps found no duplicate constants, but flag for human review.

## Missing files (0)

None.
