# Quickstart: US-105 — Roll the PMCC LEAPS

## Branch and prerequisites

This story builds on US-103 (implemented on the `wb-103` worktree) **and** on US-104 (planned in
`plans/us-104/`, to be implemented on `wb-104`). Start the US-105 worktree from whichever of those is
furthest along, in this order of preference:

```bash
git worktree add ../wb-105 -b wb-105 wb-104     # after US-104 lands (preferred)
# git worktree add ../wb-105 -b wb-105 wb-103   # if US-105 is picked up before US-104 — see the ★ areas in plan.md
# git worktree add ../wb-105 -b wb-105 main     # after both have merged
cd ../wb-105 && pnpm install
pnpm rebuild:node                                 # system Node ABI for Vitest
```

Confirm the US-103 surface is present before starting Area 1:

```bash
grep -n "appendPmccSnapshot\|pmccLedgerFromLegs\|currentLongStrike" src/main/services/pmcc-ledger.ts
grep -n "PMCC_LEAPS_ROLL" src/main/schemas.ts
grep -n "LEAPS_ROLL" src/main/services/test-fixtures/pmcc-legs.ts e2e/pmcc-ledger-helpers.ts
```

Confirm the US-104 surface this plan consumes (each line should hit; any miss means the matching ★
area in `plan.md` builds it under US-104's name instead of importing it):

```bash
grep -n "shortExpiresBeforeLeaps\|SHORT_NOT_BEFORE_LONG" src/main/core/pmcc-rules.ts
grep -n "pmccOpenLegs\|currentShortCallLeg\|currentLeapsLeg" src/main/services/pmcc-ledger.ts
grep -n "pmccOpenLegs" src/main/schemas.ts
grep -n "pmccRollNet\|pmccRollLabel\|pmccPostRollEffectiveCost\|pmccStrikeShortfall" src/renderer/src/lib/pmcc-roll.ts
ls src/renderer/src/components/PmccCoverageRuler.tsx src/renderer/src/components/RollPmccShortCallSheet.tsx
grep -n "disabled:opacity-40" src/renderer/src/components/ui/FormButton.tsx
grep -n "hasOpenShortCall\|pmccRollRecorded" src/renderer/src/components/PositionDetailActions.tsx src/renderer/src/pages/usePositionDetailSheets.ts
```

No migration, environment variable, credential or seed data is needed. `makeTestDb()` runs the
existing migrations in memory.

## Unit + integration (Vitest)

```bash
pnpm test                                                              # everything
pnpm test src/main/core/pmcc-rules.test.ts                             # shortStrikeAboveLeaps, LONG_NOT_AFTER_SHORT, strike message; pmccCrossLegIssues regression
pnpm test src/main/core/pmcc-rules.property.test.ts                    # strike predicate iff property
pnpm test src/main/core/lifecycle.test.ts                              # rollPmccLeaps — all seven rules, no-short skip, happy paths
pnpm test src/main/core/lifecycle.property.test.ts                     # phase guard, coverage guard, strike guard, no-short invariant
pnpm test src/main/services/roll-pmcc-leaps-position.test.ts           # inverted pair + snapshot, rejections, rollback, roll number
pnpm test src/main/services/pmcc-cost-basis-chain.test.ts              # chain through the real roll service reads 19.3000
pnpm test src/main/schemas.pmcc.test.ts                                # RollPmccLeapsPayloadSchema + result type-level checks
pnpm test src/main/ipc/positions.test.ts                               # positions:roll-pmcc-leaps registration + envelope
pnpm test src/renderer/src/lib/pmcc-roll.test.ts                       # received/paid net, 'MMM yyyy' label, Roll In, coverage change
pnpm test src/renderer/src/schemas/roll-pmcc-leaps.test.ts             # form rules and messages, null-short skips
pnpm test src/renderer/src/components/RollPmccLeapsSheet.test.tsx
pnpm test src/renderer/src/components/RollPmccLeapsForm.test.tsx
pnpm test src/renderer/src/components/PmccCoverageRuler.test.tsx       # marks-based ruler (US-104's cases re-expressed + the LEAPS marks)
pnpm test src/renderer/src/components/RollPmccShortCallForm.test.tsx   # US-104 regression after the ruler / helper generalization
pnpm test src/renderer/src/components/PositionDetailActions.test.tsx
pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx
```

Passing criteria: all green, no `.skip`, and `pnpm lint && pnpm typecheck && pnpm format` clean.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron    # Electron ABI — required after any `pnpm test`
pnpm test:e2e e2e/pmcc-leaps-roll.spec.ts
pnpm test:e2e            # pmcc-short-call-roll.spec.ts, pmcc-cost-basis.spec.ts, cc-roll.spec.ts, open-pmcc-position.spec.ts, position-cockpit.spec.ts must still pass
```

The spec launches through `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })` so US-103's
`_test:pmcc-record-leg-event` channel is registered, opens the XYZ PMCC through
`window.api.createPmccPosition`, lands `EXPIRE_1`, `SHORT_2` and `SHORT_ROLL` through
`window.api.testPmccRecordLegEvent` (the AC Background: open $112 short sold at $2.40, LEAPS bought at
$25.00, basis $21.80, effective share cost $101.80), then drives `Roll LEAPS →` and the sheet through
the UI. Dates are relative to the run day; expected DTE, month labels and the "N days shorter" figure
are computed in the spec from the same `localDate` values.

| Scenario                                           | How                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Context, previews, warning, advisory, form rejects | open the sheet, fill `#pmcc-leaps-roll-*` inputs, read `data-testid="pmcc-leaps-roll-*"` elements and `Field` errors      |
| Recording                                          | click `pmcc-leaps-roll-confirm`; read the banner, `window.api.getPosition(id)`, the `Cost basis` drawer                   |
| Bypass (uncovers the short)                        | `window.api.rollPmccLeaps(payload)` → `{ ok: false }`; `tableCount(dbPath, 'legs')` unchanged                             |
| No short call open                                 | land `EXPIRE_2` after the Background; the sheet reads `No short call open`; the roll records at `$19.30`                  |
| Wheel regression                                   | `reachCcOpenState` + no `roll-pmcc-leaps-btn`; `roll-cc-btn` → `Roll Covered Call`, no `LEAPS`, no `Effective share cost` |

Symptoms of the wrong ABI: `NODE_MODULE_VERSION` errors from Vitest, or an e2e hang on
`waiting for event 'window'`.

## Manual check (optional)

```bash
pnpm rebuild:electron && NODE_ENV=test pnpm dev
```

Positions → `Open Wheel` → `PMCC` → record the XYZ legs → open the position → `Roll LEAPS →`. Enter
proceeds `26.00`, strike `85`, debit `23.50` and an expiration after the short call: the Net card reads
`Net Credit: $2.50 per share ($250.00 total)` with the `Roll Up & Out` label; `Effective share cost
after roll` reads the new strike plus the post-roll basis; `Confirm roll` records the pair, the page
shows the `LEAPS roll #1 credit` banner and the `Cost basis` drawer's `LEAPS cost to date` drops by
$2.50.
