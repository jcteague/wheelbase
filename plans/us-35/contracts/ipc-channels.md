# IPC Contracts: Assignments Namespace

All renderer-facing assignment operations go through the `assignments:*` namespace. The scheduler itself has no IPC surface — it runs in the main process and invokes handlers directly.

---

## `assignments:list-pending`

```typescript
// no request payload
type Response =
  | {
      ok: true
      assignments: PendingAssignmentNotification[]
    }
  | { ok: false; errors: string[] }

type PendingAssignmentNotification = {
  id: number
  ticker: string
  strike: string // 2dp
  expiration: string // ISO date
  contractType: 'put' | 'call'
  qty: number
  transactionTime: string // ISO-8601
  positionId: number
}
```

Server filters `WHERE status='pending'` and joins to positions + legs for the display fields.

---

## `assignments:confirm`

```typescript
const RequestSchema = z.object({
  pendingAssignmentId: z.number().int().positive()
})

type Response =
  | {
      ok: true
      position: { id: number; phase: 'HOLDING_SHARES'; assignedAt: string }
    }
  | { ok: false; errors: string[]; code: 'NOT_FOUND' | 'NOT_PENDING' | 'TRANSITION_REJECTED' }
```

On success, the renderer invalidates `['positions', 'list']` and `['positions', positionId]` query keys.

---

## `assignments:dismiss`

```typescript
const RequestSchema = z.object({
  pendingAssignmentId: z.number().int().positive()
})

type Response =
  | { ok: true; dismissedAt: string }
  | { ok: false; errors: string[]; code: 'NOT_FOUND' | 'NOT_PENDING' }
```

On success, the renderer invalidates `['assignments', 'pending']`.

---

## `assignments:run-detection-now` (optional, for Settings / dev)

```typescript
// no request payload
type Response =
  | { ok: true; detected: number; skipped: number; durationMs: number }
  | { ok: false; errors: string[] }
```

Calls `scheduler.runNow('detect-assignments')`. Useful for manual debugging or the settings "Refresh now" affordance.

---

## Preload (`src/preload/index.ts`) additions

```typescript
contextBridge.exposeInMainWorld('api', {
  // ...existing market-data, broker
  assignments: {
    listPending: () => ipcRenderer.invoke('assignments:list-pending'),
    confirm: (pendingAssignmentId: number) =>
      ipcRenderer.invoke('assignments:confirm', { pendingAssignmentId }),
    dismiss: (pendingAssignmentId: number) =>
      ipcRenderer.invoke('assignments:dismiss', { pendingAssignmentId }),
    runDetectionNow: () => ipcRenderer.invoke('assignments:run-detection-now')
  }
})
```
