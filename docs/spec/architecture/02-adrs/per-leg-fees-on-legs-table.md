# ADR: Per-leg fees live on the leg (`legs.fees`)

<!-- generated:from us-101 -->

## Decision

Migration `017_add_leg_fees.sql` adds `legs.fees TEXT NOT NULL DEFAULT '0.0000'`: total fees for the leg, in dollars, 4 dp, never negative. `LegRecord` (and `IpcLegRecord` / renderer `LegDetail`) carries `fees` as a 4-dp string.

Wheel legs keep the default. Every existing wheel service's `LegRecord` literal now sets `fees: '0.0000'` explicitly, because the wheel never writes fees. No other table changes: `positions.strategy_type` and `cost_basis_snapshots.trigger_event` already existed.

## Context / Why

- US-103 needs each fee counted once and attached to its own leg. US-119 records fees on the buyback.
- A fees field on the snapshot would lose that per-leg attribution.

## Alternatives considered

- **Fold fees into `premium_per_contract`.** Rejected: it hides the fee in the fill price and breaks "actual fill" as recorded.
- **A separate `leg_fees` table.** Rejected as overkill for one number.

## Consequences

- Every existing leg reads `'0.0000'` with no data migration.
- Money stays 4-dp TEXT, per [decimal-money-math](./decimal-money-math.md).
- The opening snapshot and debit math read fees from the legs. See [pmcc-opening-snapshot-ledger-convention](./pmcc-opening-snapshot-ledger-convention.md) and [shared-pure-pmcc-opening-debit](./shared-pure-pmcc-opening-debit.md).

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
