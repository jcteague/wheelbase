# Contract: alerts:list

## Purpose

Return every open alert, enriched with its position's ticker and phase and (new in US-107)
its rule code, sorted for the management queue.

## Request

```typescript
// No payload.
window.api.alerts.list()
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
    ruleCode: RuleCode // NEW (US-107) — e.g. 'PMCC_LEAPS_ROLL_WINDOW'; a.rule_code
    urgency: 'high' | 'medium' | 'low'
    summary: string
    quickAction: string
    triggeredAt: string
  }>
}
// Ordering unchanged: urgency high → medium → low, then triggered_at ASC.
```

`ruleCode` is additive; existing consumers ignore it. The renderer uses it only to pick
the PMCC badge's leg label (`PMCC · LEAPS` vs `PMCC · short call`).

## Error codes

| field      | code             | message                                                                       |
| ---------- | ---------------- | ----------------------------------------------------------------------------- |
| `__root__` | `internal_error` | Standard `handleIpcCall` envelope only — no story-specific validation errors. |

## Source

- Handler: `src/main/ipc/alerts.ts` (unchanged)
- Service: `src/main/services/alerts.ts` — `listManagementQueue`, `mapQueueRow`, `QueueRow`
- Types: `src/main/schemas.ts` `ManagementQueueItem`; `src/preload/index.d.ts` `ManagementQueueItem`
