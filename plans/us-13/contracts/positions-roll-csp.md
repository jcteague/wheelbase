# IPC Contract: `positions:roll-csp` (US-13 Changes)

US-12 establishes this channel. US-13 changes the lifecycle validation but the IPC contract is unchanged.

## Request Payload

```typescript
// RollCspPayloadSchema (src/main/schemas.ts) — NO CHANGE from US-12
{
  positionId: string          // UUID
  costToClosePerContract: number  // > 0
  newPremiumPerContract: number   // > 0
  newExpiration: string           // ISO date, must be >= currentExpiration (not strictly >)
  newStrike?: number              // > 0, defaults to current strike
  fillDate?: string               // ISO date, defaults to today
}
```

## Response (success)

```typescript
// RollCspResult — NO CHANGE from US-12
{
  ok: true
  position: { id, ticker, phase: 'CSP_OPEN', status: 'ACTIVE' }
  rollFromLeg: LegRecord      // action: BUY, strike: currentStrike
  rollToLeg: LegRecord        // action: SELL, strike: newStrike
  rollChainId: string          // shared UUID linking both legs
  costBasisSnapshot: CostBasisSnapshotRecord
}
```

## Response (validation errors — US-13 changes)

New error cases added by US-13:

| Field           | Code                  | Message                                             | When                                                                |
| --------------- | --------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| `__root__`      | `no_change`           | Roll must change the expiration, strike, or both    | `newStrike == currentStrike AND newExpiration == currentExpiration` |
| `newExpiration` | `must_not_be_earlier` | New expiration must be after the current expiration | `newExpiration < currentExpiration`                                 |

US-12 error cases (unchanged):
| Field | Code | Message |
|---|---|---|
| `__phase__` | `invalid_phase` | Position is not in CSP_OPEN phase |
| `costToClosePerContract` | `must_be_positive` | Cost to close must be greater than zero |
| `newPremiumPerContract` | `must_be_positive` | New premium must be greater than zero |

## Roll Count (new endpoint or extension)

Roll count is needed by the renderer. Two options:

**Option A (preferred):** Add `rollCount` to the `positions:get` response. The service already queries all legs — count `ROLL_TO` legs from the existing data.

**Option B:** New `positions:roll-count` IPC channel. Unnecessary complexity.

Decision: Option A — extend `GetPositionResult` to include `rollCount: number`.
