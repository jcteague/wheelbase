# ADR: Storage-failure e2e uses a SQLite `BEFORE INSERT … RAISE(ABORT)` trigger

<!-- generated:from us-101 -->

## Decision

The "Recover from a failed save without a partial position" e2e scenario installs a `BEFORE INSERT … RAISE(ABORT)` trigger on `cost_basis_snapshots` to make the save fail. It replaces the research plan's `chmod 0o444` of the database file (plus `-wal` / `-shm`).

## Context / Why

- **`chmod` does not work:** an already-open SQLite connection ignores later changes to the file's permissions, so writes kept succeeding.
- **The trigger fails the transaction's _last_ write.** `createPmccPosition` inserts the position, then both legs, then the snapshot. Aborting the snapshot insert means the position and legs have already been written inside the transaction when it fails. A passing assertion of "no position, no standalone leg" therefore proves the rollback actually happened. A failure on the first write would pass even with no transaction at all.

## Alternatives considered

- **`chmod 0o444` on the DB files.** Superseded: it does not fail writes on an open connection.
- **A `_test:fail-next-write` IPC handler.** Rejected: it leaks test control into the service.
- **Drop the `legs` table through a test IPC.** Rejected: it fails an early write, so it would not prove the rollback.

## Consequences

- The spec needs no production code change; the failure is injected entirely in SQL.
- The same technique works for any future "all-or-nothing" transaction test: put the trigger on whichever table the transaction writes last.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
