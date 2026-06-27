---
page: docs/spec/architecture/02-adrs/active-leg-resolution.md
audited_at: 2026-06-27
findings: 0
---

# Audit: active-leg-resolution.md

## Verified (5)

- ✓ `activeLegSubquery()` exported from `src/main/services/active-leg-sql.ts:6`.
- ✓ Phase-aware roles: `CSP_OPEN → (CSP_OPEN, ROLL_TO)`, `CC_OPEN → (CC_OPEN, ROLL_TO)`, all other phases no match — `active-leg-sql.ts:10-12`.
- ✓ Tie-break `ORDER BY fill_date DESC, created_at DESC LIMIT 1` — `active-leg-sql.ts:13-14`.
- ✓ Returns a SQL fragment referencing `p.id` and `p.phase` from the outer query (no parameters) — `active-leg-sql.ts:7-14`.
- ✓ Used by both `list-positions.ts:45` and `get-position.ts:200` (also `evaluate-alerts.ts:46`), so callers cannot drift.

## Drift (0)

None.

## Unverifiable (1)

- ? "Before US-12 ... the list showed null strike/expiration" historical narrative — not mechanically auditable; the current code matches the post-fix decision.

## Missing files (0)

Note: page references `list-positions.test.ts` regression tests ("rolled CSP shows ROLL_TO leg's strike/expiration") — not individually grepped, low risk.
