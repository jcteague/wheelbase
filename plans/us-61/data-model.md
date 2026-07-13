# Data Model: US-61 — Expiring-soon flags

US-61 introduces **no new entities, tables, columns, or IPC types**. It is a
display rule layered on existing renderer data. This document records the
existing types it reads and the derived display predicate it applies.

## Consumed types (unchanged)

### `PositionListItem` — dashboard rows

`src/renderer/src/api/positions.ts`. Fields US-61 reads:

| field        | type             | use in US-61                              |
| ------------ | ---------------- | ----------------------------------------- |
| `ticker`     | `string`         | ticker cell (flag sits beside it)         |
| `phase`      | `WheelPhase`     | unaffected; drives phase badge            |
| `status`     | `WheelStatus`    | only `ACTIVE` rows are candidates         |
| `dte`        | `number \| null` | **the sole flag input** via `isDteUrgent` |
| `expiration` | `string \| null` | context; `null` ⇒ never urgent            |

### `CalendarEntry` — calendar cells & day detail

`src/renderer/src/lib/expiration-calendar.ts`. Every entry already carries
`dte: number | null`. `DayCell.entries: CalendarEntry[]` is available at the cell
level for the grid highlight. `toCalendarEntries` already excludes
`HOLDING_SHARES` (filters `status === 'ACTIVE' && expiration != null`), so
holding-shares positions never reach the calendar.

## Display predicate (existing, reused)

`src/renderer/src/lib/dte.ts`:

```typescript
export const DTE_URGENT_THRESHOLD = 7
export function isDteUrgent(dte: number | null): boolean {
  return dte !== null && dte <= DTE_URGENT_THRESHOLD
}
```

## Derived flag rules

| Surface                  | "expiring soon" when …                         |
| ------------------------ | ---------------------------------------------- |
| Dashboard row            | `isDteUrgent(item.dte)`                        |
| Calendar month-grid cell | `cell.entries.some((e) => isDteUrgent(e.dte))` |
| Calendar day-detail card | `isDteUrgent(entry.dte)`                       |

### Boundary behaviour (from ACs)

- `dte === 7` ⇒ flagged (`<=` is inclusive).
- `dte === 8` ⇒ **not** flagged (NVDA case).
- `dte === null` (no active option expiration, e.g. `HOLDING_SHARES` TSLA) ⇒
  **not** flagged on the dashboard, and absent from the calendar entirely.

## New component (view-only)

`ExpiringSoonFlag` — a presentational gold pill with no props beyond an optional
`compact` sizing flag. No data model; renders the literal label "Expiring soon"
and exposes `data-testid="expiring-soon-flag"`.

## State transitions

None. The flag is a pure function of the current server-computed DTE; it has no
persisted state, no dismissal, and no lifecycle.
