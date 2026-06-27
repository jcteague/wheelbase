---
page: docs/spec/architecture/02-adrs/rolls-as-linked-leg-pairs.md
audited_at: 2026-06-27
findings: 0
---

# Audit: rolls-as-linked-leg-pairs.md

## Verified (8)

- ✓ Roll writes two legs in one transaction: `ROLL_FROM` (action `BUY`, PUT) and `ROLL_TO` (action `SELL`, PUT), both inside `db.transaction(() => {...})` (`src/main/services/roll-csp-position.ts:67-93`).
- ✓ Both legs share a `roll_chain_id` (column in the INSERTs) (`src/main/services/roll-csp-position.ts:72,92`).
- ✓ `legs.roll_chain_id` column exists from migration 001 (`migrations/001_initial_schema.sql:33`).
- ✓ Position row not updated — phase stays `CSP_OPEN` (`src/main/services/roll-csp-position.ts:122,131`).
- ✓ A `cost_basis_snapshots` row records the roll (`src/main/services/roll-csp-position.ts:110`).
- ✓ Active-leg query is phase-aware and includes `ROLL_TO` for both CSP_OPEN and CC_OPEN (`src/main/services/active-leg-sql.ts:10-11`).
- ✓ `calculateRollBasis` lives in the pure engine `src/main/core/costbasis.ts:235`.
- ✓ `getRollTypeLabel` and `computeNetCreditDebit` shared helpers live in `src/renderer/src/lib/rolls.ts:25,40`.

## Drift (0)

## Unverifiable (1)

- ? "A bug here was caught during US-12 green-phase ... query was originally restricted to CSP_OPEN only" — historical narrative; current code correctly includes ROLL_TO (verified above).

## Missing files (0)
