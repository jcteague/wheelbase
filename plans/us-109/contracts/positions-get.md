# Contract: positions:get

## Purpose

Returns one position with its legs, snapshots and PMCC-derived fields; US-109 adds the PMCC
leg timeline.

## Request

```typescript
{
  positionId: string
}
```

Unchanged.

## Response (success)

```typescript
// GetPositionResult in src/main/schemas.ts — existing fields unchanged, one added
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

## Error codes

| field      | code        | message              |
| ---------- | ----------- | -------------------- |
| `__root__` | `not_found` | `Position not found` |

No story-specific validation errors; only the existing envelope error applies.

## Source

- Handler: `src/main/ipc/positions.ts`
- Service: `src/main/services/get-position.ts`, `src/main/services/pmcc-timeline.ts`
