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

### ADR: The fold is a pure engine in `src/main/core/`, called on the `positions:get` read only

- **Decision:** `buildPmccTimeline` lives in `src/main/core/pmcc-timeline.ts`. A thin service,
  `src/main/services/pmcc-timeline.ts`, turns legs into timeline events. `getPositionDetail`
  (the `positions:get` read) returns `getPosition`'s result plus the timeline as `pmccTimeline`;
  `getPosition` itself, which every write service also loads its position with, carries
  `pmccLedger` and `pmccOpenLegs` but no timeline. The renderer formats.
- **Amendment (code-review fix):** `getPosition` used to fold the timeline for every caller —
  the PMCC roll context and the wheel services among them — on the real clock, and discard it.
  Only the read path now builds it, at the handler's valuation date, and the response type
  (`PositionDetailResult`, `GetPositionResult` + `pmccTimeline: PmccTimeline | null`) is still
  the engine's type, not a copy.
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
- **Amendment (same-day ordering fix):** The rank is a rule between _different_ cycles; applied
  inside one cycle it put a same-day `SHORT_ROLL` / `SHORT_END` before the `SHORT_OPEN` (or
  roll) that put its contract in hand. That fold had no cycle holding the contract, so the row
  was dropped or filed under the wrong cycle while its cash stayed in the ledger. With the
  roll moved to its open's day, `shortRollInput` read open credit `1.8000` against short
  credits `1.2000`. Refinement: after the sort, the fold takes each day's events in rank
  order, but a roll or end whose contract is not held yet **waits for the same-day open or
  roll that takes it**. A contract already held, or one nothing that day takes, keeps its rank,
  so cycle 6's end still lands before cycle 7's open, and closing a short then selling the same
  contract again that day still ends the old cycle first. The held set is just
  opened/rolled-to contracts minus rolled-from/ended ones, so the order still depends only on
  the events, not on array order or `seq`. A same-day loop of rolls (A → B, B → A, neither
  held) has nothing ready and falls back to the plain rank order.

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
  `etDateOf(now)` to `getPositionDetail`, which passes it to the timeline service. The handler
  runs inside `handleIpcCall` like its siblings (code-review fix): it parses `{ positionId }`
  with `GetPositionPayloadSchema`, and an unknown id is a `ValidationError` (`__root__`,
  `not_found`, `Position not found`), so the not-found envelope is unchanged and a throw becomes
  `{ ok: false, errors }` instead of a rejected invoke.
- **Why:** The story fixes the valuation date in America/New_York. Injecting it keeps the engine
  pure and lets e2e pin 2027-08-13 with `WHEELBASE_FAKE_NOW`.
- **Alternatives considered:** `localToday()` in the service (not pinnable, local timezone).
  Computing day counts in the renderer (splits the fold across two processes).

### ADR: The coverage window ends at the close date when the position is closed

- **Decision:** `totalDays` runs from the first LEAPS fill to `position.closedDate` when set,
  otherwise to the valuation date. The gaps are the window's days no cycle covers: the
  complement, inside `[start, windowEnd]`, of the union of the cycles' coverage, each clamped to
  the window. A trailing gap is emitted when no cycle still covers at the window end — not
  merely when the last cycle sold has ended. The window end is never before the first LEAPS fill: when
  the user's local date runs ahead of New York's, the LEAPS can be filled on a day the Eastern
  valuation date has not reached, and the window is then empty (`totalDays` 0, an open cycle's
  `daysSoFar` 0) rather than −1 (code-review fix).
- **Why:** The mockup counts to "today" even for a closed position, which keeps adding
  uncovered-looking days to a finished timeline. The story only requires that a closed
  position "still totals the cycles and the coverage days".
