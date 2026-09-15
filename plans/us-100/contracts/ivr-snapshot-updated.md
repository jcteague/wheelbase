# Contract: ivr:snapshot-updated (push event, new)

## Purpose

Tell the renderer that an on-demand IVR collection persisted a row for a ticker, so the bench and
screener re-read their snapshot instead of waiting for a window focus.

## Request

```typescript
// none — one-way main → renderer message via webContents.send
```

## Response (success)

```typescript
// Payload delivered to window.api.ivr.onSnapshotUpdated(cb)
type IvrSnapshotUpdatedEvent = { ticker: string } // upper-cased
```

Emitted only for a `'persisted'` outcome (never for `not_available` or a failure), and only from
the on-demand path — the nightly batch does not emit per ticker.

## Error codes

| field | code | message                        |
| ----- | ---- | ------------------------------ |
| —     | —    | Push events carry no envelope. |

## Renderer behaviour

`useIvrSnapshotUpdates()` (`src/renderer/src/hooks/useIvrSnapshotUpdates.ts`), mounted in
`WatchlistPage`, invalidates `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` on every
event and unsubscribes on unmount.

## Source

- Emitter: `src/main/index.ts` — `createIvrOnDemand({ onCollected: (ticker) => mainWindow?.webContents.send('ivr:snapshot-updated', { ticker }) })`
- Preload: `src/preload/index.ts` (`ivr.onSnapshotUpdated: onIpcEvent('ivr:snapshot-updated')`), `src/preload/index.d.ts`
- Hook: `src/renderer/src/hooks/useIvrSnapshotUpdates.ts`
