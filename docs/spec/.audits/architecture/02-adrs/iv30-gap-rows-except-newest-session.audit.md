---
page: docs/spec/architecture/02-adrs/iv30-gap-rows-except-newest-session.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/iv30-gap-rows-except-newest-session.md

## Verified (7)

- ✓ `iv30_gap (underlying, session, method, reason, attempted_at)` with `reason IN ('no_underlying_bar', 'no_tradeable_pair')` — `migrations/016_create_iv30_history.sql`.
- ✓ Gaps never contribute a value and count against coverage: `computeIvMetrics` counts only readings in the window — `src/main/core/iv-metrics.ts:35-39`.
- ✓ Missing = required − readings − gaps — `listMissingSessions` via `selectAttemptedSessions`, `src/main/services/iv-history.ts:63-70`, `src/main/services/iv-history-store.ts:120`.
- ✓ Newest session never written as a gap — `src/main/services/iv-history.ts:249-254` (`session.date !== newest`).
- ✓ A later reading deletes the gap row in the same transaction — `persistIvHistory`, `src/main/services/iv-history-store.ts:160-177`.
- ✓ All-gaps ticker reads `insufficient` with coverage 0 (→ `insufficient_history`) — `src/main/services/iv-history-read.ts:27-28`, `src/main/services/iv-rank-lookup.ts:48`.
- ✓ Cited sources exist (`plans/us-121/research.md`, `plans/us-121/refactor-phase-results.md`, both services).

## Drift (0)

None.

## Unverifiable (1)

- ? ETSY request estimate and "Alpaca does not revise daily bars" — external/empirical. Known-limit (`no_underlying_bar` never re-probed) is consistent with the code: gaps are only replaced by a reading and `listMissingSessions` excludes them.

## Missing files (0)

None.
