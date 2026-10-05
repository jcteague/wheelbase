# US-103: Calculate and display PMCC cost basis

<!-- generated:from us-103 -->

## Summary

A PMCC position now has a running cost basis. The basis is a cash ledger over every leg the
position has recorded. It starts at the LEAPS debit, short-call credits lower it, roll nets raise or
lower it, and fees count once, in the leg that incurred them:

```text
basisTotal    = Σ LONG cash + Σ SHORT cash        (paid out = +, received = −, fees added)
basisPerShare = basisTotal / (leapsContracts × 100)
```

Three pieces carry it:

- **A pure engine.** `calculatePmccLedger` folds signed per-share contributions into the six
  figures the trader sees.
- **One snapshot writer.** `appendPmccSnapshot` appends one `cost_basis_snapshots` row per PMCC leg
  event. It runs inside the caller's transaction, so a failed event leaves neither a leg nor a
  snapshot.
- **Two read surfaces.**
  - The PMCC detail page gains a `Cost basis` drawer with six cells, below the leg reference.
  - The PMCC list row shows the running total in place of the US-101 `net debit`.

The trader sees this behaviour today:

- **The drawer is open by default.** Its six cells are `Cost basis / share`, `Total`, `LEAPS cost
to date`, `Short-call credits to date`, `Effective share cost` and `Premium recovered`. For the
  opening fixture they read `$23.00 / $2,300.00 / $25.00 / -$2.00 / $103.00 / 8.0%`.
- **An open short-call credit is cash, not profit.** The credits cell shows its contribution to
  basis (`-$2.00`), with no green colour. The drawer has no profit, realized, max-profit, breakeven,
  annualized-return or share-count wording.
- **A worthless expiration does not move the basis.** It still writes a snapshot.
- **A roll contributes one net amount.** A short roll that buys back at $3.00 and sells at $2.40
  adds $0.60. A LEAPS roll that sells at $26.00 and buys at $23.50 subtracts $2.50.
- **`Effective share cost` re-anchors on the current LEAPS.** It is the newest long-side BUY leg's
  strike plus the basis per share. A LEAPS roll changes it through the strike only, with no
  strike-delta term in the basis.
- **The basis can go negative.** Credits that exceed the LEAPS cost show `-$0.40`, never `$0.00`.
- **The basis is per share of contract.** Three contracts give the same `$23.00` per share and a
  `$6,900.00` total.
- **The drawer caption reads `US-103 · cash ledger, never a quote`.** It carries the story ID
  because the Linear story asks for it.

A classic wheel is unchanged: its detail page still shows `Cost basis & history`, and its list row
and services are untouched.

**No migration.** The story adds the four reserved PMCC leg roles and the PMCC trigger-event
vocabulary to the shared enums. It writes none of the post-entry leg events in production; those
belong to US-104, US-105, US-111, US-115 and US-119. E2e lands them through a new dev-only
`_test:pmcc-record-leg-event` channel.

Story: Linear OPT-9 / US-103, 5 points. Layout of record:
`mockups/epic-09-pmcc-position-detail.mdx` (the `Cost basis` drawer and the `healthy`,
`rs-recorded` and `rl-recorded` presets).

## Acceptance criteria

Scenario names come from Linear OPT-9. `e2e/pmcc-cost-basis.spec.ts` has one named `it` per
scenario, and all 13 pass. The fixture is XYZ, 1 contract, $0 fees:

- Opening legs: LEAPS $80 call bought at $25.00 (368 DTE); short $110 call sold at $2.00 (32 DTE).
- Later events: `EXPIRE_1` (the short expires), `SHORT_2` (sell $108 at $1.80), `SHORT_ROLL` (buy
  $108 at $3.00, sell $112 at $2.40), `LEAPS_ROLL` (sell $80 at $26.00, buy $85 at $23.50),
  `CYCLES` (sell $118 at $19.70).

1. **Cost basis after the two opening legs.** The `Cost basis` drawer is open below the `Buy LEAPS
call` section and reads `$23.00`, `$2,300.00`, `$25.00`, `-$2.00`, `$103.00`, `8.0%`. It shows
   no `Max profit`, `Breakeven` or `Annualized`.
