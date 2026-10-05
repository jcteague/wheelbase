# Quickstart: US-103 — PMCC cost basis

## Setup

```bash
pnpm install
pnpm rebuild:node        # system Node ABI for Vitest
```

No migration, environment variable, credential or seed data is needed. `makeTestDb()` runs the
existing migrations in memory.

## Unit + integration (Vitest)

```bash
pnpm test                                                        # everything
pnpm test src/main/core/costbasis.test.ts                        # calculatePmccLedger worked examples (every AC number)
pnpm test src/main/core/costbasis.property.test.ts               # ledger properties
pnpm test src/main/services/roll-chains.test.ts                  # groupRollChains (wheel + inverted LEAPS pair)
pnpm test src/main/services/assign-csp-position.test.ts          # unchanged waterfall after the extraction
pnpm test src/main/services/pmcc-ledger.test.ts                  # buildPmccContributions, currentLongStrike, appendPmccSnapshot, rollback
pnpm test src/main/services/pmcc-cost-basis-chain.test.ts        # the five-snapshot chain
pnpm test src/main/services/create-pmcc-position.test.ts         # still 23.0000 / 200.0000 and 23.0200 / 199.0000 through the shared writer
pnpm test src/main/services/get-position.test.ts                 # pmccLedger on detail; null for a wheel
pnpm test src/main/services/list-positions.test.ts               # pmcc.basisPerShare / basisTotal; wheel rows unchanged
pnpm test src/main/ipc/test-pmcc-ledger.test.ts                  # the _test: seam (registered only under NODE_ENV=test)
pnpm test src/renderer/src/lib/format.test.ts                    # fmtPct1
pnpm test src/renderer/src/components/position-cockpit/PmccCostBasis.spec.tsx
pnpm test src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx
pnpm test src/renderer/src/components/PmccPositionRow.test.tsx
pnpm test src/renderer/src/lib/position-list-items.test.ts
```

Passing criteria: all green, no `.skip`, and `pnpm lint && pnpm typecheck && pnpm format` clean.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron    # Electron ABI — required after any `pnpm test`
pnpm test:e2e e2e/pmcc-cost-basis.spec.ts
pnpm test:e2e            # open-pmcc-position.spec.ts and position-cockpit.spec.ts must still pass
```

The spec launches through `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })` so the
`_test:pmcc-record-leg-event` channel is registered, opens the XYZ PMCC through
`window.api.createPmccPosition`, and lands later events through `window.api.testPmccRecordLegEvent`
(fixtures in `e2e/pmcc-ledger-helpers.ts`, dates relative to the run day). Per-scenario knobs:

| Scenario                              | How                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening legs only                     | create, reload, open detail                                                                                                                                                                           |
| Expiration / subsequent short / rolls | one `testPmccRecordLegEvent` call per event, then reload                                                                                                                                              |
| Negative basis                        | full chain plus the `CYCLES` fixture                                                                                                                                                                  |
| Three contracts / fees                | `createPmccPosition` payload variants                                                                                                                                                                 |
| Failed leg event                      | install an abort trigger on `cost_basis_snapshots` (via the `sqlite3` CLI) before the `testPmccRecordLegEvent` call; drop it afterwards. `chmod` does not work — the app holds the DB open read-write |
| Snapshot chain                        | `window.api.getPosition(id)` → `allSnapshots`                                                                                                                                                         |
| Wheel regression                      | `openPosition` + `AssignmentSheet` path from `e2e/helpers.ts` (`reachHoldingSharesState`)                                                                                                             |

Symptoms of the wrong ABI: `NODE_MODULE_VERSION` errors from Vitest, or an e2e hang on
`waiting for event 'window'`.

## Manual check (optional)

```bash
pnpm rebuild:electron && pnpm dev
```

Positions → `Open Wheel` → `PMCC` → record the XYZ legs → open the position. Below the two leg
panels the `Cost basis` drawer is open and reads `$23.00 · $2,300.00 · $25.00 · -$2.00 · $103.00 · 8.0%`.
The list row's last cell reads `$2,300.00` (no `net debit` suffix).
