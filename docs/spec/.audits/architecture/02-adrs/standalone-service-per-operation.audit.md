---
page: docs/spec/architecture/02-adrs/standalone-service-per-operation.md
audited_at: 2026-09-28
findings: 2
---

# Audit: standalone-service-per-operation.md

## Verified (6)

- ✓ One file per operation exists in `src/main/services/`: `close-csp-position.ts`, `expire-csp-position.ts`, `assign-csp-position.ts`, `open-covered-call-position.ts`, `close-covered-call-position.ts`, `expire-cc-position.ts`, `roll-csp-position.ts` (plus later `roll-cc-position.ts`, `record-call-away-position.ts`); read helpers `get-position.ts`, `list-positions.ts`.
- ✓ Each service loads context via `getPosition(db, positionId)` — e.g. `close-csp-position.ts:22`, `roll-csp-position.ts:22`, `expire-cc-position.ts:19`.
- ✓ Writes happen in a single `db.transaction(() => …)` — `close-csp-position.ts:56`, `roll-csp-position.ts:67`, `open-covered-call-position.ts:68`, etc.
- ✓ Integration tests live next to each service (`close-csp-position.test.ts`, `roll-csp-position.test.ts`, …).
- ✓ `get-position.ts` and `list-positions.ts` share SQL via `activeLegSubquery()` — `src/main/services/active-leg-sql.ts:6`, used at `get-position.ts:16,203` and `list-positions.ts:11,45`.
- ✓ Linked ADR `./active-leg-resolution.md`, extracts us-4/5/6/7/8/9/12 and feature pages exist.

## Drift (1)

- ✗ Page says `src/main/services/positions.ts` re-exports "the operations" for IPC handlers (lines 7, 24), listing `roll-csp-position.ts` among them. The barrel (`positions.ts:14-21`) re-exports list/get/close-CSP/expire-CSP/assign/open-CC/close-CC/expire-CC only — not `rollCspPosition`, `rollCcPosition` or `recordCallAwayPosition`, which `src/main/ipc/positions.ts:27-30` imports directly from their service files (it also imports `closeCoveredCallPosition` directly). Suggested fix: say the barrel is partial, or complete it.

## Unverifiable (1)

- ? Historical rationale (US-12 god-object split; group-by-phase rejected) and the "standard CC_OPEN setup" test seeding convention — narrative.

## Missing files (0)

None.
