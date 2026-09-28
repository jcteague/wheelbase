---
page: docs/spec/architecture/02-adrs/rolls-as-linked-leg-pairs.md
audited_at: 2026-09-28
findings: 0
---

# Audit: rolls-as-linked-leg-pairs.md

## Verified (10)

- ✓ `legs.roll_chain_id` column exists from migration 001 — `migrations/001_initial_schema.sql:33`.
- ✓ Fresh UUID `rollChainId` plus leg/snapshot ids — `src/main/services/roll-csp-position.ts:61-64`.
- ✓ `ROLL_FROM` leg `BUY`, current strike/expiration, `premium_per_contract = costToClose` — `roll-csp-position.ts:68-85`.
- ✓ `ROLL_TO` leg `SELL`, `strike = newStrike ?? activeLeg.strike`, new expiration, `newPremium` — `roll-csp-position.ts:34, 88-105`.
- ✓ Two leg INSERTs + one `cost_basis_snapshots` INSERT inside `db.transaction(() => { … })` — `roll-csp-position.ts:67-120`; no `UPDATE positions` / `UPDATE legs` in the file.
- ✓ `calculateRollBasis` uses `net = newPremium − costToClose`, subtracting a positive net from basis — `src/main/core/costbasis.ts:235-265`.
- ✓ Active-leg SQL includes `ROLL_TO` and orders `fill_date DESC, created_at DESC` — `src/main/services/active-leg-sql.ts:6-14`.
- ✓ `getRollTypeLabel` returns `Roll Out` / `Roll Up & Out` / `Roll Down & Out` — `src/renderer/src/lib/rolls.ts:23-31`; used by `RollCspForm.tsx` and `RollCspSuccess.tsx`.
- ✓ `computeNetCreditDebit` shared helper — `rolls.ts:40`.
- ✓ Linked ADRs `active-leg-resolution.md` and `client-side-pnl-preview.md` exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Rejected alternatives (in-place update, `rolls` join table) and US-12 green-phase bug history — design history.

## Missing files (0)

None.
