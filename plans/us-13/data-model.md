# US-13 Data Model

## Entities Modified

### RollCspInput (lifecycle engine)

US-12 defines:

```typescript
interface RollCspInput {
  currentPhase: WheelPhase
  currentExpiration: string
  newExpiration: string
  costToClosePerContract: string
  newPremiumPerContract: string
}
```

US-13 extends to:

```typescript
interface RollCspInput {
  currentPhase: WheelPhase
  currentStrike: string // NEW
  newStrike: string // NEW
  currentExpiration: string
  newExpiration: string
  costToClosePerContract: string
  newPremiumPerContract: string
}
```

### Validation Rules (lifecycle engine)

US-12 rules (unchanged):

- `currentPhase` must be `CSP_OPEN`
- `costToClosePerContract` must be positive
- `newPremiumPerContract` must be positive

US-13 changes:

- **Remove:** `newExpiration > currentExpiration` (unconditional)
- **Add:** If `newStrike === currentStrike` AND `newExpiration === currentExpiration` → reject ("Roll must change the expiration, strike, or both")
- **Add:** If `newExpiration < currentExpiration` → reject ("New expiration must be after the current expiration") — same-expiration is allowed, earlier is not
- **Add:** `newStrike` must be positive

### RollCspPayloadSchema (no change)

US-12 already defines `newStrike: z.number().positive().optional()`. No schema change needed.

### Roll Count Query (new)

No new table or column. Count derived from existing `legs` table:

```sql
SELECT COUNT(*) AS roll_count
FROM legs
WHERE position_id = ? AND leg_role = 'ROLL_TO'
```

This count is added to the position detail response (or fetched separately).

## State Transitions

No new state transitions. Position remains in `CSP_OPEN` after any roll type.

## Roll Type Derivation (pure function, renderer-side)

| currentStrike vs newStrike | currentExpiration vs newExpiration | Label                       |
| -------------------------- | ---------------------------------- | --------------------------- |
| same                       | later                              | Roll Out                    |
| lower                      | later                              | Roll Down & Out             |
| higher                     | later                              | Roll Up & Out               |
| lower                      | same                               | Roll Down                   |
| higher                     | same                               | Roll Up                     |
| same                       | same                               | REJECTED (validation error) |
| any                        | earlier                            | REJECTED (validation error) |
