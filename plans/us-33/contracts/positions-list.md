# IPC Contract: `positions:list` (extension)

This story extends the existing `positions:list` response. No new channel; only the
`PositionListItem` shape gains four fields, and the SQL `SELECT` adds three more
columns (already-joined active leg gives all of them with one extra column on the
existing JOIN).

---

## Existing fields (unchanged)

```ts
type PositionListItem = {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null
  expiration: string | null
  dte: number | null
  premiumCollected: string
  effectiveCostBasis: string
}
```

## New fields (added by this story)

```ts
type PositionListItem = {
  // ... existing fields
  instrumentType: 'PUT' | 'CALL' | null // active leg's instrument_type, or null
  contracts: number | null // active leg's contracts, or null
  entryPremiumPerContract: string | null // active leg's premium_per_contract, or null
  profitTargetPercent: number | null // positions.profit_target_percent (nullable)
}
```

## Sourcing

- `instrumentType`, `contracts`, `entryPremiumPerContract` are already discoverable
  from the active-leg subquery used in `LIST_QUERY` (`src/main/services/list-positions.ts`).
  The active leg is currently joined via `activeLegSubquery()`. Extend the SELECT to
  also pull `l.instrument_type`, `l.contracts`, `l.premium_per_contract`.

- `profitTargetPercent` is the position's own column, added by migration
  `005_add_profit_target_percent.sql`.

## Null semantics

| Field                     | Null when                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| `instrumentType`          | No active option leg (HOLDING_SHARES, WHEEL_COMPLETE, all closed phases)         |
| `contracts`               | Same as above                                                                    |
| `entryPremiumPerContract` | Same as above                                                                    |
| `profitTargetPercent`     | Position has no override; renderer falls back to `DEFAULT_PROFIT_TARGET_PERCENT` |

## Backward compatibility

The renderer must remain robust to all four fields being null (existing positions
created before migration 005 will have `profit_target_percent IS NULL`, which is the
intended "use the default" signal).

The renderer's existing tests that mock `usePositions()` must be updated to include
the four new fields (defaulting `instrumentType: null` etc.) so type checking passes.

---

## No payload changes

The request remains parameterless: `window.api.listPositions()` returns the new shape.

---

## Logging

No additional logging beyond the existing `list_positions_query_complete` and
`positions_listed` events.
