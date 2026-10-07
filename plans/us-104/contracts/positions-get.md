# Contract: positions:get (US-104 delta)

## Purpose

The detail read gains the PMCC's **open legs**, derived in the service by replaying the position's
legs, so the header action, the roll sheet and the leg reference read the same answer to "which
LEAPS and which short call are open now".

## Request

Unchanged: `{ positionId: string }`.

## Response (success)

```typescript
{
  ok: true,
  position: PositionRecord,
  activeLeg: LegRecord | null,            // still null for a PMCC — activeLegSubquery is wheel-only
  costBasisSnapshot: CostBasisSnapshotRecord | null,
  legs: LegRecord[],
  allSnapshots: CostBasisSnapshotRecord[],
  initialNetDebit: string | null,         // US-101
  pmccLedger: PmccLedgerResult | null,    // US-103
  pmccOpenLegs: PmccOpenLegs | null       // US-104 — null for a wheel or a PMCC with no LEAPS leg
}

// src/main/services/pmcc-ledger.ts
type PmccOpenLegs = {
  long: LegRecord                         // newest long-side BUY: LEAPS_OPEN or a LEAPS roll's ROLL_TO
  short: LegRecord | null                 // SHORT_CALL_OPEN or a short roll's ROLL_TO, unless a later
                                          // SHORT_CALL_EXPIRED / SHORT_CALL_CLOSE / SHORT_CALL_ASSIGNED closed it
}
```

After the AC's roll, `pmccOpenLegs.short` is the `ROLL_TO` ($112 · 2026-12-18 · premium 2.4000) and
`pmccOpenLegs.long` is still the `LEAPS_OPEN` ($80 · 2027-09-17).

## Error codes

Only the standard envelope applies: `__root__` / `not_found` / `Position not found`.

## Source

- Handler: `src/main/ipc/positions.ts` (unchanged)
- Service: `src/main/services/get-position.ts` (adds `pmccOpenLegs: isPmcc ? pmccOpenLegs(legs) : null`)
- Selectors: `src/main/services/pmcc-ledger.ts#currentLeapsLeg`, `#currentShortCallLeg`, `#pmccOpenLegs`
