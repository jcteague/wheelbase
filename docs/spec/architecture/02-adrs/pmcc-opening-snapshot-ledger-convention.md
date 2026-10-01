# ADR: The PMCC opening snapshot is written in US-103's ledger convention

<!-- generated:from us-101 -->

## Decision

`createPmccPosition` writes exactly one `cost_basis_snapshots` row in the same transaction as the position and both legs:

- `trigger_event = 'PMCC_OPEN'`
- `basis_per_share = initialNetDebit / (contracts × 100)`, with fees included, rounded to 4 dp. The fee example gives `23.0200`.
- `total_premium_collected = shortCredit − shortFees`, in dollars. This is `200.0000` for the base example and `199.0000` with $1 of short-leg fees.
- `snapshot_at = makeSnapshotAt(long.fillDate)`
- `final_pnl = NULL`

**The list and detail surfaces do not derive the initial net debit from `basis_per_share`.** The plan had `initialNetDebit = basis_per_share × 100 × contracts`. A cold review replaced it because a rounded per-share basis multiplied back up drifts. Both surfaces now recompute the debit from the two legs' fills and fees through `calculatePmccOpeningDebit` (see [shared-pure-pmcc-opening-debit](./shared-pure-pmcc-opening-debit.md)). `effectiveCostBasis` on the list item still reads the snapshot's per-share basis.

## Context / Why

- US-103's running formula has to reproduce $2,302.00 for the fee example without adding fees a second time. It also defines `total_premium_collected` as short credits after fees.
- Writing the opening row in that convention now means US-103 extends an existing chain rather than migrating one.

## Alternatives considered

- **Store the total debit in `basis_per_share`.** Rejected: that is the wrong unit.
- **Write no opening snapshot.** Rejected: US-103's first history row would not exist.

## Consequences

- The snapshot is append-only like every other one ([append-only-cost-basis-snapshots](./append-only-cost-basis-snapshots.md)).
- **Open question:** if US-103's planning changes the unit of `total_premium_collected`, the one insert in `createPmccPosition` is the only place to adjust.
- `createPmccPosition` returns the persisted `snapshotAt`. (The wheel's `createPosition` still returns `now` while persisting the fill-date value; that is tracked as tech debt.)

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
