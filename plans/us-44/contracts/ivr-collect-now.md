# Contract: `ivr:collect-now`

## Purpose

Allow the renderer to trigger the shared IVR collection job immediately from Settings without duplicating collection logic in the renderer.

## Channel

- IPC request channel: `ivr:collect-now`
- Registration file: `src/main/ipc/ivr.ts`
- Preload exposure: `window.api.ivr.collectNow()`

## Request

Payload: none

```ts
ipcRenderer.invoke('ivr:collect-now')
```

The main handler should not accept renderer-supplied tickers or timing overrides. Target selection remains in the main-process collector.

## Response Envelope

The handler must use `handleIpcCall(...)` and return the standard IPC envelope:

```ts
type IpcCollectIVRNowResult =
  | {
      ok: true
      batch: {
        successCount: number
        errorCount: number
        skippedCount: number
        skippedReason: 'market_closed' | null
      }
    }
  | {
      ok: false
      errors: Array<{ field: string; code: string; message: string }>
      code?: string
    }
```

## Main-Process Responsibilities

1. Call `scheduler.runNow('ivr-collect')`.
2. Ensure the registered `ivr-collect` job handler returns the batch summary from `collectIVRSnapshots(...)`.
3. Return that batch summary to the renderer unchanged.

This mirrors the existing assignment-detection pattern, but unlike `assignments:run-detection-now`, this channel must return the collector summary because `US-44` requires the renderer to see success and error counts.

## Schema Additions

Add a result schema/type pair in `src/main/schemas.ts` for the batch summary:

```ts
export const CollectIvrNowBatchSchema = z.object({
  successCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  skippedReason: z.enum(['market_closed']).nullable()
})
```

No request schema is required because the channel takes no payload.

## Renderer Adapter Shape

Renderer API helper in `src/renderer/src/api/ivr.ts` should normalize the envelope to:

```ts
export type CollectIvrNowResult = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_closed' | null
}
```

The helper should throw the existing `ApiError` shape on `{ ok: false }`, matching the project's current renderer API pattern.
