# ADR: PMCC display figures are recomputed from legs on the server; snapshots are the audit chain

<!-- generated:from us-103 -->

## Decision

- **The figures on screen are recomputed from the legs on every read.**
  - `getPosition` returns `pmccLedger: PmccLedgerResult | null`. It is `null` for a wheel, or for a PMCC with no long BUY leg.
  - `listPositions` puts `basisPerShare` and `basisTotal` on `PmccListSummary`, typed as `Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'>`. This replaces `initialNetDebit` there.
  - `initialNetDebit` stays on the detail result because `PmccLegReference` still shows it.
- **Snapshots are the audit chain.** They feed US-109's "cost basis after cycle N" and remain the source of the base row's `effectiveCostBasis`. The drawer and the list row never multiply `basis_per_share` back up.
- **The renderer formats only.** The optimistic row (`toPmccListItem` in `position-list-items.ts`) fills the two list fields from the create response, using `costBasisSnapshot.basisPerShare` and `openingDebit.initialNetDebit`. These equal the ledger at entry.

## Context / Why

- US-101's cold review replaced `basis_per_share × 100 × contracts`, because a rounded per-share basis drifts when it is multiplied back up ([shared-pure-pmcc-opening-debit](./shared-pure-pmcc-opening-debit.md)). `Total` would drift the same way: 3 contracts with $0.01 fees per leg gives `6900.0200`.
- Recomputing from fills also keeps the drawer correct after a direct SQL import, or after a consumer story that forgets to write a snapshot.
- This follows [server-side-dte-and-derived-fields](./server-side-dte-and-derived-fields.md): derived money lives in the main process, and the renderer parses nothing but display strings.
- Tests assert that the two sources agree: after every event, the newest snapshot's `basis_per_share` equals the ledger's `basisPerShare`.

## Alternatives considered

- **Read only the latest snapshot.** Rejected: it would need a new column for LEAPS cost to date, and it still cannot show a correct `Total`.
- **Store `basis_total` in a new column.** Rejected: it needs a migration the story says to avoid, and it is still stale after an import.
- **Compute the ledger in the renderer from `detail.legs` by importing the engine.** Rejected: the renderer would need roll-chain grouping, and the list would get nothing.

## Consequences

- Every detail and list read runs the ledger over the position's legs. Legs are read once per position through the shared reader ([shared-roll-chain-helper](./shared-roll-chain-helper.md)).
- The only writer of snapshots is described in [pmcc-snapshot-single-writer-in-caller-transaction](./pmcc-snapshot-single-writer-in-caller-transaction.md).

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