2. **The open short-call credit is cash in the ledger, not profit.** `Short-call credits to date`
   reads `-$2.00`. The page shows no `profit` or `realized` wording, no `Effective Basis / Share`
   and no `Shares`.
3. **A short call that expires worthless does not move cost basis.** After `EXPIRE_1` the drawer
   still reads `$23.00` / `$2,300.00`. There are two snapshots, and the last is
   `PMCC_SHORT_EXPIRED` at `23.0000`.
4. **A subsequent short call lowers cost basis.** `$21.20`, `$2,120.00`, credits `-$3.80`,
   effective share cost `$101.20`.
5. **A short-call roll contributes one net amount, not two gross amounts.** `$21.80`,
   `$2,180.00`. Exactly one new snapshot, `PMCC_SHORT_ROLL` at `21.8000`, `0.6000` above the
   previous one.
6. **A LEAPS roll applies its net cash and re-anchors the effective share cost.** `$19.30`,
   `$1,930.00`, LEAPS cost `$22.50`, effective share cost `$104.30` (not `$99.30` or `$109.30`).
7. **Credits that exceed the LEAPS cost give a negative basis.** `-$0.40`, `-$40.00`, `101.8%`;
   not `$0.00`.
8. **Cost basis is per share of contract regardless of quantity.** With 3 contracts: `$23.00`,
   `$6,900.00`.
9. **Fees are counted once, in the leg that incurred them.** With a $1.00 fee on each leg:
   `$23.02`, `$2,302.00` (not `$23.04`, not `$23.00`).
10. **The audit chain records one snapshot per leg event.** Five rows with triggers `PMCC_OPEN`,
    `PMCC_SHORT_EXPIRED`, `PMCC_SHORT_OPEN`, `PMCC_SHORT_ROLL`, `PMCC_LEAPS_ROLL`; bases `23.0000`,
    `23.0000`, `21.2000`, `21.8000`, `19.3000`; `snapshotAt` ascending.
11. **A failed leg event leaves no cost-basis change.** With an abort trigger on
    `cost_basis_snapshots`, recording `SHORT_2` returns `{ ok: false }`. After a reload the drawer
    reads `$23.00`, and there are still 2 legs and 1 snapshot.
12. **The positions list shows the running cost basis.** After `EXPIRE_1`, `SHORT_2` and
    `SHORT_ROLL`, the XYZ row contains `$2,180.00` and neither `$2,300.00` nor `net debit`.
13. **Leave a classic wheel unaffected.** A wheel assigned at a $46.50 basis (strike 48.50,
    premium 2.00) shows `Cost basis & history` and `$46.50`, and neither `Cost basis / share` nor
    `Effective share cost`.

## What was built

### Engine

`calculatePmccLedger` lives in `src/main/core/costbasis.ts` beside the wheel functions and imports
only `decimal.js`. It never sees legs. Its input is `leapsContracts`, `longStrike` and a list of
`PmccContribution`s, each with a `side` (`LONG` or `SHORT`), a signed `cashPerShare`, `contracts`
and dollar `fees`. The fold is in dollars and divides once:

```text
contributionTotal       = cashPerShare × contracts × 100 + fees
leapsCostTotal          = Σ LONG contributionTotal
shortCreditsTotal       = −Σ SHORT contributionTotal          (net credit is positive)
basisTotal              = leapsCostTotal − shortCreditsTotal
*PerShare               = *Total / (leapsContracts × 100)
effectiveShareCost      = longStrike + basisPerShare          (null without a strike)
premiumRecoveredPercent = shortCreditsTotal / leapsCostTotal × 100   (null when leapsCostTotal ≤ 0)
```

Every field is rounded once to 4 dp, `ROUND_HALF_UP`. Dividing by the LEAPS contracts prorates
partial short coverage (US-115): one short against three LEAPS gives `basisPerShare 24.3333`. A
`leapsContracts` below 1 or not an integer throws; callers validate. The property file checks an
oracle fold, the basis identity, order independence, scale invariance and the null guards, using a
new `pmccContribution` arbitrary.

### Ledger service

`src/main/services/pmcc-ledger.ts` turns legs into contributions and owns the snapshot write.

