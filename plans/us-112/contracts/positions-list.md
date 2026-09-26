# Contract: positions:list (amended)

## Purpose

Returns every position as a dashboard list item; this story adds the underlying's
freshness-assessed IV rank to each item so the PMCC card can render it without a second call.

## Request

```typescript
// No payload. Unchanged.
```

## Response (success)

```typescript
// Array<PositionListItem> — every existing field unchanged, plus:
{
  // …
  ivRank: {
    value: string            // e.g. '62' (US-121: string | null)
    observedAt: string       // ISO instant the reading was taken
    ageTradingDays: number   // completed sessions since observation
    state: 'fresh' | 'aging' | 'stale' | 'expired' | 'predates_earnings'
  } | null                   // null → never collected, unreadable, or the IVR read failed
}
```

`ivRank` is present on **every** item (wheel and PMCC). It is joined once per distinct ticker from
`getAssessedIvrByUnderlying` with `now`, the cached trading calendar and the store-only last-print
map; the wheel card ignores it until US-88.

## Error codes

| field      | code             | message                                                                                                                                                                           |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__root__` | `internal_error` | Only the standard envelope applies; the handler is unchanged. The IVR join never throws — a failed read yields `ivRank: null` on every item and logs `positions_ivr_read_failed`. |

## Push event (existing, consumer added)

`ivr:snapshot-updated` `{ ticker }` — already emitted after an on-demand collection (US-100).
`useIvrSnapshotUpdates` now also invalidates `['positions']`, and `PositionsListPage` mounts the
hook, so a reading that lands out of band refreshes the card.

## Source

- Handler: `src/main/ipc/positions.ts` (`positions:list`, unchanged)
- Service: `src/main/services/list-positions.ts` (`listPositions`, `readIvrOrEmpty`)
- Service: `src/main/services/earnings-dates.ts` (`readLastEarningsFromStore`, new export)
- Service: `src/main/services/ivr-snapshots.ts` (`getAssessedIvrByUnderlying`, reused)
- Types: `src/main/schemas.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`
