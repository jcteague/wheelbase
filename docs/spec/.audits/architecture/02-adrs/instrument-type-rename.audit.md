---
page: docs/spec/architecture/02-adrs/instrument-type-rename.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/architecture/02-adrs/instrument-type-rename.md

## Verified (6)

- ✓ `InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])` — `src/main/core/types.ts:32,39`. No lifecycle `OptionType` enum remains (the only `OptionType` is the unrelated `'call' | 'put'` pricer type in `src/main/core/black-scholes.ts:1`).
- ✓ `migrations/003_rename_option_type_to_instrument_type.sql` rebuilds via `legs_new` with `CHECK (instrument_type IN ('PUT', 'CALL', 'STOCK'))` and renames — lines 1, 6, 19, 56.
- ✓ ASSIGN legs use `instrument_type = 'STOCK'` — `src/main/services/assign-csp-position.ts:106`.
- ✓ Leg INSERTs use `instrument_type` in `src/main/services/positions.ts:91`, `close-csp-position.ts:59`, `expire-csp-position.ts:60`.
- ✓ `LegRecord.instrumentType: InstrumentType` — `src/main/schemas.ts:81,86`.
- ✓ Linked extract/feature exist.

## Drift (2)

- ✗ Line 27: "`services/get-position.ts` SELECT alias updates … to `instrument_type as instrumentType`". The SELECT reads the raw column (`src/main/services/get-position.ts:132,185`) and maps it in JS (`instrumentType: r.instrument_type`, `:64,100`); there is no SQL alias. Minor; suggested fix: describe the row-mapper.
- ✗ Line 28: "`LegRecord` Zod schema renames the field". `LegRecord` is a plain TypeScript `interface`, not a Zod schema — `src/main/schemas.ts:81`. Minor wording drift.

## Unverifiable (1)

- ? "This is the only DB migration in the Phase 1 wheel scope" and the better-sqlite3 rebuild note — historical/procedural.

## Missing files (0)

None.
