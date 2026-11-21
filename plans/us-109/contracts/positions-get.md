# Contract: positions:get

## Purpose

Returns one position with its legs, snapshots and PMCC-derived fields; US-109 adds the PMCC
leg timeline.

## Request

```typescript
// GetPositionPayloadSchema in src/main/schemas.ts
{
  positionId: string // a UUID
}
```

The handler parses it with `GetPositionPayloadSchema` inside `handleIpcCall`, like its sibling
handlers, and makes one service call, `getPositionDetail`.

## Response (success)

```typescript
// PositionDetailResult in src/main/schemas.ts: GetPositionResult (unchanged) + pmccTimeline
{
  ok: true
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: CostBasisSnapshotRecord | null
  legs: LegRecord[]
  allSnapshots: CostBasisSnapshotRecord[]
  initialNetDebit: string | null
  pmccLedger: PmccLedgerResult | null
  pmccOpenLegs: PmccOpenLegs | null
  /** PMCC only: the two-track leg timeline folded from every leg as of the Eastern day of the
   *  request; null for a wheel or a PMCC with no LEAPS leg. */
  pmccTimeline: PmccTimeline | null // src/main/core/pmcc-timeline.ts, see data-model.md § 2
}
```

The valuation date is `etDateOf(getCurrentDate())`, where `getCurrentDate` is the clock passed
to `registerPositionsHandlers` (the wall clock in production, `WHEELBASE_FAKE_NOW` in e2e).

Only this read folds the timeline. `getPosition`, which the write services (the PMCC roll
context, the wheel services) load a position with, returns `GetPositionResult` with no
`pmccTimeline` and takes no valuation date; `getPositionDetail(db, positionId,
{ valuationDate })` composes it with the timeline.

## Error codes

| field        | code             | message                         |
| ------------ | ---------------- | ------------------------------- |
| `__root__`   | `not_found`      | `Position not found`            |
| `positionId` | `invalid_format` | Zod's message for a non-UUID id |
| `__root__`   | `internal_error` | `An unexpected error occurred`  |

`not_found` is a `ValidationError` thrown by `getPositionDetail`; `handleIpcCall` turns it into
the same `{ ok: false, errors: [...] }` envelope the handler always returned, so the renderer's
`getPosition` adapter (which throws `ApiError(404)` on any `ok: false`) is unchanged. Any other
throw is an `internal_error` envelope rather than a rejected invoke.

## Source

- Handler: `src/main/ipc/positions.ts`
- Service: `getPositionDetail` in `src/main/services/get-position.ts`,
  `src/main/services/pmcc-timeline.ts`