- **Side comes from the leg role, sign from the action.** `PMCC_LEG_SIDE` maps every PMCC role
  to a side: the `LEAPS_*` roles are `LONG` and the `SHORT_CALL_*` roles are `SHORT`. A `BUY` adds
  the premium, a `SELL` subtracts it, and `EXPIRE` / `ASSIGN` / `EXERCISE` contribute zero cash.
  A leg whose role is not a PMCC role is left out with a WARN.
- **A roll chain is one contribution.** Its cash is `Σ BUY − Σ SELL`, its fees are the sum of both
  halves, and its contracts are the `ROLL_TO`'s. It is `LONG` when its `ROLL_FROM` sells (closing
  the LEAPS), otherwise `SHORT`.
- **`currentLongStrike` and `leapsContracts` read the newest long-side BUY leg.** That leg is
  `LEAPS_OPEN` at entry and the `ROLL_TO` of the latest LEAPS roll afterwards. A short roll's BUY
  half never counts. Without such a leg, `pmccLedgerFromLegs` returns `null`.
- **`appendPmccSnapshot` is the one writer.** It re-reads the position's legs, builds the ledger and
  inserts one snapshot row. It opens no transaction of its own: a consumer inserts its leg(s) and
  calls it inside `db.transaction(...)`. It is generic over the trigger event, so the caller gets a
  snapshot typed with the trigger it passed. It throws when the position has no LEAPS leg.

`createPmccPosition` now writes its opening snapshot through `appendPmccSnapshot` with
`PMCC_OPEN` and the LEAPS fill date. The row is the same as before; the service's own basis
arithmetic and inline INSERT are gone.

### Shared helpers

- **`groupRollChains`** (`src/main/services/roll-chains.ts`) replaces the private
  `groupRollsByChain` in `assignCspPosition`. It nets each chain by action (`Σ SELL − Σ BUY`), which
  equals the wheel's `ROLL_TO − ROLL_FROM` and is also correct for the inverted LEAPS roll. Chains
  missing a half are dropped. The wheel's assignment waterfall is unchanged.
- **`readLegs` and `readLegsByPosition`** (`src/main/services/leg-rows.ts`) are the one legs reader.
  The batch form runs a single `IN (...)` query. `readPmccOpeningLegs` and its row type are deleted.
- **`pmccOpeningLegs` and `pmccInitialNetDebit`** (`src/main/services/pmcc-opening-legs.ts`) are now
  pure over `LegRecord[]`. `getPosition` and `listPositions` read legs once and derive the opening
  summary, the initial net debit and the ledger from the same rows.

### Read path

The detail and list figures are recomputed from the legs on every read. They are not the latest
snapshot multiplied back up, because a rounded per-share basis drifts when it is (three contracts
with $0.01 fees per leg give `6900.0200`). Snapshots are the audit chain.

- **`positions:get`** gains `pmccLedger: PmccLedgerResult | null`, `null` for a wheel or a PMCC
  with no LEAPS leg. `initialNetDebit` stays, because `PmccLegReference` still shows it.
- **`positions:list`** replaces `PmccListSummary.initialNetDebit` with `basisPerShare` and
  `basisTotal`, picked from `PmccLedgerResult`. A PMCC with no ledger is dropped with a WARN. A PMCC
  whose leg `fill_price` is missing is now listed, because the ledger reads `premiumPerContract`.
- **The optimistic list row** (`toPmccListItem`) fills the two fields from the create response.
  At entry they equal the ledger.

### Renderer

- **`PmccCostBasis`** is a `CollapsedDrawer` titled `Cost basis`, with a caption and one
  `StatGrid` of six cells in mockup order. `Cost basis / share` uses `text-wb-sky`; no other cell is
  coloured.
- **`PositionCockpit`** stacks `PmccLegReference` then `PmccCostBasis` in its PMCC branch, and
  renders the drawer only when `pmccLedger` is non-null. The wheel's `CostBasisDrawer` is untouched.
