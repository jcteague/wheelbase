# Contract: alerts:dismiss

## Purpose

Dismisses an open alert: transitions it to `status = 'dismissed'` with a
`dismissed_at` timestamp, removing it from the open management queue while
retaining the row as an audit record. The condition is suppressed from
re-opening until a future evaluation run observes it as genuinely cleared.

## Request

```typescript
z.object({
  alertId: z.string().min(1)
})
```

## Response (success)

```typescript
{
  ok: true
  alert: {
    id: string
    positionId: string
    ruleCode: string
    urgency: 'high' | 'medium' | 'low'
    summary: string
    quickAction: string
    status: 'dismissed'
    triggeredAt: string
    lastEvaluatedAt: string
    resolvedAt: string | null
    dismissedAt: string
    createdAt: string
    updatedAt: string
  }
}
```

## Error codes

| field      | code             | message                             |
| ---------- | ---------------- | ----------------------------------- |
| `__root__` | `NOT_FOUND`      | `Alert {alertId} not found`         |
| `__root__` | `NOT_OPEN`       | `Only open alerts can be dismissed` |
| `__root__` | `internal_error` | `An unexpected error occurred`      |

`NOT_OPEN` covers dismissing an alert that is currently `resolved` or already
`dismissed` — the AC does not distinguish between those two prior states in its
rejection message.

## Source

- Handler: `src/main/ipc/alerts.ts` (`registerAlertsHandlers`)
- Service: `src/main/services/alerts.ts` (`dismissAlert`, `AlertError`)
