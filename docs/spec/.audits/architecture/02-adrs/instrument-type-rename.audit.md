---
page: docs/spec/architecture/02-adrs/instrument-type-rename.md
audited_at: 2026-06-27
findings: 1
---

# Audit: instrument-type-rename.md

## Verified (8)

- ✓ `InstrumentType` enum is `z.enum(['PUT', 'CALL', 'STOCK'])` in `src/main/core/types.ts:32`, with type alias at `:39` and `OptionInstrumentType = Extract<…,'PUT'|'CALL'>` at `:41`.
- ✓ Migration `migrations/003_rename_option_type_to_instrument_type.sql` exists and is the only Phase-1 wheel rename migration.
- ✓ CHECK constraint `instrument_type IN ('PUT', 'CALL', 'STOCK')` present in migration 003.
- ✓ Migration uses the SQLite table-rebuild idiom (create `legs_new`, copy via INSERT…SELECT mapping `option_type`→`instrument_type`, `DROP TABLE legs`, `ALTER TABLE legs_new RENAME TO legs`), matching the ADR's Consequences note about rebuilding the CHECK constraint.
- ✓ `LegRecord` Zod/interface field is `instrumentType: InstrumentType` in `src/main/schemas.ts:55-60`.
- ✓ Services use `instrument_type` for leg INSERTs: `src/main/services/positions.ts` (createPosition), `src/main/services/expire-csp-position.ts`, `src/main/services/close-csp-position.ts` all exist and reference `instrument_type`.
- ✓ ASSIGN→STOCK / option legs PUT/CALL split is consistent with the enum values.
- ✓ `option_type` no longer appears in any service SQL (only in migration 001/003 history and `migrate.test.ts`).

## Drift (0)

(none material)

## Unverifiable (1)

- ? Consequences claim the rename "can" use `ALTER TABLE … RENAME COLUMN (≥ 3.25.0)" but the CHECK must be rebuilt. The actual migration uses the full table-rebuild idiom only (no `RENAME COLUMN`). This is presented as background/rationale, not a claim that the migration uses RENAME COLUMN, so it reads as narrative — flag for human review only if precision matters.

## Missing files (0)

- ✓ `../../features/us-6-record-assignment.md` exists.
- ✓ `../../.extracts/us-6.md` referenced (extracts dir is a working dir).

One-line: Audited instrument-type-rename.md: 8 verified, 0 drift, 1 unverifiable, 0 missing.