- **Cell formatting.**
  - Money goes through `fmtMoney` / `fmtMoneyGrouped`, so a negative value renders with an ASCII
    hyphen (`-$0.40`), not the Gherkin's Unicode minus.
  - `Short-call credits to date` shows the negated per-share credit.
  - `Premium recovered` uses the new `fmtPct1` (one decimal, half-up).
  - `Effective share cost` and `Premium recovered` show `—` when null.
  - The strike is not named inside the `Effective share cost` cell.
- **`PmccPositionRow`** shows `fmtMoneyGrouped(basisTotal)` in its last cell, with no ` net debit`
  suffix.

Green made two deliberate departures from the mockup: the mockup's `OwnerNote` became the
production `Caption`, and the green credits colour was dropped because the story rules it out.

### Enum vocabulary

- **`LegRole`** gains `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE` and
  `SHORT_CALL_ASSIGNED`. `PmccLegRole` and `isPmccLegRole` derive from one const list, so the type
  and the runtime set cannot drift.
- **`PmccTriggerEvent`** is a new Zod enum in `schemas.ts`: `PMCC_OPEN`, `PMCC_SHORT_OPEN`,
  `PMCC_SHORT_EXPIRED`, `PMCC_SHORT_CLOSED`, `PMCC_SHORT_ROLL`, `PMCC_LEAPS_ROLL`. `TriggerEvent` is
  the eight wheel values plus these six, a strict superset of what it was before.
- No `LEG_ROLE_LABEL` text is added for the new roles, and the `PHASE_*` maps are untouched.
  `PMCC_CLOSED` and an assignment trigger are left to US-111 / US-120.

### Test seam

`_test:pmcc-record-leg-event` is registered only when `NODE_ENV === 'test'`, beside the other
`_test:` channels. Its handler inserts the given legs and calls `appendPmccSnapshot` inside one
transaction. It performs no lifecycle validation: it is a fixture writer, not a feature. Preload
exposes it as `window.api.testPmccRecordLegEvent`.

The storage-failure scenario installs a `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)`
trigger through the `sqlite3` CLI. The leg row inserts first and the snapshot write then aborts, so
`legs === 2` and `snapshots === 1` prove the rollback. The planned `chmod 0o444` could not fail a
write, because the main process already holds the file open read-write.

`src/main/services/test-fixtures/pmcc-legs.ts` holds the shared unit fixtures (`pmccFixtures`,
`makePmccLeg`, `insertLegs`, anchored on `FIXED_DAY` 2026-09-14). `e2e/pmcc-ledger-helpers.ts`
mirrors them with `localDate(n)` offsets, because `createPmccPosition` validates against the run day.

### Logging

- INFO `pmcc_basis_recalculated` with the trigger and the new basis, from `appendPmccSnapshot`.
- DEBUG `pmcc_ledger_contributions`, `pmcc_roll_chains` and `pmcc_snapshot_insert`.
- WARN `pmcc_ledger_unknown_leg_role` and `pmcc_list_summary_incomplete`.
- Nothing in `core/`.

### Recorded limitation: list leg summaries are not roll-aware

`pmccOpeningLegs` keeps US-101's later-rows-win rule: it picks the last `LEAPS_OPEN` and the last
`SHORT_CALL_OPEN` row and never consults roll or expiry legs. A newer `SHORT_CALL_OPEN` therefore
does replace the opening short. After a roll or an expiry, though, the list row's `pmcc.long` /
`pmcc.short` still show the last `*_OPEN` leg. The cost-basis fields on the same row are correct.
Making the summaries roll-aware is deferred to US-104 / US-105, which write those events in
production.

### Deliberate limits

- No phase changes: `appendPmccSnapshot` accepts a PMCC position in any phase. Phase guards belong
  to the consumer stories' lifecycle functions.
- No basis clamping anywhere.
- Out of scope per Linear: rendering the snapshot history (US-109), recording leg events in
  production (US-104/105/111/115/119), live or unrealized P&L, max profit, breakeven, annualized
  return, the "LEAPS fully paid for" state, final P&L on close, alerts, tax lots and editing fills.
- The US-101 e2e still asserts `'$2,300.00 net debit'` on the list row
  (`e2e/open-pmcc-position.spec.ts`). That assertion is stale since this story; whether to rename
  the `it` or amend OPT-7 is a story-owner decision.

## Architecture decisions

New in this story:

