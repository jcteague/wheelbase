# Contract: alerts:list (additive)

## Purpose

Returns the open management-queue rows; this story adds the rule code to each row so a position card can map it to a lane.

## Request

```typescript
// no payload
```

## Response (success)

```typescript
{
  ok: true
  items: Array<{
    alertId: string
    positionId: string
    ticker: string
    phase: WheelPhase
    ruleCode: RuleCode // NEW — 'EXPIRATION_IMMINENT' | 'MANAGEMENT_WINDOW' | 'PROFIT_TARGET' | 'STRIKE_PROXIMITY' | 'EARNINGS_PROXIMITY' | 'COVERED_CALL_BREACH' | 'PMCC_ASSIGNMENT_RISK' (+ future codes)
    urgency: 'high' | 'medium' | 'low'
    summary: string
    quickAction: string
    triggeredAt: string
  }>
}
```

Ordering unchanged: urgency rank, then `triggered_at ASC`.

## Error codes

| field      | code             | message                                              |
| ---------- | ---------------- | ---------------------------------------------------- |
| `__root__` | `internal_error` | standard envelope only; no story-specific validation |

## Source

- Handler: `src/main/ipc/alerts.ts` (unchanged)
- Service: `src/main/services/alerts.ts` — `listManagementQueue`, `mapQueueRow`
- Type: `src/main/schemas.ts` — `ManagementQueueItem`
