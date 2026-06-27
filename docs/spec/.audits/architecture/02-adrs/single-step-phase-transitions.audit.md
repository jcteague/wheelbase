---
page: docs/spec/architecture/02-adrs/single-step-phase-transitions.md
audited_at: 2026-06-27
findings: 0
---

# Audit: single-step-phase-transitions.md

## Verified (6)

- ✓ `expireCsp → WHEEL_COMPLETE` (single step from CSP_OPEN) — `src/main/core/lifecycle.ts:149-162` (returns `{ phase: 'WHEEL_COMPLETE' }`, guards `currentPhase === 'CSP_OPEN'`).
- ✓ `recordAssignment → HOLDING_SHARES` (from CSP_OPEN) — `lifecycle.ts:273-290`.
- ✓ `expireCc → HOLDING_SHARES` — `lifecycle.ts:303-316`.
- ✓ `closeCoveredCall → HOLDING_SHARES` — `lifecycle.ts:331-350`.
- ✓ `closeCsp → CSP_CLOSED_PROFIT | CSP_CLOSED_LOSS` — `lifecycle.ts:109,136`.
- ✓ `rollCsp → CSP_OPEN` (no-op for phase) — `lifecycle.ts:362,381` (returns `{ phase: 'CSP_OPEN' }`).

## Drift (0)

None. No synthetic intermediate phases `CSP_EXPIRED`, `ASSIGNMENT_PENDING`, or `CC_EXPIRING` found in `src/main/core/lifecycle.ts` or `src/main/schemas.ts`.

Note (not drift): `CSP_EXPIRED` appears in `src/renderer/src/lib/phase.ts:18` as a display-label map key `'Put Expired'`, but it is a renderer label, not a lifecycle-engine phase produced by transitions.

## Unverifiable (2)

- ? "phase column updated in a single transaction along with leg insert and cost-basis snapshot" — transaction-composition claim handled in service layer, not in the pure engine audited here.
- ? Story-note quote "single-step transition for simplicity..." — narrative.

## Missing files (0)

- Extract/feature references only.
