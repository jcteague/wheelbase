---
page: docs/spec/architecture/02-adrs/profit-target-nullable-column.md
audited_at: 2026-06-27
findings: 1
---

# Audit: profit-target-nullable-column.md

## Verified (4)

- ✓ `positions.profit_target_percent INTEGER` added (nullable) via `migrations/005_add_profit_target_percent.sql` — `ALTER TABLE positions ADD COLUMN profit_target_percent INTEGER`.
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50` hard-coded in `src/main/core/profit-target.ts:4`.
- ✓ `resolveProfitTarget(override: number | null): number` exists, returns override when non-null via explicit `=== null` check (so `0` is a real override) (`src/main/core/profit-target.ts:6-7`).
- ✓ Helper lives in `src/main/core/profit-target.ts` as a pure function (no DB/broker imports).

## Drift (1)

- ✗ Decision states "No `app_settings` table is introduced." An `app_settings` table DOES now exist (`migrations/006_add_credential_settings.sql:13`, `CREATE TABLE app_settings`), introduced later for credential/settings storage (US-37 era). The claim was true for US-33 in isolation but reads as a false absolute against current code. Suggested fix: scope the statement to "no `app_settings` row/key is used for the profit target" or note that `app_settings` was later added for unrelated settings.

## Unverifiable (0)

## Missing files (0)
