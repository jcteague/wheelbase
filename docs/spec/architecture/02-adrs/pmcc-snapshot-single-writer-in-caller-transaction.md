# ADR: `appendPmccSnapshot` is the one writer, called inside the caller's transaction

<!-- generated:from us-103 -->

## Decision

`src/main/services/pmcc-ledger.ts` exports `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now }) → { ledger, snapshot }`. It is the only code that writes a PMCC `cost_basis_snapshots` row.

- **What it does:**
  1. Reads every leg of the position through the shared `readLegs`.
  2. Builds contributions and runs `calculatePmccLedger`.
  3. Inserts one snapshot with these columns:
     - `basis_per_share = ledger.basisPerShare`
     - `total_premium_collected = ledger.shortCreditsTotal`
     - `final_pnl = NULL`
     - `snapshot_at = makeSnapshotAt(eventDate)`
     - `created_at = now`
  4. Returns the ledger and the snapshot.
- **It opens no transaction.** A consumer inserts its leg(s) and calls the writer inside its own `db.transaction(...)`, so a throw anywhere rolls back the leg and the snapshot together.
- **It is generic over the trigger event.** `snapshot` narrows to `CostBasisSnapshotRecord & { triggerEvent: T; finalPnl: null }`.
- It throws `PMCC position <id> has no LEAPS leg` when the ledger is `null`. That guard exists to type `ledger` as non-null and is not test-driven.
- **`createPmccPosition` now calls it** with `triggerEvent: 'PMCC_OPEN'` and `eventDate: long.fillDate`, after it inserts its two legs. The row written is the same as before ([pmcc-opening-snapshot-ledger-convention](./pmcc-opening-snapshot-ledger-convention.md)). Its local basis, premium and `snapshot_at` arithmetic and its inline INSERT are gone. `openingDebit` is still computed for the response and the INFO log.

## Context / Why

- The story requires the recalculation to run "inside the same service-layer SQLite transaction as the leg event that triggered it, so a failed event leaves neither a leg nor a snapshot."
- With a single writer, US-104/105/115/119 cannot restate the formula or the column mapping. They pass a `PmccTriggerEvent` and nothing else.
- better-sqlite3 is synchronous and uses one connection, so re-reading legs inside the transaction sees the leg that was just inserted.

## Alternatives considered

- **Pass the new leg(s) in memory and merge them with the prior ledger.** Rejected: two code paths for the same number.
- **Let the writer own the transaction.** Rejected: it nests a savepoint the consumer did not ask for and hides the atomicity contract.

## Consequences

- Snapshots stay append-only ([append-only-cost-basis-snapshots](./append-only-cost-basis-snapshots.md)) and are now the audit chain, not what the screen displays ([pmcc-ledger-recomputed-from-legs](./pmcc-ledger-recomputed-from-legs.md)).
- The writer logs INFO `pmcc_basis_recalculated` and DEBUG `pmcc_snapshot_insert`.
- The e2e seam calls this same writer ([dev-only-pmcc-leg-event-ipc](./dev-only-pmcc-leg-event-ipc.md)).

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
