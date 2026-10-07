# Quickstart: US-104 — Roll the PMCC short call

## Branch and prerequisites

This story builds on US-103, which is implemented on the `wb-103` worktree (branch `wb-103`, not yet
merged to `main` at the time of planning). Start the US-104 worktree from `wb-103` (or from `main`
once `wb-103` has merged):

```bash
git worktree add ../wb-104 -b wb-104 wb-103     # or: ... main   (after wb-103 merges)
cd ../wb-104 && pnpm install
pnpm rebuild:node                                 # system Node ABI for Vitest
```

Confirm the US-103 surface is present before starting Area 1:

```bash
grep -n "appendPmccSnapshot\|pmccLedgerFromLegs\|currentLongStrike" src/main/services/pmcc-ledger.ts
grep -n "PMCC_SHORT_ROLL" src/main/schemas.ts
ls e2e/pmcc-ledger-helpers.ts src/main/services/test-fixtures/pmcc-legs.ts
```

No migration, environment variable, credential or seed data is needed. `makeTestDb()` runs the
existing migrations in memory.

## Unit + integration (Vitest)

```bash
pnpm test                                                              # everything
pnpm test src/main/core/pmcc-rules.test.ts                             # shortExpiresBeforeLeaps + SHORT_NOT_BEFORE_LONG; pmccCrossLegIssues regression
pnpm test src/main/core/pmcc-rules.property.test.ts                    # comparator iff property
pnpm test src/main/core/lifecycle.test.ts                              # rollPmccShortCall — all eight rules + happy paths
pnpm test src/main/core/lifecycle.property.test.ts                     # phase guard, coverage guard, valid-input property
pnpm test src/main/services/pmcc-ledger.test.ts                        # currentShortCallLeg / currentLeapsLeg / pmccOpenLegs replay
pnpm test src/main/services/get-position.test.ts                       # pmccOpenLegs on detail; null for a wheel
pnpm test src/main/services/roll-pmcc-short-call-position.test.ts      # pair + snapshot, rejections, rollback, roll number
pnpm test src/main/services/pmcc-cost-basis-chain.test.ts              # chain through the real roll service reads 21.8000
pnpm test src/main/ipc/positions.test.ts                               # positions:roll-pmcc-short registration + envelope
pnpm test src/renderer/src/lib/pmcc-roll.test.ts                       # net, label, post-roll effective cost, shortfall
pnpm test src/renderer/src/schemas/roll-pmcc-short-call.test.ts        # form rules and messages
pnpm test src/renderer/src/components/RollPmccShortCallSheet.test.tsx
pnpm test src/renderer/src/components/RollPmccShortCallForm.test.tsx
pnpm test src/renderer/src/components/PmccCoverageRuler.test.tsx
pnpm test src/renderer/src/components/PositionDetailActions.test.tsx
pnpm test src/renderer/src/components/ui/FormButton.test.tsx
pnpm test src/renderer/src/components/position-cockpit/PmccLegReference.spec.tsx
pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx
```

Passing criteria: all green, no `.skip`, and `pnpm lint && pnpm typecheck && pnpm format` clean.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron    # Electron ABI — required after any `pnpm test`
pnpm test:e2e e2e/pmcc-short-call-roll.spec.ts
pnpm test:e2e            # cc-roll.spec.ts, pmcc-cost-basis.spec.ts, open-pmcc-position.spec.ts and position-cockpit.spec.ts must still pass
```

The spec launches through `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })` so US-103's
`_test:pmcc-record-leg-event` channel is registered, opens the XYZ PMCC through
`window.api.createPmccPosition`, lands `EXPIRE_1` and `SHORT_2` through
`window.api.testPmccRecordLegEvent` (the AC Background: $108 short at $1.80, basis $21.20, effective
share cost $101.20), then drives `Roll Short Call →` and the sheet through the UI. Dates are relative
to the run day; expected DTE and month labels are computed in the spec from the same `localDate`
values.

| Scenario                                    | How                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Context, previews, warning, form rejections | open the sheet, fill `#pmcc-roll-*` inputs, read `data-testid="pmcc-roll-*"` elements and `Field` errors |
| Recording                                   | click `pmcc-roll-confirm`; read the banner, `window.api.getPosition(id)`, the `Cost basis` drawer        |
| Bypass (outlasts LEAPS, no open short)      | `window.api.rollPmccShortCall(payload)` → `{ ok: false }`; `tableCount(dbPath, 'legs')` unchanged        |
| No open short call                          | land `EXPIRE_1` only; assert `roll-pmcc-short-btn` is absent, then the bypass call                       |
| Wheel regression                            | `reachCcOpenState` + `roll-cc-btn` → `Roll Covered Call`, no `Effective share cost`, no `LEAPS`          |

Symptoms of the wrong ABI: `NODE_MODULE_VERSION` errors from Vitest, or an e2e hang on
`waiting for event 'window'`.

## Manual check (optional)

```bash
pnpm rebuild:electron && NODE_ENV=test pnpm dev
```

Positions → `Open Wheel` → `PMCC` → record the XYZ legs → open the position → `Roll Short Call →`.
Enter cost to close `3.00`, strike `112`, premium `2.40` and an expiration after the current short
but before the LEAPS: the Net card reads `Net Debit: $0.60 per share ($60.00 total)` with the
`Roll Up & Out` label; `Confirm roll` records the pair, the page shows the `Short-call roll #1 debit`
banner and the `Cost basis` drawer reads `$21.80` / `$2,180.00`.
