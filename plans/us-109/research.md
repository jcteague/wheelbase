# Research: US-109 — Display PMCC-specific leg timeline on position detail

Story: Linear [OPT-17](https://linear.app/optionswheel/issue/OPT-17). Mockup:
`mockups/epic-09-pmcc-position-detail.mdx` (`Timeline summary` and `Leg timeline` drawers).

## What the code already provides

| Need                                                 | Where it is                                                                                                                                            | Notes                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| All legs of a position, with `rollChainId`           | `readLegs` in `src/main/services/leg-rows.ts`, returned as `legs` by `getPosition`                                                                     | No new query                                                                         |
| PMCC leg roles                                       | `LegRole` in `src/main/core/types.ts`: `LEAPS_OPEN`, `LEAPS_CLOSE`, `SHORT_CALL_OPEN`, `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `SHORT_CALL_ASSIGNED` | LEAPS and short legs are distinguishable by role                                     |
| Roll pairing                                         | `groupRollChains` in `src/main/services/roll-chains.ts`                                                                                                | The story calls this `groupRollsByChain`; that name does not exist                   |
| LEAPS roll vs short roll                             | `isShortCallRoll(chain)` in `src/main/services/pmcc-ledger.ts` (`rollFrom.action === 'BUY'`)                                                           | Rolls share the generic `ROLL_FROM` / `ROLL_TO` roles, so side comes from the action |
| Ledger events in order, with their cash contribution | `orderedLedgerEvents`, `eventContribution` in `pmcc-ledger.ts` (private today)                                                                         | Ordered by fill date, then `createdAt`                                               |
| The basis formula                                    | `calculatePmccLedger` in `src/main/core/costbasis.ts`                                                                                                  | Folds fees in dollars, divides once by LEAPS shares                                  |
| Eastern calendar day of an instant                   | `etDateOf` in `src/main/core/trading-calendar.ts`                                                                                                      |                                                                                      |
| Pinnable clock for e2e                               | `createFakeClock` in `src/main/integrations/fake-clock.ts`, enabled by `WHEELBASE_FAKE_NOW`                                                            | Already shared by the IV collector, watchlist and screener                           |
| PMCC detail stack                                    | PMCC branch of `PositionCockpit.tsx` renders `PmccLegReference` then `PmccCostBasis`                                                                   | No hero yet (US-118 is Backlog); the new drawers append below                        |
| Drawer chrome                                        | `CollapsedDrawer.tsx`                                                                                                                                  | Right-hand label hardcoded to `{fieldCount} fields`                                  |
| Colour tokens                                        | `wb-sky` (LEAPS), `wb-violet` (short call), `wb-green`, `wb-gold`, `wb-red` in `src/renderer/src/index.css`                                            | The mockup's raw hex and `rgba()` values map to these                                |

## What does not exist

- **No way to record most timeline states in production.** US-115 (subsequent short), US-119
  (expire / close early), US-111 (assignment) and US-120 (close) are unbuilt. Real use produces
  one cycle plus rolls. Every other state is fixture-only.
- **No way to seed those fixtures through the product.** `createPmccPosition` rejects a fill date
  after the real clock's today, requires both opening legs, and enforces US-102, so it cannot
  create the LEAPS-only position (bought 2027-06-01) or the imported short-outlasts-LEAPS
  position. The existing `_test:pmcc-record-leg-event` seam cannot close a position.
- **No `$25.00` snapshot.** `createPmccPosition` writes one `PMCC_OPEN` snapshot for both opening
  legs (`$23.00`). `snapshot_at` is the event date plus the wall-clock time of recording
  (`makeSnapshotAt`), so same-day and backdated events order by when they were typed in.

## Architecture Decisions

### ADR: Running basis is replayed through the US-103 ledger engine, not read from snapshots

- **Decision:** The basis shown after each LEAPS row and under each cycle is
  `calculatePmccLedger` run over the contributions of every event up to and including that
  group's last event, in timeline order. Stored snapshots are not read. The caption is
  `from the US-103 ledger`.
- **Why:** A PMCC basis is a cash ledger, so its value at a point in history is the sum of the
  cash flows that had happened by then, in fill-date order. The snapshot chain cannot give that:
  the opening writes one snapshot for two legs, so the story's `$25.00` LEAPS purchase row has
  no snapshot, and snapshots order same-day and backdated events by recording time. Replaying
  the same engine that writes the snapshots cannot drift from the Cost basis drawer, which was
  the story's reason for reading snapshots. Confirmed with the user after an options-expert
  review on 2026-11-11.
- **Alternatives considered:** Read snapshots matched by date and order, as the story says
  (wrong value on the purchase row, fragile on same-day events). Snapshots plus a computed
  purchase row (two code paths, keeps the same-day fragility).

### ADR: The fold is a pure engine in `src/main/core/`, called by `getPosition`

- **Decision:** `buildPmccTimeline` lives in `src/main/core/pmcc-timeline.ts`. A thin service,
  `src/main/services/pmcc-timeline.ts`, turns legs into timeline events. `getPosition` returns
  the result as `pmccTimeline`, beside `pmccLedger` and `pmccOpenLegs`. The renderer formats.
- **Why:** The replay needs roll pairing, the LEAPS-vs-short roll test and the per-event
  contribution, all of which are in main-process services the renderer does not import. A core
  engine also gets property and mutation tests, which fit this logic (reconciliation, coverage
  arithmetic, order independence). `pmccLedger` and `pmccOpenLegs` are precedent for
  PMCC-derived fields on `positions:get`.
- **Alternatives considered:** The renderer module the story names
  (`src/renderer/src/lib/pmccTimeline.ts`): would need `roll-chains.ts` and the ledger's
  contribution builder moved to `src/shared/` or duplicated.

### ADR: The engine takes normalised events, not `LegRecord`s

- **Decision:** The engine input is `PmccTimelineEvent[]`, a discriminated union on `kind`, each
  known event carrying the `PmccContribution` the US-103 ledger assigns it. The service builds
  the events from `orderedLedgerEvents` and `eventContribution`, which `pmcc-ledger.ts` exports.
- **Why:** No file in `src/main/core/` imports `schemas.ts` or a service, and
  `calculatePmccLedger` already takes contributions rather than legs. Reusing the ledger's own
  contribution per event makes fees and roll nets identical to US-103 by construction.
- **Alternatives considered:** Move `roll-chains.ts` into core and pass legs (a wider refactor
  with two unrelated callers, for no gain here).

### ADR: Timeline order is date, then event rank, then recording order

- **Decision:** Events sort by `date`, then rank `LEAPS_OPEN`/`LEAPS_ROLL` (0) <
  `SHORT_END` (1) < `SHORT_ROLL` (2) < `SHORT_OPEN` (3) < `UNKNOWN` (4) < `LEAPS_CLOSE` (5),
  then `seq` (the ledger's fill-date-then-`createdAt` index).
- **Why:** This is the story's same-day rule: a cycle that expires on the Friday the next one is
  sold must show its own footer before the next cycle's credit lands (cycle 6 `$15.15`, cycle 7
  `$13.40`, both on 2027-05-07). LEAPS first makes the opening day read `$25.00` then `$23.00`.
  `LEAPS_CLOSE` sorts last because the long leg leaves after every short has ended.
- **Alternatives considered:** The ledger's own order (fill date, then `createdAt`): right for a
  sum, wrong for a history, since it depends on entry order.

### ADR: Per-share figures divide by the LEAPS shares; fees are inside every net

- **Decision:** A cycle's net in dollars is the negated sum of its events' contribution dollars
  (`cashPerShare × contracts × 100 + fees`). Per share is that total divided by
  `100 × leapsContracts`, the divisor `calculatePmccLedger` uses.
- **Why:** The summary's reconciliation line (`realized + open = short-call credits to date`)
  only holds on real positions if cycle nets are fee-net on US-103's basis. The story's
  Background uses `$0.00` fees, so nothing in its original AC would have caught a gross net.
  A fee scenario was added to the Linear story to cover it.
- **Alternatives considered:** Gross nets with fees shown separately (breaks the reconciliation
  by pennies).

### ADR: The valuation date is the Eastern day of an injected clock in main

- **Decision:** `registerPositionsHandlers` takes `getCurrentDate?: () => Date` (wired to
  `fakeClock?.now`, as `registerWatchlistIpc` already is). The `positions:get` handler passes
  `etDateOf(now)` to `getPosition`, which passes it to the timeline service.
- **Why:** The story fixes the valuation date in America/New_York. Injecting it keeps the engine
  pure and lets e2e pin 2027-08-13 with `WHEELBASE_FAKE_NOW`.
- **Alternatives considered:** `localToday()` in the service (not pinnable, local timezone).
  Computing day counts in the renderer (splits the fold across two processes).

### ADR: The coverage window ends at the close date when the position is closed

- **Decision:** `totalDays` runs from the first LEAPS fill to `position.closedDate` when set,
  otherwise to the valuation date. A trailing gap is emitted when no cycle is open and the last
  cycle ended before the window end.
- **Why:** The mockup counts to "today" even for a closed position, which keeps adding
  uncovered-looking days to a finished timeline. The story only requires that a closed
  position "still totals the cycles and the coverage days".
- **Alternatives considered:** The mockup's behaviour (coverage drifts every day after close).

### ADR: A new test-only seed channel creates US-109 fixtures

- **Decision:** `_test:pmcc-seed-position`, registered only when `NODE_ENV === 'test'`, inserts
  one PMCC position row and its legs as given, optionally closed.
- **Why:** See "What does not exist". The production create path cannot produce four of the
  story's fixtures, and the existing leg-event seam cannot close a position.
- **Alternatives considered:** Extend `_test:pmcc-record-leg-event` with a close flag (still
  cannot create the LEAPS-only or imported positions). Relax validation under test (changes
  production code paths for a fixture).

### ADR: Unknown and unpaired legs become neutral rows

- **Decision:** A leg whose role is not a PMCC role, and a `ROLL_FROM`/`ROLL_TO` leg with no
  partner, becomes an `UNKNOWN` event with no contribution. It attaches to the cycle that was
  open on its date, or to the LEAPS track when none was.
- **Why:** The story requires such a leg to be "neither dropped, nor counted into the cycle's
  net, nor allowed to break the group". The ledger already ignores it, so the totals still
  reconcile.
- **Alternatives considered:** Drop it, as `groupRollChains` does for a half-chain (violates the
  AC).

## Story edits made in Linear

- Caption and prose changed from "US-103 snapshot chain" to "US-103 ledger", and the Technical
  Notes updated for the two ADRs above.
- One scenario added: "Fees reduce the cycle net and the timeline still reconciles".

## Open Questions

- **Cycle footer when a LEAPS roll falls inside the cycle.** Cycle 8's footer drops `$4.90`
  from cycle 7's on a cycle that paid `$2.40`, because the `$2.50` LEAPS roll credit landed
  while it was open. The options-expert review suggested a note on that footer
  ("includes LEAPS roll #1"). Not in the story and not planned; raise it as a follow-up if
  wanted.
- **Short contracts below LEAPS contracts.** Per-share nets use the LEAPS divisor. If a later
  story allows a partial-coverage short, the per-share cycle net will read lower than the
  per-contract fill. Nothing produces that state today.
