# Data Model: Frontend Performance & Reuse Improvements

This story is a pure frontend refactoring — no new entities, database changes, or API endpoints. The data model is unchanged.

## Affected Type Exports

No type changes. Existing types in `src/renderer/src/api/positions.ts` remain as-is:
- `WheelPhase` — used by the new `PHASE_LABEL` / `PHASE_LABEL_SHORT` exports in `lib/phase.ts`
- `PositionListItem` — consumed by `PositionRow` (hover refactor)
- `PositionDetail` — consumed by `PositionDetailPage` (component extraction)

## New Exports (constants/utilities only)

### `lib/tokens.ts`
- `MONO: string` — monospace font-family constant

### `lib/format.ts`
- `fmtMoney(value: string): string` — `"180.0000"` → `"$180.00"`
- `fmtPct(n: number): string` — `-15` → `"-15%"`, `30` → `"30%"`
- `fmtDate(iso: string): string` — `"2026-04-17"` → `"Apr 17"`
- `pnlColor(value: string): string` — returns CSS variable name based on sign
- `computeDte(expiration: string): number` — days to expiration from today

### `lib/phase.ts` (updated)
- `PHASE_LABEL: Record<WheelPhase, string>` — descriptive labels (new)
- `PHASE_LABEL_SHORT: Record<WheelPhase, string>` — compact labels for tables (new)
- `PHASE_COLOR: Record<WheelPhase, string>` — already exists, unchanged
