---
page: docs/spec/architecture/02-adrs/single-step-phase-transitions.md
audited_at: 2026-09-28
findings: 2
---

# Audit: single-step-phase-transitions.md

## Verified (6)

- ✓ `expireCsp → WHEEL_COMPLETE` — `src/main/core/lifecycle.ts:149-162`.
- ✓ `recordAssignment → HOLDING_SHARES` — `lifecycle.ts:273-290`.
- ✓ `expireCc → HOLDING_SHARES`, `closeCoveredCall → HOLDING_SHARES` — `lifecycle.ts:303-316,331-350`.
- ✓ `closeCsp → CSP_CLOSED_PROFIT | CSP_CLOSED_LOSS` — `lifecycle.ts:109,136`; `rollCsp → CSP_OPEN` — `lifecycle.ts:362,381`.
- ✓ Phase update, leg insert and snapshot insert are in one `db.transaction` — e.g. `expire-csp-position.ts:57`, `assign-csp-position.ts:101`, `expire-cc-position.ts:46`.
- ✓ All linked extracts (us-5/6/9) and feature pages exist.

## Drift (1)

- ✗ Page claims "The `phase` enum stays compact: no `*_PENDING` / `*_EXPIRED` variants" (line 29). `WheelPhase` in `src/main/core/types.ts:7-18` includes `CSP_EXPIRED` (line 9) and `CC_EXPIRED` (line 14). No lifecycle function transitions to them, so the single-step behaviour holds, but the enum claim is false. Suggested fix: note that the variants exist in the enum but are never produced, or remove them from the enum.

## Unverifiable (1)

- ? Rationale (no business semantics for intermediate states; event-sourcing rejected) — narrative.

## Missing files (0)

None.
