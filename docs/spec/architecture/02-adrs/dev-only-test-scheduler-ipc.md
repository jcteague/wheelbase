# ADR: Dev-only IPC channels for driving the PollingScheduler in e2e

<!-- generated:from us-35 -->

## Decision

`src/main/ipc/test-scheduler.ts` registers four IPC channels — `_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake` — guarded by `NODE_ENV === 'test'`. Test fixtures can also be seeded from the `WHEELBASE_TEST_JOBS` env var via `seedTestJobsFromEnv`.

## Why

E2E specs need to introspect the registry (which jobs are registered? how many invocations?) and trigger out-of-band runs without waiting for real cadence. Exposing those affordances via the regular `window.api` namespace would pollute the production IPC surface. The `_test:` prefix + `NODE_ENV` gate keeps them invisible in packaged builds.

The `simulate-wake` channel is intentionally a no-op against the current setTimeout-chain scheduler — it exists so the e2e suite can assert the "no missed-tick burst after sleep" property by observing that invocations do not increase. If the implementation ever switches to absolute fire-at timestamps with catch-up, this stub becomes a real wake-up trigger.

## Alternatives considered

- **Expose scheduler internals directly to renderer tests** — breaks process boundary; tests should drive the system through IPC just like real users.
- **Single `_test:` namespace shared across all dev surfaces** — fine in principle but unnecessary right now; the four scheduler channels are cohesive.

## Source

- `plans/us-35/refactor-phase-area8-results.md`
- Feature page: `../../features/us-46-polling-scheduler.md`
- Contracts: `../../contracts/ipc-handlers.md`
<!-- /generated -->
