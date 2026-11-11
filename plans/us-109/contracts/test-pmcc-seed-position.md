# Contract: \_test:pmcc-seed-position

## Purpose

Test-only: inserts one PMCC position and its legs exactly as given, so e2e specs can build
timeline states no shipped story can record yet. Registered only when `NODE_ENV === 'test'`.

## Request

```typescript
// TestPmccSeedPositionPayloadSchema in src/main/schemas.ts
z.object({
  ticker: z.string().min(1),
  /** Sets status CLOSED and closed_date; omitted leaves the position ACTIVE. */
  closedDate: IsoDateSchema.nullable().default(null),
  /** Inserted in array order; created_at increases by one millisecond per leg. */
  legs: z.array(TestLegRowSchema).min(1) // the existing leg-event seam's row schema
})
```

No lifecycle, date or US-102 validation runs: the seam exists to create states those rules
reject (a future-dated LEAPS, a short that outlasts the LEAPS, a non-PMCC leg role).

## Response (success)

```typescript
{
  ok: true
  positionId: string
}
```

The position is inserted with `strategy_type = 'PMCC'`, `phase = 'PMCC_OPEN'`,
`opened_date` = the earliest leg `fillDate`. No cost-basis snapshot is written; the timeline
and the Cost basis drawer both recompute from legs.

## Error codes

| field      | code             | message                                |
| ---------- | ---------------- | -------------------------------------- |
| `__root__` | `internal_error` | standard envelope, via `handleIpcCall` |

No story-specific validation errors; a malformed payload surfaces as the standard Zod
validation envelope.

## Source

- Handler: `src/main/ipc/test-pmcc-seed.ts`
- Service: `src/main/services/leg-rows.ts` (`insertLegRow`); the position insert is a private
  helper in the handler file's service, `src/main/services/test-pmcc-seed.ts`
