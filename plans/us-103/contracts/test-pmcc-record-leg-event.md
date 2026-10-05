# Contract: \_test:pmcc-record-leg-event

## Purpose

Dev-only (`NODE_ENV === 'test'`) fixture writer: inserts the given PMCC leg rows and appends the
US-103 cost-basis snapshot in one transaction, so e2e specs can land post-entry events before the
stories that record them in production exist.

## Request

```typescript
const TestLegRowSchema = z.object({
  legRole: LegRole, // core Zod enum — any of the six PMCC roles or ROLL_FROM / ROLL_TO
  action: LegAction, // 'BUY' | 'SELL' | 'EXPIRE' | 'ASSIGN' | 'EXERCISE'
  strike: z.string(), // 4 dp
  expiration: IsoDateSchema,
  contracts: z.number().int().positive(),
  premiumPerContract: z.string(), // 4 dp; '0.0000' for EXPIRE / ASSIGN
  fillDate: IsoDateSchema,
  fees: z.string().default('0.0000'),
  rollChainId: z.string().nullable().default(null)
})

export const TestPmccLegEventPayloadSchema = z.object({
  positionId: PositionIdSchema,
  triggerEvent: PmccTriggerEvent, // z.enum in schemas.ts
  eventDate: IsoDateSchema, // → snapshot_at = makeSnapshotAt(eventDate)
  legs: z.array(TestLegRowSchema).min(0) // empty is allowed (an expiration recorded elsewhere)
})
```

## Response (success)

```typescript
{ ok: true, ledger: PmccLedgerResult, snapshot: CostBasisSnapshotRecord }
```

## Error codes

| field        | code             | message                                                                                                                                         |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `__root__`   | `not_registered` | (channel absent) — outside `NODE_ENV=test` the renderer gets Electron's "No handler registered" rejection; specs launch with `NODE_ENV: 'test'` |
| `__root__`   | `internal_error` | `An unexpected error occurred` — e.g. the read-only-DB storage-failure scenario; nothing is written                                             |
| any Zod path | Zod issue code   | Zod message (via `handleIpcCall`)                                                                                                               |

The handler is wrapped in `handleIpcCall` like every other channel, so it never throws to the
renderer.

## Source

- Handler: `src/main/ipc/test-pmcc-ledger.ts` (registered from `src/main/index.ts` inside the existing `NODE_ENV === 'test'` block)
- Preload: `src/preload/index.ts` → `testPmccRecordLegEvent(payload)`
- Service: `src/main/services/pmcc-ledger.ts#appendPmccSnapshot`