- [pure-pmcc-ledger-engine](../architecture/02-adrs/pure-pmcc-ledger-engine.md) — one pure
  `calculatePmccLedger` over signed per-share contributions, folded in dollars; the engine never
  sees legs, roles or strikes beyond `longStrike`.
- [pmcc-snapshot-single-writer-in-caller-transaction](../architecture/02-adrs/pmcc-snapshot-single-writer-in-caller-transaction.md)
  — `appendPmccSnapshot` is the only PMCC snapshot writer and runs inside the consumer's
  transaction.
- [pmcc-contributions-by-role-and-action](../architecture/02-adrs/pmcc-contributions-by-role-and-action.md)
  — side from the leg role through an exhaustive map, sign from the action; a roll chain is one
  contribution.
- [shared-roll-chain-helper](../architecture/02-adrs/shared-roll-chain-helper.md) —
  `groupRollChains` nets by action and is shared by the wheel assignment and the PMCC ledger.
- [pmcc-effective-share-cost-anchors-on-newest-long-buy](../architecture/02-adrs/pmcc-effective-share-cost-anchors-on-newest-long-buy.md)
  — the current LEAPS strike is the newest long-side BUY leg, so a LEAPS roll re-anchors it.
- [pmcc-ledger-recomputed-from-legs](../architecture/02-adrs/pmcc-ledger-recomputed-from-legs.md)
  — detail and list figures come from the legs on every read; snapshots are the audit chain.
- [dev-only-pmcc-leg-event-ipc](../architecture/02-adrs/dev-only-pmcc-leg-event-ipc.md) —
  `_test:pmcc-record-leg-event` drives post-entry events in e2e through the real writer.

Existing decisions this story builds on:

- [append-only-cost-basis-snapshots](../architecture/02-adrs/append-only-cost-basis-snapshots.md)
  — one new row per leg event, never an update.
- [pmcc-opening-snapshot-ledger-convention](../architecture/02-adrs/pmcc-opening-snapshot-ledger-convention.md)
  — US-101's opening row already used the units this ledger defines.
- [pmcc-phase-and-leg-role-names](../architecture/02-adrs/pmcc-phase-and-leg-role-names.md) — the
  four reserved roles now enter `LegRole`.
- [rolls-as-linked-leg-pairs](../architecture/02-adrs/rolls-as-linked-leg-pairs.md) — the
  `ROLL_FROM` / `ROLL_TO` pair is what `groupRollChains` nets.
- [storage-failure-e2e-via-sqlite-trigger](../architecture/02-adrs/storage-failure-e2e-via-sqlite-trigger.md)
  — reused for the failed-leg-event scenario.
- [dev-only-test-scheduler-ipc](../architecture/02-adrs/dev-only-test-scheduler-ipc.md) — the
  `_test:` + `NODE_ENV` gate the new channel follows.
- [server-side-dte-and-derived-fields](../architecture/02-adrs/server-side-dte-and-derived-fields.md)
  — derived money lives in the main process; the renderer only formats.

Smaller decisions recorded here rather than as ADRs:

- **Type design.** Derived types are used only where they buy an invariant: `PmccLegRole` from a
  const list, `PMCC_LEG_SIDE` as an exhaustive record, `PmccListSummary` picking from
  `PmccLedgerResult`, and the trigger-generic writer result. Engine types and `RollChain` stay
  plain.
- **`PmccCostBasis` is its own drawer**, selected on strategy in `PositionCockpit`, rather than a
  branch inside the wheel's `Cost basis & history` drawer, which the story forbids.

See [domain/cost-basis](../domain/cost-basis.md) for the ledger in context with the wheel formulas.

## Contracts touched

- **`positions:get`.** The result gains `pmccLedger: PmccLedgerResult | null` with eight 4-dp
  string fields: `basisPerShare` (may be negative), `basisTotal`, `leapsCostPerShare`,
  `leapsCostTotal`, `shortCreditsPerShare`, `shortCreditsTotal` (positive = net credit),
  `effectiveShareCost` (nullable) and `premiumRecoveredPercent` (0–100 scale, nullable). Leg roles
  and `triggerEvent` may now carry the PMCC values. The handler itself is unchanged. See
  [contracts/ipc-handlers](../contracts/ipc-handlers.md).
