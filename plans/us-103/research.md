# Research: US-103 — Calculate and display PMCC cost basis

Story of record: Linear [OPT-9](https://linear.app/optionswheel/issue/OPT-9/us-103-calculate-and-display-pmcc-cost-basis).
The archived `docs/epics/09-stories/US-103-pmcc-cost-basis.md` matches it; where the two differ,
Linear wins. Layout of record: `mockups/epic-09-pmcc-position-detail.mdx` (`Cost basis` drawer,
`healthy` / `rs-recorded` / `rl-recorded` presets). `mockups/us-103-pmcc-cost-basis.mdx` is design
history and was read for the ledger arithmetic only.

## What already exists (verified against `src/`, not the spec)

| Area             | Today                                                                                                                                                                                                                                                                                                                 | Gap for US-103                                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine           | `src/main/core/costbasis.ts` has `calculatePmccOpeningDebit` (entry snapshot only) plus the wheel formulas. `round4` / `money4` / `sharesFromContracts` helpers are private to the file.                                                                                                                              | Add the running ledger `calculatePmccLedger` beside it. Nothing exists for post-entry events.                                                                                                                                                     |
| Opening snapshot | `createPmccPosition` (`src/main/services/create-pmcc-position.ts`) writes one `cost_basis_snapshots` row: `trigger_event='PMCC_OPEN'`, `basis_per_share = initialNetDebit / (contracts×100)` (fees in), `total_premium_collected = shortCredit − shortFees`, `snapshot_at = makeSnapshotAt(long.fillDate)`.           | Already in this story's convention ([ADR](../../docs/spec/architecture/02-adrs/pmcc-opening-snapshot-ledger-convention.md)). The ledger reproduces `23.0000` / `200.0000` and `23.0200` / `199.0000`. Refactor the insert onto the shared writer. |
| Snapshot schema  | `cost_basis_snapshots(id, position_id, basis_per_share TEXT, total_premium_collected TEXT, final_pnl, annualized_return, trigger_event TEXT DEFAULT 'UNKNOWN', snapshot_at, created_at)`. No CHECK on `trigger_event`. `basis_per_share` is TEXT so a negative value stores as-is.                                    | **No migration.** Confirmed: every figure the drawer needs is either stored (`basis_per_share`, short credits as `total_premium_collected`) or recomputed from legs.                                                                              |
| Legs schema      | `legs.leg_role` and `legs.action` are TEXT with **no CHECK** (only `instrument_type` is checked, migration 003). `roll_chain_id` (001) and `fees` (017) exist.                                                                                                                                                        | The reserved PMCC roles can be added to the `LegRole` enum without a migration.                                                                                                                                                                   |
| Leg roles        | `LegRole` enum has `LEAPS_OPEN`, `SHORT_CALL_OPEN`. `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED` are **reserved by name only** ([ADR](../../docs/spec/architecture/02-adrs/pmcc-phase-and-leg-role-names.md)). Renderer `LEG_ROLE_LABEL` / `ROLE_COLOR` are `Record<string,…>`.     | The ledger must classify every PMCC leg role to a side; see ADR below.                                                                                                                                                                            |
| Roll pairs       | `roll-csp-position.ts` / `roll-cc-position.ts` write `ROLL_FROM` (`BUY`) + `ROLL_TO` (`SELL`) sharing a `roll_chain_id`, both legs `fees='0.0000'`. `groupRollsByChain` is **private** in `assign-csp-position.ts`, computes `ROLL_TO.premium − ROLL_FROM.premium`, orders by earliest `fillDate`.                    | Extract to a shared service helper (the story names this as the second consumer). A LEAPS roll inverts the actions (`ROLL_FROM` = `SELL`, `ROLL_TO` = `BUY`, per OPT-13), so the shared helper must net by **action**, not by role.               |
| Trigger events   | `TriggerEvent` in `src/main/schemas.ts` is a plain TS union ending in `'PMCC_OPEN'`. No `Record<TriggerEvent,…>` exists anywhere in `src/`.                                                                                                                                                                           | Add the PMCC trigger vocabulary this story's chain names.                                                                                                                                                                                         |
| Read path        | `getPosition` returns `legs`, `allSnapshots` (ASC), latest `costBasisSnapshot`, and `initialNetDebit` (recomputed from the two opening legs through `readPmccOpeningLegs` / `pmccInitialNetDebit` in `pmcc-opening-legs.ts`). `listPositions` builds `PmccListSummary { long, short, initialNetDebit }` the same way. | Both surfaces need the running ledger. `readPmccOpeningLegs` reads only the two opening roles; the ledger needs every leg.                                                                                                                        |
| Detail renderer  | `PositionCockpit` returns `<PmccLegReference legs initialNetDebit />` for `strategyType === 'PMCC'` — two `SectionCard`s plus an `Initial net debit` stat. The wheel's `CostBasisDrawer` (`Cost basis & history`, `fieldCount={3}`) is a private component in the same file.                                          | Add a `Cost basis` `CollapsedDrawer` below the leg reference, selected on `strategyType`. Never branch inside the wheel drawer.                                                                                                                   |
| List renderer    | `PmccPositionRow` cell 10 renders `` `${fmtMoneyGrouped(initialNetDebit)} net debit` ``; `position-list-items.ts#toPmccListItem` builds the optimistic row from the create response.                                                                                                                                  | Replace with the running cost-basis total; drop the `net debit` suffix.                                                                                                                                                                           |
| Formatting       | `fmtMoney` → `$23.00` / `-$0.40` (ASCII hyphen); `fmtMoneyGrouped` → `$2,300.00`; `fmtPct` rounds to whole percent.                                                                                                                                                                                                   | Need a one-decimal percent (`8.0%`, `101.8%`).                                                                                                                                                                                                    |
| Test seams       | `_test:*` IPC channels registered only when `NODE_ENV === 'test'` (`ipc/test-scheduler.ts`, `ipc/test-iv-history.ts`; [ADR](../../docs/spec/architecture/02-adrs/dev-only-test-scheduler-ipc.md)). `e2e/pmcc-helpers.ts` has `launchPmcc`, `sqlite(dbPath, sql)`, `tableCount`.                                       | No production path records any post-entry PMCC leg event yet (US-104/105/115/119 are Backlog). The e2e suite needs a way to land those events.                                                                                                    |
| Property tests   | `costbasis.property.test.ts` already covers `calculatePmccOpeningDebit` (scale invariance etc.) with `src/main/core/test-fixtures/arbitraries.ts` generators.                                                                                                                                                         | Add ledger properties.                                                                                                                                                                                                                            |

### Sibling stories that consume this calculation (read from Linear)

- **US-104** (OPT-12) short-call roll: `ROLL_FROM` = BUY CALL, `ROLL_TO` = SELL CALL, one `roll_chain_id`; "the cost basis becomes $21.80, recalculated by US-103 as a roll-net contribution"; history line "Short-call roll #1 debit $0.60".
- **US-105** (OPT-13) LEAPS roll: `ROLL_FROM` = **SELL** CALL, `ROLL_TO` = **BUY** CALL; net = proceeds − replacement debit; "US-103 owns … the re-anchoring of effective share cost to the new open long strike"; **no strike-delta term**.
- **US-115** (OPT-23) subsequent short: a `SELL` to open short leg that is not `ROLL_TO`; contracts may be **fewer** than the LEAPS contracts (partial coverage).
- **US-119** (OPT-25) retire short: expiration leg `action=EXPIRE`, premium `0.0000`; buyback leg `BUY` at the entered price; "only a buyback changes the cost basis".
- **US-109** (OPT-17) timeline: reads `allSnapshots`, reuses the extracted roll-chain helper, and wants a leg "side discriminator … without inferring from strike".

These fix the shape of the ledger input: contributions must be classified by **role → side** and signed by **action**, roll chains must net by action, and per-share basis must divide by the **LEAPS** contracts.

## Architecture Decisions

### ADR: One pure `calculatePmccLedger` over signed contributions; the engine never sees legs

- **Decision:** Add to `src/main/core/costbasis.ts`:

  ```ts
  type PmccLedgerSide = 'LONG' | 'SHORT'
  interface PmccContribution {
    side: PmccLedgerSide
    cashPerShare: string
    contracts: number
    fees: string
  }
  interface PmccLedgerInput {
    leapsContracts: number
    longStrike: string | null
    contributions: PmccContribution[]
  }
  interface PmccLedgerResult {
    basisPerShare: string
    basisTotal: string
    leapsCostPerShare: string
    leapsCostTotal: string
    shortCreditsPerShare: string
    shortCreditsTotal: string
    effectiveShareCost: string | null
    premiumRecoveredPercent: string | null
  }
  ```

  `cashPerShare` is signed per share of contract: **positive = cash paid out, negative = cash
  received**. `fees` is dollars for the whole contribution. The fold is in dollars:
  `contributionTotal = cashPerShare × contracts × 100 + fees`; `leapsCostTotal = Σ LONG`;
  `shortCreditsTotal = −Σ SHORT` (so a net credit is positive); `basisTotal = leapsCostTotal −
shortCreditsTotal`; `basisPerShare = basisTotal / (leapsContracts × 100)`; the two per-share
  side figures divide the same way. `effectiveShareCost = longStrike + basisPerShare` (null when no
  strike). `premiumRecoveredPercent = shortCreditsTotal / leapsCostTotal × 100`, **null when
  `leapsCostTotal ≤ 0`**. All strings 4 dp via the file's existing `money4`.

- **Why:** The story's formula `basis = long_debits + fees − short_credits ± roll_nets` is exactly
  "sum the signed cash". Signing by action at the boundary means one rule covers an opening debit,
  an opening credit, a buyback, a short roll (BUY to close + SELL to open → net debit $0.60) and a
  LEAPS roll (SELL to close + BUY to open → net credit $2.50) without a `kind` switch inside the
  engine, and US-105's "no strike-delta term" is true by construction — strike never enters the
  fold. Totals are folded in dollars and divided once so the fee example gives `2302.0000` and
  `23.0200` (not `23.02 × 100` drift) and so US-115's partial coverage (1 short against 3 LEAPS)
  prorates the way `calculateCcOpenBasis` already prorates CC income across held shares.
  Side-splitting at the boundary keeps the engine free of leg roles, matching the US-16 precedent
  ("the engine has no roll_chain_id grouping concept").
- **Alternatives considered:** (a) Pass `LegRecord[]` into the engine — leaks `roll_chain_id` and
  role names into `core/`. (b) Per-share-only arithmetic (`basis = Σ perShare`) — breaks on
  unequal contracts and on fees, which are per leg in dollars. (c) A `kind: 'LEAPS_OPEN' | 'SHORT_ROLL' | …`
  discriminator per contribution — more surface for no extra rule; side + sign is sufficient.
  (d) Extending `calculateRollBasis` with `legType: 'PMCC_SHORT' | 'PMCC_LEAPS'` — the wheel
  function is a prev-snapshot delta; the PMCC ledger is a replay over all fills, and the two
  display sets differ.

### ADR: Display figures are recomputed from legs; snapshots are the audit chain

- **Decision:** `getPosition` and `listPositions` build the ledger from the position's **legs** on
  every read (`pmccLedger` on the detail result, `basisPerShare` / `basisTotal` on
  `PmccListSummary`). Snapshots are written for the audit chain (US-109's "cost basis after cycle
  N") and remain the source of the base-row `effectiveCostBasis`, but the drawer and the row do not
  multiply `basis_per_share` back up.
- **Why:** The US-101 cold review replaced `initialNetDebit = basis_per_share × 100 × contracts`
  because a rounded per-share basis drifts when multiplied back ([ADR](../../docs/spec/architecture/02-adrs/pmcc-opening-snapshot-ledger-convention.md)).
  The same drift applies to "Total" here (3 contracts with $0.01 fees per leg). Recomputing from
  fills is also what makes the drawer honest after a direct SQL import or a consumer story that
  forgets a snapshot. Tests assert the two agree: after every event the newest snapshot's
  `basis_per_share` equals the ledger's `basisPerShare`.
- **Alternatives considered:** Read the latest snapshot only — needs a new column for LEAPS cost to
  date (or derives it from a rounded figure), and cannot show a correct `Total`. Store `basis_total`
  in a new column — a migration the story says to avoid, and still stale on import.

### ADR: `appendPmccSnapshot` is the one writer, called inside the caller's transaction

- **Decision:** `src/main/services/pmcc-ledger.ts` exports
  `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now }) → { ledger, snapshot }`.
  It reads the position's legs (shared `readLegs`), builds contributions, runs `calculatePmccLedger`,
  inserts one `cost_basis_snapshots` row (`basis_per_share = ledger.basisPerShare`,
  `total_premium_collected = ledger.shortCreditsTotal`, `final_pnl = NULL`,
  `snapshot_at = makeSnapshotAt(eventDate)`) and returns both. It performs no transaction of its
  own: consumers insert their leg(s) and call it inside `db.transaction(...)`, so a throw anywhere
  rolls back leg and snapshot together. `createPmccPosition` is refactored to call it after
  inserting its two legs (same row as today; its DROP-TABLE rollback test keeps passing).
- **Why:** The story: "Recalculate inside the same service-layer SQLite transaction as the leg
  event that triggered it, so a failed event leaves neither a leg nor a snapshot." One writer means
  US-104/105/115/119 cannot restate the formula or the column mapping. Re-reading legs inside the
  transaction (better-sqlite3 is synchronous and the connection is single) sees the just-inserted
  leg.
- **Alternatives considered:** Passing the new leg(s) in memory and merging with the prior ledger —
  two code paths for the same number. Having the writer own the transaction — nests a savepoint
  the consumer did not ask for and hides the atomicity contract.

### ADR: Contributions are classified by leg role → side and signed by action; roll chains net by action

- **Decision:** In `pmcc-ledger.ts`, `buildPmccContributions(legs: LegRecord[]): PmccContribution[]`:
  - Legs with `rollChainId === null`: `side = PMCC_LEG_SIDE[legRole]` where `PMCC_LEG_SIDE` is an
    exhaustive `Record<PmccLegRole, PmccLedgerSide>` (`LEAPS_*` → `LONG`, `SHORT_CALL_*` → `SHORT`);
    `cashPerShare = +premiumPerContract` for `BUY`, `−premiumPerContract` for `SELL`, `0` for
    `EXPIRE` / `ASSIGN` / `EXERCISE`; `fees` and `contracts` from the leg.
  - Roll chains (via the shared helper below): one contribution per chain,
    `cashPerShare = Σ BUY fills − Σ SELL fills`, `fees = Σ leg fees`, `contracts = rollTo.contracts`,
    `side = LONG` when `rollFrom.action === 'SELL'` (closing a long), else `SHORT`.
  - Ordered by `fillDate`, then `createdAt` (chains by their earliest leg). Order does not change
    the result; it is kept so the DEBUG log reads chronologically.
  - A leg whose role is not a PMCC role is excluded with a WARN `pmcc_ledger_unknown_leg_role`
    (cannot happen through any current write path).
- **Why:** Side must come from the role, not from action or strike (US-109: "a side discriminator …
  without inferring from strike"): a short-call buyback and a LEAPS purchase are both `BUY CALL`.
  Sign must come from action because every PMCC event is a cash flow with a direction. Netting roll
  chains by action is what makes one helper serve the wheel (`ROLL_TO` is `SELL`) and the LEAPS
  roll (`ROLL_TO` is `BUY`) with the same arithmetic. The exhaustive record makes "a PMCC role with
  no side" a compile error the day US-111 adds one.
- **Alternatives considered:** Classify by action + instrument — wrong for buybacks. Prefix-match
  the role string — untyped. Two role sets as arrays — not exhaustive.

### ADR: `groupRollsByChain` moves to `src/main/services/roll-chains.ts` and nets by action

- **Decision:** New shared helper `groupRollChains(legs: LegRecord[]): RollChain[]` with
  `RollChain = { rollChainId, rollFrom, rollTo, netCreditPerShare, contracts, fees, fillDate }` where
  `netCreditPerShare = Σ SELL premiums − Σ BUY premiums` (4 dp, signed; positive = credit), sorted
  by earliest `fillDate` then `createdAt`; chains missing either half are dropped.
  `assignCspPosition` imports it and maps `{ netCreditPerShare, contracts }` onto its existing
  `ROLL_NET` legs — its tests and waterfall labels are unchanged.
- **Why:** The story names this as the second consumer US-16 was waiting for, and US-109 is the
  third. For wheel rolls `ROLL_TO.premium − ROLL_FROM.premium` and `SELL − BUY` are the same number,
  so the move is behaviour-preserving for the wheel while becoming correct for the inverted LEAPS
  roll.
- **Alternatives considered:** A third private copy in `pmcc-ledger.ts` — exactly what US-16's note
  told us not to do. Netting by role with a `legType` flag — the LEAPS roll would need the caller
  to know which half is which.

### ADR: The reserved PMCC leg roles and the PMCC trigger events enter the enums now

- **Decision:** Add `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED`
  to `LegRole` (`src/main/core/types.ts`) and define
  `PmccTriggerEvent = z.enum(['PMCC_OPEN','PMCC_SHORT_OPEN','PMCC_SHORT_EXPIRED','PMCC_SHORT_CLOSED','PMCC_SHORT_ROLL','PMCC_LEAPS_ROLL'])`
  in `src/main/schemas.ts`, with `TriggerEvent = WheelTriggerEvent | z.infer<typeof PmccTriggerEvent>`.
  No `LEG_ROLE_LABEL` text is added for the new roles (the renderer map is `Record<string,string>`
  and nothing renders them yet); `PHASE_*` maps are untouched because no phase is added.
- **Why:** US-101's ADR reserved the role names and said each story adds a value "when it first
  produces it". US-103 does not produce them, but it is the first story that must **consume** every
  one of them: the ledger classifies them, the chain scenario in the AC records an expiration, a
  subsequent short, a short roll and a LEAPS roll, and the integration tests have to insert those
  rows as typed `LegRecord`s. Owning the trigger vocabulary here is what the story's "none of them
  restates the formula or its messages" ownership clause means in practice — US-104 passes
  `'PMCC_SHORT_ROLL'`, it does not coin it. `LegRole` has no SQL CHECK, so no migration. `PMCC_CLOSED`
  / an assignment trigger are left to US-111 / US-120, which define what those events mean.
- **Alternatives considered:** Keep roles out of the enum and classify by string prefix — loses the
  exhaustive side map. Let each consumer add its trigger name — guarantees drift in a column with
  no CHECK.

### ADR: One shared legs reader replaces `readPmccOpeningLegs`

- **Decision:** `src/main/services/leg-rows.ts` exports `readLegs(db, positionId): LegRecord[]`
  (the `GET_LEGS_QUERY` + `mapLegRow` currently private to `get-position.ts`) and
  `readLegsByPosition(db, positionIds): Map<string, LegRecord[]>` (one `IN (...)` query, same
  ordering). `pmcc-opening-legs.ts` becomes pure over `LegRecord[]` (`pmccOpeningLegs(legs)`,
  `pmccInitialNetDebit(legs)`) and `list-positions.ts` / `get-position.ts` read legs once and derive
  the opening summary, `initialNetDebit` and the ledger from the same rows.
- **Why:** The ledger needs every leg; reading the two opening roles separately would be a second
  query per position for a subset of the same rows. `getPosition` already reads all legs.
- **Alternatives considered:** Keep `readPmccOpeningLegs` and add `readPmccLegs` beside it — two
  readers over one table.

### ADR: The current LEAPS strike for `Effective share cost` is the newest long-side BUY leg

- **Decision:** `currentLongStrike(legs)` in `pmcc-ledger.ts` returns the `strike` of the most
  recent (by `fillDate`, `createdAt`) leg whose side is `LONG` and whose action is `BUY` —
  `LEAPS_OPEN` at entry, the `ROLL_TO` of the latest LEAPS roll afterwards — or `null` when there is
  none. It is passed as `longStrike` to the engine.
- **Why:** The story: "The strike change surfaces through the effective-share-cost line, which reads
  the open long leg's strike, not through the basis." After US-105's roll the newest long BUY is
  the $85 replacement, so the line re-anchors to $104.30 with no other rule.
- **Alternatives considered:** Reuse `readPmccOpeningLegs`' "later rows win" over `LEAPS_OPEN` only —
  misses the roll. Derive from `activeLegSubquery` — that resolver is phase-aware and wheel-shaped.

### ADR: Detail and list carry the ledger as server-derived fields; the renderer formats only

- **Decision:** `GetPositionResult` gains `pmccLedger: PmccLedgerResult | null` (null for a wheel or
  a PMCC with no legs). `PmccListSummary` replaces `initialNetDebit` with
  `Pick<PmccLedgerResult, 'basisPerShare' | 'basisTotal'>`. `initialNetDebit` stays on the detail
  result because `PmccLegReference` still shows it. The optimistic row in
  `position-list-items.ts#toPmccListItem` fills the two fields from the create response
  (`costBasisSnapshot.basisPerShare`, `openingDebit.initialNetDebit` — equal to the ledger at entry).
- **Why:** [server-side-dte-and-derived-fields](../../docs/spec/architecture/02-adrs/server-side-dte-and-derived-fields.md):
  derived money lives in the main process; the renderer parses nothing but display strings.
- **Alternatives considered:** Compute in the renderer from `detail.legs` by importing the engine —
  needs the roll-chain grouping in the renderer and gives the list nothing.

### ADR: `PmccCostBasis` is its own drawer component selected in `PositionCockpit`

- **Decision:** `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx` renders
  `<CollapsedDrawer title="Cost basis" fieldCount={6} defaultOpen>` with a `Caption`
  (`US-103 · cash ledger, never a quote`) and one `StatGrid minWidth={150}` of six cells, in the
  mockup's order: `Cost basis / share` (`text-wb-sky`), `Total`, `LEAPS cost to date`,
  `Short-call credits to date`, `Effective share cost`, `Premium recovered`. The PMCC branch of
  `PositionCockpit` becomes a `flex-col gap-3` stack of `PmccLegReference` then `PmccCostBasis`
  (rendered only when `pmccLedger` is non-null). The wheel's private `CostBasisDrawer` is untouched.
- **Why:** The story: "Select it on `position.strategy` in `PositionCockpit`; do not branch inside the
  wheel's `Cost basis & history` drawer." The consolidated mockup is the layout of record; the
  shipped `PmccLegReference` is not yet a drawer (US-118 reshapes the stack), so this drawer sits
  directly below it as the story says.
- **Alternatives considered:** Extend `CostBasisDrawer` with a `strategyType` prop — the branch the
  story forbids.

### ADR: Display formatting of the six cells

- **Decision:**
  - Money through the existing `fmtMoney` / `fmtMoneyGrouped`; a negative basis therefore renders
    `-$0.40` / `-$40.00` (ASCII hyphen, as every other negative money string in the app), never
    clamped.
  - `Short-call credits to date` shows the figure's **contribution to basis**: `fmtMoney` of the
    negated `shortCreditsPerShare`, so a $2.00 credit reads `-$2.00` and a (rare) net debit on the
    short side reads as a positive amount. No colour: credits are not a gain (the story explicitly
    rules out the mockup's green).
  - `Premium recovered` is `fmtPct1(premiumRecoveredPercent)` → `8.0%`, `101.8%`; `—` when null.
    New `fmtPct1(value: string): string` in `lib/format.ts` (one decimal, `ROUND_HALF_UP` via
    `Decimal`).
  - `Effective share cost` is `fmtMoney(effectiveShareCost)` or `—`. The strike is **not** named in
    the cell ("$80.00 + $23.00") — the story lists that under "Mockup cleanup pending: do not build".
  - No "LEAPS fully paid for" state, no profit / realized wording, no share count, no max profit,
    breakeven or annualized return anywhere in the drawer.
- **Why:** The AC fixes the labels and the numbers; the "do not build" list fixes what is left out.
- **Alternatives considered:** A Unicode minus to match the Gherkin's `−$2.00` — would be the only
  place in the app using one; the e2e asserts the app's own `-$2.00`.

### ADR: A dev-only `_test:pmcc-record-leg-event` channel drives post-entry events in e2e

- **Decision:** `src/main/ipc/test-pmcc-ledger.ts` registers `_test:pmcc-record-leg-event` under the
  existing `NODE_ENV === 'test'` gate in `src/main/index.ts`. Payload (Zod):
  `{ positionId, triggerEvent: PmccTriggerEvent, eventDate, legs: TestLegRow[] }` where a
  `TestLegRow` is `{ legRole: LegRole, action: LegAction, strike, expiration, contracts, premiumPerContract, fillDate, fees?, rollChainId? }`.
  The handler inserts the rows and calls `appendPmccSnapshot` inside **one** `db.transaction`, and
  returns `{ ok: true, ledger, snapshot }` or `{ ok: false, error }`. Preload exposes it as
  `window.api.testPmccRecordLegEvent`. It performs no lifecycle validation — it is a fixture
  writer, not a feature.
- **Why:** Eleven of the thirteen scenarios need an expiration, a subsequent short, a short roll or
  a LEAPS roll to exist, and no production write path for those lands before US-104/105/115/119.
  Seeding the snapshots themselves by SQL would make the chain scenarios tautological; seeding only
  legs would leave "a snapshot is recorded for the expiration" and "five snapshots" unverifiable
  end to end. The seam exercises the real writer, the real read path and the real drawer, and the
  `_test:` + `NODE_ENV` convention keeps it out of packaged builds
  ([ADR](../../docs/spec/architecture/02-adrs/dev-only-test-scheduler-ipc.md)). The storage-failure
  scenario installs an SQLite `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)` trigger on the
  temp DB through the `sqlite3` CLI, not a flag on the seam. (US-101's read-only-DB `chmod` technique
  was tried first and does not fail the write: the running app already holds the DB open read-write.)
- **Alternatives considered:** Direct `sqlite3` inserts from the spec (`e2e/pmcc-helpers.ts#sqlite`)
  — fine for legs, tautological for snapshots. Waiting for the consumer stories — leaves the AC
  unverified at e2e for an unknown time. Reusing `_test:` from `app.evaluate` with `require` — the
  bundle does not expose services.

### ADR: Logging

- **Decision:** INFO `pmcc_basis_recalculated { positionId, triggerEvent, basisPerShare, basisTotal }`
  from `appendPmccSnapshot`. DEBUG `pmcc_ledger_contributions { positionId, contributions }`,
  `pmcc_roll_chains { positionId, chains: [{ rollChainId, side, netCreditPerShare }] }`,
  `pmcc_snapshot_insert { positionId, snapshotId, triggerEvent }`. WARN
  `pmcc_ledger_unknown_leg_role { positionId, legId, legRole }`. Nothing in `core/`.
- **Why:** Story: "INFO: recalculated basis per leg event with its trigger. DEBUG: ordered
  contributions, roll-chain nets, and transaction checkpoints."

## Worked ledger (the AC's XYZ fixture, 1 contract, $0 fees)

| Event                                       | Legs recorded                                             | Contribution (side, cash/share)      | LEAPS cost | Credits | Basis / share | Total    | Eff. share cost     | Recovered | Trigger              |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------ | ---------- | ------- | ------------- | -------- | ------------------- | --------- | -------------------- |
| Open (2026-09-14)                           | `LEAPS_OPEN` BUY $25.00; `SHORT_CALL_OPEN` SELL $2.00     | LONG +25.00; SHORT −2.00             | 25.00      | 2.00    | 23.00         | 2,300.00 | 80 + 23 = 103.00    | 8.0%      | `PMCC_OPEN`          |
| Short expires worthless (2026-10-16)        | `SHORT_CALL_EXPIRED` EXPIRE $0.00                         | SHORT 0                              | 25.00      | 2.00    | 23.00         | 2,300.00 | 103.00              | 8.0%      | `PMCC_SHORT_EXPIRED` |
| Subsequent short (sold at $1.80)            | `SHORT_CALL_OPEN` SELL $1.80                              | SHORT −1.80                          | 25.00      | 3.80    | 21.20         | 2,120.00 | 101.20              | 15.2%     | `PMCC_SHORT_OPEN`    |
| Short roll (close $3.00, sell $2.40)        | `ROLL_FROM` BUY $3.00 + `ROLL_TO` SELL $2.40, one chain   | SHORT +0.60 (one net, not two gross) | 25.00      | 3.20    | 21.80         | 2,180.00 | 101.80              | 12.8%     | `PMCC_SHORT_ROLL`    |
| LEAPS roll (close $26.00, buy $85 @ $23.50) | `ROLL_FROM` SELL $26.00 + `ROLL_TO` BUY $23.50, one chain | LONG −2.50                           | 22.50      | 3.20    | 19.30         | 1,930.00 | 85 + 19.30 = 104.30 | 14.2%     | `PMCC_LEAPS_ROLL`    |
| Six more cycles netting $19.70 (fixture)    | `SHORT_CALL_OPEN` SELL $19.70 (stands in for the cycles)  | SHORT −19.70                         | 22.50      | 22.90   | −0.40         | −40.00   | 84.60               | 101.8%    | `PMCC_SHORT_OPEN`    |

Fees: $1.00 on each opening leg → LEAPS cost $25.01, credits $1.99, basis **$23.02 / $2,302.00**
(`total_premium_collected` = `199.0000`). Three contracts at the same fills → $23.00 / **$6,900.00**.

The chain scenario's five snapshots read `23.0000, 23.0000, 21.2000, 21.8000, 19.3000` with the five
triggers above, in `snapshot_at` order.

## Open Questions

None. Every item below was resolved during research rather than left for the user:

- _Does a new column or migration exist?_ No — confirmed against `migrations/` (no CHECK on
  `leg_role` or `trigger_event`; `basis_per_share` is TEXT).
- _Which contracts divide the per-share figures?_ The LEAPS contracts (US-115 partial coverage).
- _How are the post-entry events produced in e2e?_ Through the `_test:` seam above.
- _Is `−` or `-` rendered?_ The app's `fmtMoney` hyphen.
