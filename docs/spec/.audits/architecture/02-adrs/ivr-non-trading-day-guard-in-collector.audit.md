---
page: docs/spec/architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md

## Verified (6)

- ✓ Superseded banner accurate: collector renamed `collectIvHistoryBatch` with no `trigger` input — `src/main/services/ivr-collector.ts:25-39,65`.
- ✓ No calendar-permission check; weekend/holiday run is `up_to_date` with no bar request — `ivr-collector.ts:5-7`, `src/main/services/iv-history.ts:226`.
- ✓ `skippedReason: 'market_closed'` no longer exists — `ivr-collector.ts:22`; grep of non-test `src/` empty.
- ✓ `JobRunContext.trigger` survives on the scheduler with no consumer — `src/main/services/polling-scheduler.ts:17,204,277`; no job reads it.
- ✓ `isTradingDay` / `fetchMarketStatusOrNull` absent from `src/main` (grep empty), consistent with the US-98 amendment.
- ✓ Linked pages exist: `ivr-collector-idempotent-over-missing-sessions.md`, us-44/us-98/us-100 feature pages, us-98/us-100 extracts, `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`, `trading-calendar-store.ts`, `polling-scheduler.ts`.

## Drift (0)

None. The body below the banner is explicitly framed as the guard "as it stood from US-44 through US-100"; its present-tense references to `collectIVRSnapshots`, `market_closed` and Barchart are history, not drift.

## Unverifiable (1)

- ? Historical rationale (Sunday trader symptom, UTC weekday mismatch) — narrative.

## Missing files (0)

None.
