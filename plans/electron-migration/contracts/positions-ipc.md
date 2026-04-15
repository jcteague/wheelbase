# IPC Contracts: Positions

All communication between renderer and main process uses `ipcRenderer.invoke` / `ipcMain.handle`.
The renderer calls `window.api.*` (exposed via `contextBridge`).

---

## window.api.listPositions()

**Channel:** `positions:list`

**Input:** none

**Returns:** `PositionListItem[]` — sorted by DTE ascending, null DTE last

```ts
interface PositionListItem {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string // decimal string e.g. "185.0000"
  expiration: string // ISO date string
  dte: number | null
  premiumCollected: string // decimal string
  effectiveCostBasis: string // decimal string
}
```

---

## window.api.createPosition(payload)

**Channel:** `positions:create`

**Input:**

```ts
interface CreatePositionPayload {
  ticker: string
  strike: number
  expiration: string // ISO date
  contracts: number
  premiumPerContract: number
  fillDate?: string // ISO date, optional
  accountId?: string
  thesis?: string
  notes?: string
}
```

**Returns on success:** `CreatePositionResult`

```ts
interface CreatePositionResult {
  ok: true
  position: PositionRecord
  leg: LegRecord
  costBasisSnapshot: CostBasisSnapshotRecord
}
```

**Returns on validation error:**

```ts
interface CreatePositionError {
  ok: false
  errors: Array<{
    field: string
    code: string
    message: string
  }>
}
```

**Returns on unexpected error:**

```ts
interface CreatePositionError {
  ok: false
  errors: [{ field: '__root__'; code: 'internal_error'; message: string }]
}
```

---

## Error Handling Pattern

IPC handlers never throw to the renderer — they always return a discriminated union `{ ok: true, ... } | { ok: false, errors: [...] }`. This avoids unhandled IPC rejections and gives the renderer a consistent shape to check.

```ts
// src/main/ipc/positions.ts
ipcMain.handle('positions:create', async (_, payload) => {
  try {
    const result = await createPosition(db, payload)
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, errors: formatZodErrors(err) }
    }
    logger.error({ err }, 'unhandled_error')
    return {
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    }
  }
})
```

---

## TypeScript Types for Renderer

Expose types in `src/preload/index.ts` and declare `window.api` in `src/renderer/env.d.ts`:

```ts
// src/renderer/env.d.ts
interface Window {
  api: {
    listPositions: () => Promise<PositionListItem[]>
    createPosition: (
      payload: CreatePositionPayload
    ) => Promise<CreatePositionResult | CreatePositionError>
  }
}
```
