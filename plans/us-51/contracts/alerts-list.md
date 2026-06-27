# Contract: alerts:list

## Purpose

Returns all open alerts enriched with their position's ticker and phase, sorted
by urgency tier then trigger time, for rendering the dashboard management queue.

## Request

```typescript
// No request payload. Channel invoked with no arguments.
// window.api.alerts.list()  ->  ipcRenderer.invoke('alerts:list')
```

## Response (success)

```typescript
{
  ok: true
  items: ManagementQueueItem[] // sorted: high→medium→low, then triggered_at ASC; [] when no open alerts
}

interface ManagementQueueItem {
  alertId: string
  positionId: string
  ticker: string
  phase: WheelPhase // 'CSP_OPEN' | 'HOLDING_SHARES' | 'CC_OPEN' | ... (existing union)
  urgency: 'high' | 'medium' | 'low'
  summary: string
  quickAction: string
  triggeredAt: string // ISO timestamp
}
```

## Error codes

| field      | code             | message                        |
| ---------- | ---------------- | ------------------------------ |
| `__root__` | `internal_error` | `An unexpected error occurred` |

This is a read-only handler with no request payload and no story-specific
validation. Only the standard envelope error applies: an unexpected failure
(e.g. DB unavailable) is caught by `handleIpcCall` and returned as
`{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }`.

## Source

- Handler: `src/main/ipc/alerts.ts` (`registerAlertsHandlers`, channel `alerts:list`)
- Service: `src/main/services/alerts.ts` (`listManagementQueue`)
- Preload: `src/preload/index.ts` (`api.alerts.list`), typed in `src/preload/index.d.ts`
- Renderer adapter: `src/renderer/src/api/alerts.ts` (`listManagementQueue`)