- **`positions:list`.** `PmccListSummary` is `{ long, short }` plus `basisPerShare` and
  `basisTotal`; `initialNetDebit` is removed from it. `effectiveCostBasis` and `premiumCollected`
  on the shared base still read the latest snapshot.
- **`_test:pmcc-record-leg-event` (new, dev-only).** It takes `TestPmccLegEventPayloadSchema`:
  `positionId`, `triggerEvent` (a `PmccTriggerEvent`), `eventDate` and `legs`. Each leg carries
  `legRole`, `action`, `strike`, `expiration`, `contracts`, `premiumPerContract`, `fillDate`, and
  optional `fees` and `rollChainId`. An empty `legs` array is allowed. It returns
  `{ ok: true, ledger, snapshot }`; a storage failure returns `internal_error` with nothing written.
  Preload: `testPmccRecordLegEvent`.
- **Zod / enums.** `LegRole` gains four roles; new `PmccTriggerEvent` enum and type; `TriggerEvent`
  widens to include it. See [contracts/zod-schemas](../contracts/zod-schemas.md).
- **Schema.** No migration. `cost_basis_snapshots` gains a PMCC row convention: `basis_per_share`
  is the ledger's per-share basis and may be negative, `total_premium_collected` is
  `shortCreditsTotal`, `final_pnl` is `NULL`, and `trigger_event` is a `PmccTriggerEvent`.
  `legs.leg_role` accepts the four new role values; the column has no CHECK. See
  [schema/tables](../schema/tables.md).

## Source files

- **Core:**
  - `src/main/core/costbasis.ts` (`calculatePmccLedger`, `PmccLedgerResult`)
  - `src/main/core/types.ts` (`LegRole`, `PmccLegRole`, `isPmccLegRole`)
  - `src/main/core/test-fixtures/arbitraries.ts` (`pmccContribution`)
- **Schemas and IPC:**
  - `src/main/schemas.ts` (`PmccTriggerEvent`, `TriggerEvent`, `PmccListSummary`,
    `TestPmccLegEventPayloadSchema`)
  - `src/main/ipc/test-pmcc-ledger.ts` (`registerTestPmccLedgerIpc`)
  - `src/main/index.ts` (registration under the `NODE_ENV === 'test'` gate)
- **Services:**
  - `src/main/services/pmcc-ledger.ts`
  - `src/main/services/roll-chains.ts`
  - `src/main/services/leg-rows.ts`
  - `src/main/services/pmcc-opening-legs.ts`
  - `src/main/services/create-pmcc-position.ts`
  - `src/main/services/assign-csp-position.ts`
  - `src/main/services/get-position.ts`
  - `src/main/services/list-positions.ts`
  - `src/main/services/test-fixtures/pmcc-legs.ts` (shared PMCC leg fixtures)
- **Preload:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Renderer:**
  - `src/renderer/src/api/positions.ts` (`PmccLedgerResult` re-export)
  - `src/renderer/src/lib/format.ts` (`fmtPct1`)
  - `src/renderer/src/lib/position-list-items.ts` (`toPmccListItem`)
  - `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx`, `PositionCockpit.tsx`,
    `PmccLegReference.tsx`
  - `src/renderer/src/components/PmccPositionRow.tsx`
- **E2E:**
  - `e2e/pmcc-cost-basis.spec.ts`, which covers all 13 scenarios
  - `e2e/pmcc-ledger-helpers.ts`, `e2e/pmcc-helpers.ts`
  - `e2e/open-pmcc-position.spec.ts` (US-101 suite, touched)

Sources: [extract: us-103](../.extracts/us-103.md), `plans/us-103/`,
`docs/us-103-implementation.md`.

Related stories:

- [us-101](./us-101-open-pmcc-position.md): opens the position and writes the first snapshot in
  this ledger's convention.
- [us-16](./us-16-cost-basis-sequential-rolls.md): its roll-chain grouping is now the shared
  `groupRollChains`.
- [us-34](./us-34-position-cockpit.md): the cockpit that hosts the new drawer.
- [us-2](./us-2-position-list.md): the list that shows the running total.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
