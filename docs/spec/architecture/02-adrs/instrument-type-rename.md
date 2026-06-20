# ADR: `InstrumentType` enum replaces `OptionType` and adds `STOCK`

<!-- generated:from us-6 -->

## Decision

The `OptionType` Zod enum / TypeScript type is renamed to `InstrumentType` and extended from `PUT | CALL` to `PUT | CALL | STOCK`. The `legs.option_type` column is renamed to `legs.instrument_type` and its CHECK constraint expanded to `instrument_type IN ('PUT', 'CALL', 'STOCK')`. This is the only DB migration in the Phase 1 wheel scope: `migrations/003_rename_option_type_to_instrument_type.sql`.

ASSIGN legs use `instrument_type = 'STOCK'`; option legs continue to use `PUT` (CSPs) or `CALL` (CCs and PMCC short calls).

## Context / Why

- US-6 needs to record stock delivery on assignment as a leg row. The existing `legs` table is the right home for this event (preserves history and the one-table-per-event invariant), but `option_type` is the wrong column name for a column that now also describes equity holdings.
- `InstrumentType` is standard financial terminology covering options (PUT, CALL) and equities (STOCK) under one enum.
- Future PMCC support still uses CALL for both the long LEAPS and the short call — no further enum values needed for that strategy.

## Alternatives considered

- **`PositionType`** — rejected; conflicts with the existing `positions` table and `strategy_type` field.
- **Leave `OptionType` and add `STOCK` to it** — explicitly flagged as semantically wrong: an enum named `OptionType` should not contain a value that isn't an option.
- **Separate nullable `stockFlag` boolean** — over-complicated; a discriminated enum is cleaner.

## Consequences

- DB migration `003_rename_option_type_to_instrument_type.sql` performs the rename. SQLite can rename the column with `ALTER TABLE legs RENAME COLUMN option_type TO instrument_type;` (≥ 3.25.0), but the CHECK constraint must be rebuilt via the SQLite table-rebuild idiom (create `legs_new`, copy, drop old, rename).
- All service SQL INSERTs for legs use `instrument_type` (was `option_type`): `services/positions.ts` (createPosition), `services/close-csp-position.ts`, `services/expire-csp-position.ts`.
- `services/get-position.ts` SELECT alias updates from `option_type as optionType` to `instrument_type as instrumentType`.
- `LegRecord` Zod schema renames the field `optionType: OptionType` to `instrumentType: InstrumentType`.
- After the migration, `better-sqlite3` must be rebuilt for both Electron and system Node (project convention).

## Sources

- [extract: us-6](../../.extracts/us-6.md) — ADR "Rename `OptionType` -> `InstrumentType` and add `STOCK`"
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
<!-- /generated -->
