# ADR: One service file per position-mutation operation
<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

Each position-mutation operation lives in its own file under `src/main/services/`: `close-csp-position.ts`, `expire-csp-position.ts`, `assign-csp-position.ts`, `open-covered-call-position.ts`, `close-covered-call-position.ts`, `expire-cc-position.ts`, `roll-csp-position.ts`. Read-only helpers also get dedicated files: `get-position.ts`, `list-positions.ts`. `src/main/services/positions.ts` re-exports the operations from a single barrel.

Each service is the seam between the IPC handler and the pure engine: it reads the position context (via `getPosition(db, positionId)`), calls the lifecycle and cost-basis engines with the values they need, and writes the resulting leg + snapshot + position update inside a single `db.transaction(() => { ... })()`.

## Context / Why

- The first close-CSP service started as a method on a `positions.ts` god-object; by US-12 the pattern was clear: every mutation gets its own file with its own integration test.
- One-file-per-operation keeps test fixtures focused and lets refactors stay local.
- It also makes it obvious from the file tree which lifecycle operations exist — the directory listing is effectively a state-machine inventory.

## Alternatives considered

- **All operations in one `positions.ts` file** — initial pattern; rejected by US-12 explicitly because the file would grow unboundedly and inflate test setup.
- **Group by phase** (e.g. `csp-operations.ts`, `cc-operations.ts`) — rejected; rolls cross phases; assignment crosses CSP→holding; the boundary is arbitrary.

## Consequences

- The barrel file `src/main/services/positions.ts` re-exports each operation for IPC handlers to import.
- Integration tests live next to each service (`close-csp-position.test.ts`, etc.) and seed required state by calling earlier services (`createPosition → assignCsp → openCoveredCall` is the standard CC_OPEN setup).
- Read-only "context loaders" like `get-position.ts` and `list-positions.ts` share SQL via the `activeLegSubquery()` helper (see ADR [active-leg-resolution](./active-leg-resolution.md)).

## Sources

- [extract: us-4](../../.extracts/us-4.md) — `close-csp-position.ts` and `get-position.ts`
- [extract: us-5](../../.extracts/us-5.md) — `expire-csp-position.ts`
- [extract: us-6](../../.extracts/us-6.md) — `assign-csp-position.ts`
- [extract: us-7](../../.extracts/us-7.md) — `open-covered-call-position.ts`
- [extract: us-8](../../.extracts/us-8.md) — `close-covered-call-position.ts`
- [extract: us-9](../../.extracts/us-9.md) — `expire-cc-position.ts`
- [extract: us-12](../../.extracts/us-12.md) — ADR "Standalone service file per operation"
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
