---
page: docs/spec/architecture/02-adrs/active-leg-resolution.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/active-leg-resolution.md

## Verified (6)

- ✓ `activeLegSubquery()` lives in `src/main/services/active-leg-sql.ts:6`.
- ✓ Phase table: `CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`, others no match — `active-leg-sql.ts:10-11`.
- ✓ Tie-break `ORDER BY fill_date DESC, created_at DESC LIMIT 1` — `active-leg-sql.ts:13-14`.
- ✓ Returns a parameterless string fragment referencing outer `p.id` / `p.phase` — `active-leg-sql.ts:8-11`.
- ✓ Used by both `src/main/services/list-positions.ts:11,45` and `src/main/services/get-position.ts:16,203` (also by `src/main/services/evaluate-alerts.ts`).
- ✓ Regression test for rolled CSP — `src/main/services/list-positions.test.ts:121-124` ("returns correct strike and expiration for a rolled CSP position").

## Drift (0)

## Unverifiable (1)

- ? Historical claim that pre-US-12 `list-positions.ts` missed `ROLL_TO` legs — history, not checkable against current code.

## Missing files (0)

- (none) — `../../.extracts/us-12.md`, `../../.extracts/us-12-refactor.md`, `../../features/us-12-roll-csp.md` exist.
