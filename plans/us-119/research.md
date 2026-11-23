# Research: US-119 — Retire the PMCC short call — record expiration or close early

Story: Linear [OPT-25](https://linear.app/optionswheel/issue/OPT-25) (`US-119`). Linear is the
source; there is no story file. One comment on the issue (US-106 dependency note, 2026-10-18) is
part of the input and is carried into the ADRs below. Mockup:
`mockups/epic-09-pmcc-position-detail.mdx` — `RetireShortSheet` in its two modes, opened by the
`close-early` and `expire` presets (Linear calls them the `retire short` preset), and the
`leaps-only` preset for the state the story leaves behind.

## What the code already provides

| Need                                  | Where it is                                                                                                                                                                     | Notes                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal short-call leg roles         | `LegRole` in `src/main/core/types.ts`: `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` (and `SHORT_CALL_ASSIGNED`), all in `PMCC_LEG_ROLE_VALUES`                                      | Already in the enum since US-103; nothing in production writes them yet                                                                                        |
| Ledger side and sign of those legs    | `PMCC_LEG_SIDE` + `signedCashPerShare` in `src/main/services/pmcc-ledger.ts`                                                                                                    | `SHORT_CALL_*` → `SHORT`; `BUY` → `+premium` (a debit), `EXPIRE` → `0`. Fees ride on the leg                                                                   |
| "Is a short call open?"               | `currentShortCallLeg` / `pmccOpenLegs` in `pmcc-ledger.ts`; `SHORT_CALL_CLOSING_ROLES` = `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE`, `SHORT_CALL_ASSIGNED`                        | Replay of recorded legs, never the calendar (US-106 comment, item 3). `positions:get` returns it as `pmccOpenLegs`                                             |
| Snapshot trigger events               | `PmccTriggerEvent` in `src/main/schemas.ts`: `PMCC_SHORT_EXPIRED`, `PMCC_SHORT_CLOSED`                                                                                          | Added by US-103 for this story; no new enum value                                                                                                              |
| The one snapshot writer               | `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now })` in `pmcc-ledger.ts`                                                                                      | Reads the legs inside the caller's transaction and recomputes the US-103 ledger; opens no transaction of its own                                               |
| One full-column leg insert            | `insertLegRow` in `src/main/services/leg-rows.ts`                                                                                                                               | Used by US-104/105 and the test seams                                                                                                                          |
| PMCC phase guard + open-legs guard    | `requirePmccOpenPhase` (`core/lifecycle.ts`), `requirePmccOpenLegs` / `loadPmccRollContext` / `logPmccRollRejection` (`services/pmcc-roll-record.ts`)                           | US-104/105's shared shell; reusable as-is                                                                                                                      |
| Timeline fold (US-109)                | `buildPmccTimeline` in `src/main/core/pmcc-timeline.ts`; legs → events in `src/main/services/pmcc-timeline.ts` (`pmccTimelineFromLegs`)                                         | Already maps `SHORT_CALL_EXPIRED` → `SHORT_END` `EXPIRED` and `SHORT_CALL_CLOSE` → `SHORT_END` `CLOSED` with its price. See "Where the cycle fold lives" below |
| Valuation date                        | `positions:get` → `getPositionDetail(db, id, { valuationDate: etDateOf(getCurrentDate()) })`; returned as `pmccTimeline.valuationDate`                                          | `getCurrentDate` is the fake clock under `WHEELBASE_FAKE_NOW` (e2e), the wall clock otherwise                                                                  |
| Header actions                        | `PositionDetailActions.tsx`: PMCC branch shows `Roll Short Call →` (`hasOpenShortCall`) and `Roll LEAPS →` (`hasOpenLeaps`); `PhaseBadge` takes `label`                         | No US-118 action map exists in code (`pmccActionsFor` is named only in Linear)                                                                                 |
| "LEAPS open · no short call" wording  | `stateLabel(shortCount)` (private) in `src/renderer/src/lib/pmcc-card-display.ts` — the US-108 card                                                                             | The detail header still shows `PHASE_LABEL.PMCC_OPEN` = `LEAPS + short call open` whatever the legs say                                                        |
| Outcome labels                        | `outcomeLabel` in `src/renderer/src/lib/pmcc-timeline-rows.ts`: `EXPIRED` → `Expired worthless`, `CLOSED` → `Closed early`                                                      | Reused for the success badge                                                                                                                                   |
| Realized vs open                      | US-109 summary: `Realized net credits` sums `ENDED` cycles; `Open cycle credit`; cycle net label `Net credit` vs `Net credit, open` (`cycleNetLabel`)                           | An `ENDED` cycle is realized. Recording the terminal leg is all the "credit moves from open to realized" AC needs                                              |
| Sheet frame, net preview, basis-after | `PmccRollSheetDialog` (portal, focus, Escape); `pmccPostRollEffectiveCost` in `src/renderer/src/lib/pmcc-roll.ts` (basis after via `calculatePmccLedger`)                       | The preview reuses US-103's engine, so the sheet computes no basis of its own                                                                                  |
| Form pattern                          | `src/renderer/src/schemas/roll-pmcc-short-call.ts` + `useRollPmccShortCallForm` + `useRollSheetSubmit` (server field errors routed to inputs)                                   | Cross-field rules come from `pmcc-rules.ts`, so the form shows the engine's text                                                                               |
| Underlying close for a past day       | `MarketDataProvider.getStockDailyBars({ symbol, start, end })` (`src/main/integrations/market-data-provider.ts`); fake reads `WHEELBASE_FAKE_IV_SERIES` / `_test:iv-series-set` | Market fact, so it belongs on the market-data port (CLAUDE.md "broker is optional"). No IPC exposes a single close yet                                         |
| e2e seeding / clock                   | `_test:pmcc-seed-position` + `seedXyz(page, variant)` and `launchTimeline(fakeNow)` in `e2e/pmcc-timeline-helpers.ts`                                                           | The XYZ Background is already a literal there; variants are leg patches                                                                                        |
| Storage-failure e2e                   | US-101 ADR: `chmod 0o444` the temp DB before confirming                                                                                                                         | No code seam                                                                                                                                                   |

## Where the cycle fold lives (US-109)

The story asks to extract `cycleNet` / `daysHeld` from US-109 into a shared lib. Neither exists
as a named function today; both are inline in **`src/main/core/pmcc-timeline.ts`**:

- the net: `netDollars(contributions)` (module-private `const`, "signed received − paid dollars"),
  divided by `ledger.shares` in `toCycle` to give `netPerShare` / `netTotal`;
- days held: `daysBetween(openedOn, endedOn)` (from `src/main/core/dte.ts`) inside `cycleStatus`
  for `ENDED`, and `daysBetween(openedOn, expiredOn)` for `UNRECORDED`.

The extraction target is a new pure module **`src/main/core/pmcc-cycle.ts`** (ADR below).

## How the code tells "LEAPS only" from "LEAPS + short call"

Verified against the shared convention for US-115 / US-119 / US-120: **the code agrees with it.**

- `WheelPhase` has one PMCC value, `PMCC_OPEN`; `types.test.ts` asserts `PMCC_LEAPS_ONLY` is
  rejected.
- Every reader derives coverage from the legs, never the phase: `PositionDetailPage`
  (`hasOpenShortCall={Boolean(pmccOpenLegs?.short)}`), `list-positions-pmcc.ts`
  (`open.short === null` → LEAPS-only legs → the US-108 card's `LEAPS open · no short call`),
  `evaluate-alerts.ts` (US-106: no short, no short-leg rules), US-109's timeline (no open cycle →
  trailing gap), `rollPmccLeaps` (US-105: `openShort: null` is accepted inside `PMCC_OPEN`).
- The spec still describes the older plan: US-101's ADR
  ([pmcc-phase-and-leg-role-names](../../docs/spec/architecture/02-adrs/pmcc-phase-and-leg-role-names.md))
  and `docs/spec/domain/wheel-lifecycle.md` reserve `PMCC_LEAPS_ONLY` "for US-119 / US-115", and
  the Linear Technical Notes say "return the LEAPS-only phase US-101 named". This plan follows the
  code and the shared convention instead (ADR "Coverage is derived from open legs"); the spec
  pages are corrected by `/update-spec us-119`, and the Linear Technical Note is reworded to match
  (open question 2, resolved).

## Story facts checked against the Background

| AC figure                                                  | Check                                                                                                                                 | Result                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Cycle 8 basis $8.50                                        | US-109 footers: after cycle 7 `13.40`; cycle 8 sold 2.40 → `11.00` (2027-06-22); LEAPS roll credit 2.50 → `8.50` (2027-07-09)         | ✓                                                                                  |
| Cycle 8 "24 days held"                                     | 2027-06-22 → 2027-07-16                                                                                                               | ✓ 24                                                                               |
| LEAPS "$85.00 · 2028-01-21 · 186 DTE" on 2027-07-19        | `daysBetween('2027-07-19', '2028-01-21')`                                                                                             | ✓ 186                                                                              |
| Cycle 5 basis $16.35 → $16.90                              | after cycle 4 `18.55`; sold 2.20 → `16.35`; buyback 0.55 → `16.90` (US-109's cycle-5 footer)                                          | ✓                                                                                  |
| Cycle 5 "75.0% of max", "18 days held"                     | 1.65 / 2.20; 2027-03-15 → 2027-04-02                                                                                                  | ✓                                                                                  |
| **Cycle 5 effective share cost "$101.35 → $101.90"**       | On 2027-04-02 the open LEAPS is the **$80** · 2027-09-17 (the $85 arrives with the 2027-07-09 roll): 80 + 16.35 = **$96.35 → $96.90** | ✗ — the story used the $85 strike; Linear AC corrected (open question 1, resolved) |
| Losing buyback $3.10                                       | 2.20 − 3.10 = −0.90 / −$90.00; basis after 19.45                                                                                      | ✓ (basis after is not stated in the AC)                                            |
| "Fill date cannot be after the expiration" with 2027-04-17 | 2027-04-17 is also after the 2027-04-02 valuation date                                                                                | Needs a rule order: expiration before future (ADR "Close-early rules")             |

## Architecture Decisions

### ADR: Coverage is derived from open legs; `PMCC_OPEN` stays the only open PMCC phase

- **Decision:** Retiring the short writes no phase. The position stays `PMCC_OPEN`, and the
  `positions` row (including `updated_at`) is not touched — US-104 / US-105 parity. "LEAPS open ·
  no short call" is `pmccOpenLegs.short === null`. Both engines return `{ phase: 'PMCC_OPEN' }`.
  `PMCC_LEAPS_ONLY` is not added; the reserved name in US-101's ADR is superseded.
- **Why:** The code already reads coverage from the replayed legs everywhere (table above), and
  `rollPmccLeaps` already runs on a LEAPS-only `PMCC_OPEN` position. A second phase would have to
  be kept in sync with the legs by every writer (this story, US-104's roll of an expired short,
  US-111, US-115, US-120) and would break `requirePmccOpenPhase` in the two shipped roll engines
  for a LEAPS-only position. It is also the convention the three sibling plans share.
- **Alternatives considered:** Add `PMCC_LEAPS_ONLY` as US-101's ADR reserved: every
  `Record<WheelPhase, …>` map gains an entry, both roll engines need a widened guard, and the phase
  can disagree with the legs (e.g. a `_test:pmcc-record-leg-event` row). Store a coverage flag on
  `positions`: same drift risk, no reader needs it.

### ADR: The terminal legs are `SHORT_CALL_EXPIRED` (EXPIRE) and `SHORT_CALL_CLOSE` (BUY)

- **Decision:** Expiration inserts `SHORT_CALL_EXPIRED`, `action = 'EXPIRE'`, `instrument_type =
'CALL'`, the open short's strike / expiration / contracts, `premium_per_contract = '0.0000'`,
  `fill_price = NULL`, `fill_date` = the contract's expiration, `fees = '0.0000'`, no
  `roll_chain_id` — the same shape as the wheel's `CC_EXPIRED`. Close-early inserts
  `SHORT_CALL_CLOSE`, `action = 'BUY'`, `premium_per_contract = fill_price = ` the cost to close
  (4 dp), `fill_date` = the entered fill date, `fees` = the entered fees (4 dp, default
  `'0.0000'`). Each is followed by `appendPmccSnapshot` with `PMCC_SHORT_EXPIRED` /
  `PMCC_SHORT_CLOSED` and the leg's `fill_date` as `eventDate`.
- **Why:** The roles already exist and every reader already understands them:
  `currentShortCallLeg` treats both as closing (so US-106's alerts resolve on the next run with no
  alert change — comment item 1), the US-103 ledger gives `EXPIRE` zero cash and `BUY` a debit on
  the `SHORT` side (so only the buyback moves the basis), and US-109 folds them into `SHORT_END`
  rows. The story forbids overloading `CC_EXPIRED` / `CC_CLOSE`. A leg's `fill_date` is the day the
  short was retired, which is the fill-date floor US-115 and US-120 read.
- **Alternatives considered:** New roles (`SHORT_CALL_EXPIRE`, `SHORT_CALL_BUYBACK`): duplicate
  names for roles already in the enum and the ledger map. `fill_date` = the day the expiration was
  recorded: wrong for the timeline's cycle length and for US-115's floor.

### ADR: The cycle fold moves to `src/main/core/pmcc-cycle.ts`, consumed by the timeline, the services and the sheets

- **Decision:** A new pure module `src/main/core/pmcc-cycle.ts` owns the per-cycle arithmetic:
  `cycleNet(contributions, shares)` (the old `netDollars` + the per-share division),
  `extendCycleNet(net, contribution, shares)` (its one-step fold), `cycleDaysHeld(openedOn,
endedOn)`, `percentOfMaxCaptured(net, max)`, `findOpenCycle(timeline, openShort)` and
  `retireCycle(...)`. `buildPmccTimeline` calls `cycleNet` in `toCycle` and `cycleDaysHeld` in
  `cycleStatus`; the two services call `retireCycle` for their result and INFO log; the renderer's
  preview calls the same `retireCycle` with the projected buyback.
- **Why:** One fold, three consumers, so the sheet, the success state and the timeline cannot
  disagree about a cycle's net. It lives in `src/main/core/` rather than `src/shared/` because it
  depends on `PmccContribution` / `contributionDollars` from `core/costbasis.ts`; the renderer
  already imports pure core engines (`pmcc-rules.ts`, `costbasis.ts`). The preview extends the
  open cycle's `netTotal` (already exact 4-dp dollars) with one contribution, so it does not need
  the cycle's contribution list on the wire.
- **Alternatives considered:** `src/shared/pmcc-cycle.ts`: would import `src/main/core` from
  `src/shared`, inverting the dependency direction `src/shared` keeps today. Compute the preview
  in the renderer by hand (`net − cost`): the second copy the story forbids. Ship the cycle's
  contributions in `PmccCycle`: widens the US-109 wire shape for one consumer.

### ADR: Dates are judged at the Eastern valuation date of the injected clock

- **Decision:** The services take `{ today }` from the handler, computed as
  `etDateOf(getCurrentDate())` with the same `getCurrentDate` that `positions:get` uses. The
  renderer reads `detail.pmccTimeline.valuationDate` for the header gate, the fill date default and
  the "in the future" rule, and passes it to both sheets as `today`.
- **Why:** `WHEELBASE_FAKE_NOW` pins only the main process. The ACs are written on 2027 dates
  (`2027-04-02`, `2027-07-15`, `2027-07-19`); a renderer `newYorkToday()` or a service
  `localToday()` would read the real 2026 clock and reject a 2027 fill as "in the future". The
  header, the sheet and the service must agree on "today" or a valid entry is rejected only after
  the round-trip.
- **Alternatives considered:** `localToday()` in the service, as `expireCcPosition` does: the
  e2e scenarios cannot be expressed. A renderer clock override: a second fake clock to keep in
  sync with the main one.

### ADR: `Record Expiration →` appears only after the expiration date has passed

- **Decision:** For a PMCC with an open short, `Record Expiration →` shows when
  `valuationDate > openShort.expiration` (`isShortExpirationPassed` in
  `src/renderer/src/lib/pmcc-retire.ts`). `expirePmccShort` enforces the same rule:
  `referenceDate <= expiration` → `expiration` / `too_early` / `Cannot record expiration until
after the expiration date (2027-07-16)`. `Close Short Early →` shows while the ledger has an open
  short, before or after its expiration. Resolved (options-expert review, John approved
  2026-11-22; open questions 3 and 4).
- **Why:** The story says "once its expiration date has passed"; the mockup's header map swaps on
  `shortDte < 0`. Exercise is decided after the expiration-day close, so on that day the contract's
  fate is not yet known, and `getStockDailyBars` must not be asked for the current day's
  incomplete bar. Close Short Early stays offered after the expiration so a buyback the trader
  forgot to record can still be journaled (its fill date is capped at the expiration);
  back-filling a real buyback is common. This differs from the mockup, which hides it once the
  short has expired. An expiration recorded after the close that later proves to be an assignment
  has no undo in this story (see "Follow-up edge cases").
- **Alternatives considered:** On or after the expiration day, as the wheel's US-9 (`DTE <= 0`):
  contradicts "has passed" and the mockup. Hide Close Short Early after the expiration (the
  mockup): blocks back-filling a real buyback.

### ADR: Close-early rules are one pure rule list shared by the engine and the form

- **Decision:** `pmccShortCloseIssues({ openShort, fillDate, today })` in
  `src/main/core/pmcc-rules.ts` returns the fill-date issues in this order: before the short was
  sold (`close_date_before_open`, `Fill date cannot be before the short call was sold
(2027-03-15)`), after the expiration (`close_date_after_expiration`, `Fill date cannot be after
the expiration (2027-04-16)`), in the future (`cannot_be_future`, `Fill date cannot be in the
future`). `closePmccShortEarly` checks phase → open short → cost > 0 → fees ≥ 0 → the first
  fill-date issue. The form schema (`src/renderer/src/schemas/close-pmcc-short.ts`) adds the same
  issues per field. The fees message is a shared constant, `FEES_NOT_NEGATIVE` = `Fees cannot be
negative.` (US-120's text).
- **Why:** The AC table rejects 2027-04-17 with the expiration message although it is also after
  the 2027-04-02 valuation date, so the expiration rule must win. US-101 / US-104 already share
  their rules this way (spec ADR
  [pmcc-validation-pure-engine-mirrored-by-form-schema](../../docs/spec/architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md)).
  The messages name the bound's date because the trader cannot see the sale date while typing.
- **Alternatives considered:** Reuse US-104's `pmccShortRollIssues` messages ("…the short call open
  date"): different text from this story's AC. Zod `.positive()` on the payload: the IPC would
  answer with Zod's text, not the AC's; the engine owns the bounds (US-101 precedent), so the
  payload schema checks types only.

### ADR: The closing-price advisory reads one daily bar through a new `market-data:stock-close` channel

- **Decision:** `market-data:stock-close` `{ ticker, date }` → `{ ok: true, close: string | null
}`, served by `fetchStockClose(provider, ticker, date)` in `src/main/services/market-data.ts`,
  which calls `getStockDailyBars({ symbol: ticker, start: date, end: date })` and returns the
  bar's `close` (4 dp) or `null` on no bar, a provider error or an unconfigured provider (logged,
  never thrown). The expiration sheet asks for the expiration day's close. A close **at or above**
  the strike shows the gold `AlertBox variant="warning"` `XYZ closed at $114.30 on 2027-07-16, at
or above the $112.00 strike — this call may have been assigned. Check with your broker; if it
was, record an assignment instead.`; a known close below the strike shows the muted line `XYZ
closed at $104.20 on 2027-07-16 — below the $112.00 strike. Confirm with your broker that this
call was not assigned.` (the mockup's wording); no close shows the muted `Confirm with your
broker that this call was not assigned`. Confirm is never disabled by it. The warning text
  **deviates from the Linear AC** (`closed above $112.00 … likely assigned. Record an assignment
instead.`); Linear is being updated to match. No near-strike band (a warning for a close just
  under the strike) is in scope: John's call, not requested. Resolved (options-expert review, John
  approved 2026-11-22; open question 6).
- **Why:** The close on a past day is a market fact (CLAUDE.md: "facts about the market belong
  on `MarketDataProvider`"), and the daily-bar call already exists for IV history. The story's
  "US-32's quote path" is a live quote, which is not the expiration-day close once that day has
  passed. "At or above" follows the story's UI notes: a call pinned at the strike is the
  ambiguous case the advisory exists for. The AC's "closed above $112.00" is false at a close of
  exactly $112.00, and "likely assigned" claims what only the broker knows (the journal cannot
  see exercise), so the warning states the close, says the call _may_ have been assigned and sends
  the trader to the broker. The story's two named channels write; this third one only reads and is
  not part of either write path.
- **Alternatives considered:** The live stock quote (`market-data:stock-quotes`): wrong price on
  any day after the expiration. Look the close up inside `positions:get`: adds a provider call to
  every detail load for a sheet that is rarely open. Strictly above: misses the pin case. The AC's
  "closed above … likely assigned" text: false at exactly the strike. A near-strike band: not
  requested.

### ADR: The service result carries the retired cycle, computed by the same fold as the preview

- **Decision:** Both services return `cycle: PmccRetiredCycle | null` — number, outcome, net per
  share and total, `percentOfMax`, `rollCount`, `daysHeld`, `endedOn` — from `retireCycle` over the open cycle
  `findOpenCycle` picks out of the pre-write timeline (`getPositionDetail(db, id, { valuationDate:
today })`). The success state renders it with no refetch, and the INFO log carries it. `null`
  only when no timeline cycle holds the open short (a leg history the ledger cannot attribute);
  the sheet then shows `—` for the cycle figures.
- **Why:** "INFO when a short is expired or closed, with the cycle net", and the success state
  "shows the cycle's outcome and net". The renderer's preview and the service then compute the net
  with one function from the same inputs, so the success state equals the preview.
- **Alternatives considered:** Rebuild the timeline after the write and read the ended cycle: a
  second full fold for the same number. Leave the success figures to a refetch of `positions:get`:
  the sheet would flash stale figures.

### ADR: Rolled and losing cycles in the retire sheets

- **Decision:** `% of max` keeps max = the cycle's net credit before it is retired (opening credit
  ± roll nets). For an unrolled cycle (`rollCount === 0`) the label stays the AC's: `of max` on
  the expiration sheet, `of max captured` on the close-early sheet and its success state. For a
  rolled cycle (`rollCount > 0`) the same figure is labelled `of cycle net credit` / `of cycle net
credit captured`. When the retired net is below zero, `percentOfMax` is `null` and the line shows
  only the loss (no percentage). On a rolled cycle the expiration sheet's `This cycle · N` card
  shows the expiring contract — its strike, expiration and the `ROLL_TO` leg's sale — and a second
  line `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share`, not the cycle's opening sale.
  The close-early sheet's `Current short call` card keeps showing the current short leg (the
  `ROLL_TO`), whose fill date is the close's lower bound. `PmccRetiredCycle` carries `rollCount`
  so the success state picks the same label as the preview. Resolved (options-expert review, John
  approved 2026-11-22; open questions 5 and 10).
- **Why:** Max as the cycle net is campaign-correct, but on a rolled cycle "of max" reads as the
  premium of the contract being retired; naming it "cycle net credit" says what it is. A negative
  percentage of a credit means nothing to a trader; the loss figure is the information. The
  trader is retiring the contract that expires, so the card shows that contract and sums the
  cycle up in one line. Switching the label on `rollCount` keeps every AC literal (cycles 5 and 8
  are unrolled) — the least disruptive consistent choice.
- **Alternatives considered:** `of cycle net credit` on every cycle: rewrites every AC literal.
  Max = the current contract's premium: ignores the roll's debit or credit. A negative percent on
  a losing cycle (the earlier default). The opening sale on the expiration card (the earlier
  default): shows a contract the trader no longer holds.

### ADR: Header actions stay in `PositionDetailActions` and the badge reads coverage, not the phase

- **Decision:** `PositionDetailActions` gains `Close Short Early →` (`close-pmcc-short-early-btn`,
  PMCC with an open short) and `Record Expiration →` (`record-pmcc-expiration-btn`, PMCC with an
  open short whose expiration has passed), next to `Roll Short Call →`. Its `PhaseBadge` gets
  `label={pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })}` for a PMCC, with `pmccCoverageLabel` extracted from the
  card's private `stateLabel` into `src/renderer/src/lib/pmcc-coverage.ts` and used by both.
- **Why:** US-118's action map is not built ("until it lands they sit where US-101's header puts
  PMCC actions"). The AC "the position reads `LEAPS open · no short call`" is false on the detail
  page today because the badge reads `PHASE_LABEL.PMCC_OPEN`; one label function keeps the card
  and the header in step, and US-115 / US-120 read the same function.
- **Alternatives considered:** Build `pmccActionsFor` now: that is US-118's scope. A new
  `PHASE_LABEL` entry: there is no new phase.

### ADR: `Sell Short Call →` and its sheet belong to US-115; this story only points at them

- **Decision:** The header button `Sell Short Call →` (`sell-pmcc-short-btn`, PMCC with an open
  LEAPS and no open short) and the sheet-state handler `handleSellPmccShort` in
  `usePositionDetailSheets` are US-115's. The success state's `Sell the next short call →` calls
  `onSellNextShort`, which closes this sheet and calls `handleSellPmccShort`. If US-115 has not
  merged when Area 11 is implemented, Area 11 adds the button and the `sellPmccShortOpen` sheet
  state with those names, and US-115 adds only its sheet. Assumption (pending John).
- **Why:** The two stories are planned in parallel and US-115 is "not blocking" here; fixed names
  let whichever lands first create the plumbing without a merge conflict over two buttons. The
  two e2e cases that open US-115's sheet depend on US-115's Green.
- **Alternatives considered:** A placeholder sheet in US-119: dead UI. Leave the CTA out until
  US-115: fails this story's success-state AC.

### ADR: The expiration sheet is a confirmation, not a form

- **Decision:** `PmccExpirationSheet` has no inputs and so no React Hook Form instance: a
  `Confirm Expiration` button runs the `useExpirePmccShort` mutation with `{ positionId }`. The
  close-early sheet is a full RHF + `zodResolver` form with `useWatch` driving the Net card.
- **Why:** The expiration date is fixed to the contract (AC) and nothing else is entered; an RHF
  form with no fields would be ceremony. CLAUDE.md's rule is about entered form state, and there is
  none.
- **Alternatives considered:** A hidden-field form: adds a schema that validates nothing.

### ADR: Alert closure stays ledger-driven; US-106's S6 e2e moves to the production path

- **Decision:** No change to `evaluate-alerts.ts`. US-106's e2e "A PMCC with no open short call is
  not evaluated" (`e2e/pmcc-assignment-risk-alert.spec.ts`) stops calling
  `_test:pmcc-record-leg-event` and instead buys the short back through the `Close Short Early →`
  sheet, then asserts the open `PMCC_ASSIGNMENT_RISK` alert resolves on the next evaluation.
- **Why:** Comment items 1–3 on OPT-25. That harness runs on the real clock with an unexpired
  short, so `Record Expiration →` is not offered there; a buyback is the production path that
  harness can reach. One test covers "recording through the real UI/IPC resolves the alert"
  instead of a duplicate in this story's spec.
- **Alternatives considered:** A new alert test in `pmcc-retire-short-call.spec.ts`: duplicates
  S6 and leaves S6 on the test hook. A date-based "expired ⇒ closed" rule in the alert service:
  forbidden by the comment.

### ADR: Payload money is a number named like US-104's, bounds checked by the engine

- **Decision:** `ClosePmccShortPayloadSchema` = `{ positionId, costToClosePerContract: z.number(),
fillDate: IsoDateSchema.optional(), fees: z.number().optional() }`; the service converts with
  `money4`. `costToClosePerContract` is the per-share price, as in US-104's roll payload (the
  "PerContract" suffix is the codebase's name for the per-share premium column).
  `ExpirePmccShortPayloadSchema` = `{ positionId }`.
- **Why:** Same names as the roll sheet the trader already uses, so `useRollSheetSubmit`'s
  server-error routing lands errors on the input of the same name. Bounds stay in the engine so the
  IPC returns the AC's messages.
- **Alternatives considered:** `costToClosePerShare`: clearer, but a second spelling for the same
  column. 4-dp string money (US-115 / US-120's notes): the shipped PMCC payloads all send numbers.

### ADR: Storage-failure e2e uses a read-only DB file

- **Decision:** As US-101: after the sheet is filled, `chmod 0o444` the temp DB (and `-wal` /
  `-shm`), confirm, assert `Could not record the close. Your entries are preserved. Try again.`,
  restore permissions in `afterEach`, then assert no `SHORT_CALL_CLOSE` leg, no new snapshot and a
  `$16.35` Cost basis cell.
- **Why:** A real failure through the real transaction; atomicity is observed, not mocked.
- **Alternatives considered:** A test-only fail-next-write IPC: leaks test control into the
  service.

## Open Questions

Each has a default the plan is built on, so the plan is complete. Questions 1–6, 8 and 10 were
settled by the options-expert review of the US-119 open questions; 7 and 9 are engineering calls
left as they stand.

1. **Cycle 5 effective share cost.** The AC said "Effective share cost after: $101.90 (from
   $101.35)", which is the $85 LEAPS strike. On 2027-04-02 the Background's open LEAPS is the $80
   (rolled to $85 on 2027-07-09), so the ledger gives **$96.35 → $96.90**. The unit, component
   and e2e tests assert `$96.90 (from $96.35)`; the cost-basis figures `$16.35 → $16.90` are
   asserted as written. _Resolved: confirmed by options-expert; Linear AC corrected._
2. **"The LEAPS-only phase US-101 named."** The Linear Technical Notes and US-101's ADR expect a
   `PMCC_LEAPS_ONLY` phase. _Resolved (options-expert review, John approved 2026-11-22):_ none is
   added — "uncovered LEAPS" is a coverage state, and a phase cannot express "1 of 3 covered"
   (ADR "Coverage is derived from open legs"); `PMCC_LEAPS_ONLY` is retired and the Technical Note
   is reworded in Linear.
3. **When `Record Expiration →` appears.** _Resolved (options-expert review, John approved
   2026-11-22):_ strictly after the expiration date (2027-07-17 for a 2027-07-16 short), not on
   expiration Friday itself — exercise and assignment are not known until after the close. Voiding
   an expiration that turns out to be an assignment is a follow-up (below).
4. **`Close Short Early →` after the expiration has passed.** The mockup hides it. _Resolved
   (options-expert review, John approved 2026-11-22):_ it stays while the ledger has an open
   short, with the fill date capped at the expiration, so a forgotten buyback can be journaled.
5. **"% of max" for a rolled cycle.** _Resolved (options-expert review, John approved
   2026-11-22):_ max is the cycle's net before it is retired (opening credit ± roll nets), as the
   mockup computes it; on a rolled cycle the figure is labelled `of cycle net credit`; no
   percentage is shown when the retired net is below zero (only the loss) or when max is zero or
   negative (ADR "Rolled and losing cycles in the retire sheets").
6. **Advisory threshold and wording.** _Resolved (options-expert review, John approved
   2026-11-22):_ "at or above" the strike (UI notes) rather than the AC's "above"; the warning
   reads `XYZ closed at $X on DATE, at or above the $112.00 strike — this call may have been
assigned. Check with your broker; if it was, record an assignment instead.` This deviates from
   the Linear AC text, and Linear is being updated to match. A known close below the strike shows
   the mockup's muted line. The optional near-strike band is not in scope (John's call, not
   requested).
7. **Failed expiration save.** The story gives only the close message. _Assumption (pending
   John):_ `Could not record the expiration. Try again.` (there are no entries to preserve).
8. **Fees on a buyback.** The AC is silent on fee validation. _Resolved (options-expert review,
   John approved 2026-11-22):_ fees ≥ 0, default $0, with US-120's `Fees cannot be negative.`;
   the fee rides on the `SHORT_CALL_CLOSE` leg and raises the basis like any other leg fee.
9. **`Sell Short Call →` before US-115 merges.** _Assumption (pending John):_ see ADR "`Sell Short
Call →` and its sheet belong to US-115"; the two e2e cases that open its sheet wait for US-115.
10. **Which sale the sheets show for a rolled cycle.** _Resolved (options-expert review, John
    approved 2026-11-22):_ the expiration sheet's `This cycle` card shows the expiring contract's
    terms (strike, expiration, the `ROLL_TO` leg's sale) plus `opened DATE · rolled N× · cycle
net`, not the cycle's opening sale; the close-early sheet's `Current short call` card shows
    the current short leg (the roll's `ROLL_TO`), whose fill date is the close's lower bound (ADR
    "Rolled and losing cycles in the retire sheets").

## Follow-up edge cases (out of scope)

- **Voiding or correcting a recorded expiration that later turns out to be an assignment.** An
  expiration recorded after the close can prove wrong when the broker reports the assignment
  (often the Monday after). This story writes the `SHORT_CALL_EXPIRED` leg and snapshot with no
  undo, and no story owns a void / correct path yet (options-expert review, Q3). Until one does,
  the advisory sends the trader to the broker before confirming.