- **Alternatives considered:** The mockup's behaviour (coverage drifts every day after close).
- **Amendment (code-review fix): coverage is a union clamped to the window.** Gaps used to pair
  cycle N's end with cycle N+1's sale and add a trailing gap after the last cycle. Two bugs
  followed. A fill dated after the window end (entry validates fill dates against the local
  date, the timeline is valued at New York's) ran a gap past it: LEAPS bought 2027-06-01, short
  sold 2027-06-06, valued 2027-06-05 read `uncoveredDays 5` of `totalDays 4`, `coveredDays −1`.
  And overlapping cycles (one sold before the previous ended) gave a false trailing stretch:
  cycle 1 open to 2027-03-19, cycle 2 sold 2027-01-10 and expired 2027-01-29, valued 2027-02-10
  read 12 uncovered days while cycle 1 still covered. Now each cycle covers from its sale to its
  coverage end (or the window end while open), both capped at `windowEnd` (neither precedes
  `start`: a PMCC's short is never sold before its first LEAPS fill), the cycles
  are walked in sale order keeping the furthest day covered so far, and every stretch past it is
  a gap. So each gap lies inside the window, no gap is empty, and `0 ≤ coveredDays ≤ totalDays`.
  A gap's neighbours are the cycle that covered furthest before it (the later on a tie) and the
  cycle sold at its end; a cycle sold on or after the window end still has the gap before it
  (`LEADING` or `BETWEEN`), so `WHOLE_WINDOW` means no cycle was ever sold. An open cycle sold
  after the window end is measured from its sale: `daysSoFar` 0 and `dteRemaining` equal to its
  `dteAtOpen`, never more. The property test checks this against a day-by-day count over a
  replay of the generated events, on histories whose cycles overlap and whose valuation date can
  fall before their last events.

### ADR: A short past expiration with no recorded outcome

- **Decision:** A cycle with no terminal event is `UNRECORDED` once its current expiration is
  strictly before the window end (`closedDate ?? valuationDate`, clamped to `start`), and `OPEN`
  until then — on the expiration day itself it is still open with 0 DTE. `UNRECORDED` carries
  `expiredOn` and `daysHeld` (`openedOn` to `expiredOn`) and neither `dteRemaining` nor an
  outcome. Its coverage ends at `expiredOn`, so the days after it are an uncovered stretch, but
  it still counts as open in the summary: its credit is not realized until the outcome is
  recorded. An open cycle's `daysSoFar` and `dteRemaining` are measured to the same window end,
  so a closed position's stale cycle stops counting at the close. The renderer reads it
  `Outcome not recorded` in the neutral (muted) tone, labels its net `Net credit, open`, and ends
  it with `Expired {date} · outcome not recorded` in place of the DTE row. No prompt to record the
  outcome (out of scope).
- **Why:** Nothing in the product records a PMCC short call expiring yet, so a short past its
  expiration had no terminal leg and stayed open: `-16 DTE remaining`, an `Open` badge, and the
  days after expiration counted as covered. At expiration a short has expired worthless or been
  assigned; the journal cannot know which, so it must not claim either, nor keep counting the
  short as coverage. A third status (rather than a flag on `OPEN`) makes "open with negative DTE"
  unrepresentable and forces every `switch` on the status to handle it. The status is derived
  when the cycle is finalised, so `holderIndex`'s notion of open (no terminal event) is unchanged
  and a later `SHORT_END` still lands on the cycle — recording the expiration turns it `ENDED`
  with the same days held and the same gap. Added to Linear OPT-17 as the scenario "A short call
  past its expiration with no recorded outcome stops counting as coverage".
- **Alternatives considered:** Infer `EXPIRED` from the date (the journal would claim an outcome
  the trader never recorded, and hide an assignment). Keep it `OPEN` and clamp DTE to 0 (still
  counts the days after expiration as covered and says `0 DTE remaining` for days). Count it as
  realized (the credit is not settled until the outcome is known).

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
  partner, becomes an `UNKNOWN` event with no contribution. It attaches to the latest cycle open
  on its date — no end folded yet and its short not yet expired — or to the LEAPS track when none
  was. (Code-review fix: it used to look only at the last cycle sold, so with overlapping cycles
  a leg dated while cycle 1 was open but after cycle 2 ended landed on the LEAPS track.)
- **Why:** The story requires such a leg to be "neither dropped, nor counted into the cycle's
  net, nor allowed to break the group". The ledger already ignores it, so the totals still
  reconcile. It moves no figure at all, the cycle's footer included: an unknown leg dated after
  a LEAPS roll inside an open cycle used to rewrite that cycle's footer to the current ledger
  basis (cycle 9 `$6.55` → `$4.55`); the footer now stays the basis after the cycle's last known
  event (code-review fix).
- **Alternatives considered:** Drop it, as `groupRollChains` does for a half-chain (violates the
  AC).
- **Short roll or end with no cycle to join (code-review fix B1).** A `SHORT_ROLL` or
  `SHORT_END` folded before any `SHORT_OPEN` has no cycle to attach to. It used to be dropped
  while its contribution still reached the ledger, so the reconciliation line read
  "Realized $0.00 + open $0.00 = $1.00". It now becomes a LEAPS-track `UNKNOWN` row (`role` =
  the event's kind), and its dollars go in `summary.unattributedShortPerShare`, which the
  reconciliation line adds as `+ unattributed $X` only when non-null. The property oracle is
  now realized + open + unattributed = ledger short credits, over histories that can begin with
  such an orphan.
- **Stray roll or end after the latest cycle ended (code-review fix).** The fallback to "the
  latest cycle" also took an ended cycle, and `endCycle` then overwrote its end: a stray
  `SHORT_END` on 2027-03-01 after a cycle that expired 2027-02-05 re-ended it (rows
  `OPEN, END, END`, `daysHeld` 56 instead of 32, the trailing gap moved). Now a roll or end whose
  contract no cycle holds joins the latest cycle only while that cycle is open; otherwise it
  takes the unattributed path above. The arbitrary can draw such a stray in the gap after any
  ended cycle, and the oracle counts as unattributed every short roll or end whose contract no
  open or roll in the history takes.
- **Duplicate roll or end for an ended cycle's contract (code-review fix).** `holderIndex`
  still preferred the latest cycle whose `current` matched, open or ended, so a second
  `SHORT_END` (`CLOSED` at 0.60 on 2027-03-01) for the $112 · 2027-02-05 that expired
  2027-02-05 re-ended that cycle (`endedOn` 2027-03-01, `daysHeld` 56, outcome `CLOSED`, net
  1.10). Now only an open cycle takes a roll or end: the latest open cycle holding the contract;
  else, if an ended cycle holds it, the event is unattributed (it does not fall through to an
  unrelated open cycle); else the latest cycle while open. `timelineOrder` is unchanged: a
  contract closed and re-sold the same day still ends the old cycle before the open, and a later
  resale routes to the new open cycle. The arbitrary can now make the stray after an ended cycle
  give up that cycle's last contract, and the oracle walks the events in build order with the
  contracts in hand, so a give-up of a contract not in hand — never sold or already given up —
  counts as unattributed.
- **A contract an ended cycle held before it rolled (code-review fix).** The duplicate check
  only compared an ended cycle's `current` contract, so a stray end of the $108 · 2026-11-20 a
  cycle had sold and then rolled to the $112 fell through to "the latest cycle while open" and
  ended an unrelated open cycle. Now a roll or end giving up any contract an ended cycle held —
  its opening contract or any it rolled to — is a duplicate and unattributed.

### ADR: The outlast flag marks only coverage that ran past the LEAPS (code-review fix)

- **Decision:** A cycle is flagged when its coverage ran, or will run, past the expiration of
  the LEAPS held now: an `OPEN` or `UNRECORDED` cycle whose short expires after it, or an
  `ENDED` cycle whose `endedOn` is after it. `daysPastLeaps` counts from the LEAPS expiration to
  that end (or, none recorded, the short's expiration).
- **Why:** The flag read "It was uncovered for that stretch" for every short whose expiration
  was later, including one bought back before the LEAPS expired, which was never uncovered.
- **Alternatives considered:** Keep flagging by expiration and soften the copy (the flag would
  still point at a cycle with nothing wrong).

### ADR: Type shapes tightened in code review

- **`PmccGap`** is a union on `kind` — `LEADING` (`beforeCycle`), `BETWEEN` (`afterCycle`,
  `beforeCycle`), `TRAILING` (`afterCycle`), `WHOLE_WINDOW` (neither) — in place of two
  independently nullable neighbours, so no combination exists that nothing renders.
- **`PmccTimelineSummary.open`** is `{ count; creditPerShare } | null`, mirroring `average`, in
  place of `openCount` and `openCreditPerShare`, which encoded one fact twice.
- **`PmccEndCash`** is derived from `PmccShortEnd` (each outcome plus a `total` typed as its
  `pricePerShare`), so the event and the row cannot drift.
- **`PmccTimeline.leapsContracts`** is gone: nothing outside the engine's tests read it.
- **A `LEAPS_ROLL` event has no `date`.** It carried `date`, `closedOn` and `openedOn`, with
  `date` meant to be the earlier of the two and nothing enforcing it. The engine now dates a
  roll by the earlier of its two fills (`timelineEventDate`), so the service supplies only the
  two fill dates.
- **`buildPmccTimeline` returns `PmccTimeline | null`** (null with no LEAPS purchase or roll)
  instead of throwing, and the service no longer repeats the check.
- **Not done: one ledger pass for both the ledger and the timeline.** `pmccLedgerFromLegs` and
  `pmccTimelineFromLegs` each group roll chains and order the ledger events. Since the timeline
  moved to `getPositionDetail`, the two run in different functions, and `pmccLedgerFromLegs`
  orders the events twice internally (`currentLeapsLeg`, `contributionsFrom`); feeding both from
  one ordered pass would mean changing those US-103 functions to take ordered events, not just
  passing a precomputed value. The cost is a handful of legs per read.

### ADR: Wheel e2e test and the real clock

- **Decision:** The e2e test "A classic wheel's leg history is unchanged" is the one US-109 test
  that runs on the real clock (`launchTimeline(null)`, fill dates from `localDate(…)`). Every
  assertion in it is structural and date-independent: the `AAPL CC Closed` status, one
  `CC Close` row, the wheel's `Running Basis / Share` column, and the absence of the PMCC
  sections (`LEAPS track`, `Short-call cycles`, `Uncovered`, `Leg timeline`,
  `Timeline summary`, the `Coverage` region). No assertion reads a date value.
- **Why:** Wheel entry validates fill dates against the real `localToday()`, and there is no
  wheel seed channel to bypass it, so a pinned `WHEELBASE_FAKE_NOW` date would be rejected as
  a future fill. The test only proves the wheel path is untouched, which needs no date.
- **Alternatives considered:** A wheel seed channel like `_test:pmcc-seed-position` (new test
  infrastructure for one structural assertion). Pinning the clock to the real date at launch
  (still the real clock, and no assertion would use it).

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
