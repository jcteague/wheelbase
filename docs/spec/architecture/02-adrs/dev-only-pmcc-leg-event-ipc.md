# ADR: A dev-only `_test:pmcc-record-leg-event` channel drives post-entry PMCC events in e2e

<!-- generated:from us-103 -->

## Decision

- `src/main/ipc/test-pmcc-ledger.ts` registers `_test:pmcc-record-leg-event` under the existing `NODE_ENV === 'test'` gate in `src/main/index.ts`, next to `registerTestIvHistoryIpc(db)`.
- **What the handler does:** it runs inside `handleIpcCall`, Zod-parses the payload, then inserts the leg rows and calls `appendPmccSnapshot` inside **one** `db.transaction`. It returns `{ ok: true, ledger, snapshot }`.
- Preload exposes the channel as `window.api.testPmccRecordLegEvent`.
- **It does no lifecycle validation.** It is a fixture writer, not a feature.
- **Failure injection uses SQL.** The storage-failure scenario does not use a flag on the seam. It installs a `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)` trigger on the temp DB through the `sqlite3` CLI, the same technique as [storage-failure-e2e-via-sqlite-trigger](./storage-failure-e2e-via-sqlite-trigger.md).

## Context / Why

- **Most scenarios need events that cannot be created yet.** Eleven of the thirteen scenarios need an expiration, a subsequent short, a short roll or a LEAPS roll. No production write path for those exists before US-104/105/115/119.
- **Seeding snapshots directly would prove nothing.** If the e2e inserted snapshots by SQL, the chain scenarios would be tautological. The seam runs the real writer, the real read path and the real drawer.
- **It stays out of packaged builds.** The `_test:` prefix and the `NODE_ENV` gate follow [dev-only-test-scheduler-ipc](./dev-only-test-scheduler-ipc.md).
- **Why the trigger instead of `chmod`:** the planned `chmod 0o444` still returned `{ ok: true }`. The main process already holds the SQLite file descriptors open read-write, so a later permission change cannot fail a write. The abort trigger is also the stronger test. The leg row inserts first and the snapshot write then aborts, so `legs === 2` and `snapshots === 1` afterwards prove the transaction rolled back.

## Alternatives considered

- **Direct `sqlite3` inserts from the spec.** Rejected: fine for legs, but tautological for snapshots.
- **Wait for the consumer stories.** Rejected: it leaves the acceptance criteria unverified at e2e.
- **Call services from `app.evaluate` with `require`.** Rejected: the bundle does not expose services.
- **`chmod` for failure injection.** Tried and rejected.

## Consequences

- The seam's payload schema reuses `PmccTriggerEvent`, so the e2e cannot invent a trigger name the production writer does not accept.

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
