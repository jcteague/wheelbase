# US-119 — Retire the PMCC short call — record expiration or close early — Tasks

Plan: `plans/us-119/plan.md` (area numbers below match it). Story: Linear
[OPT-25](https://linear.app/optionswheel/issue/OPT-25). Read `research.md`, `data-model.md` and
`contracts/` before starting an area.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Every expected value in a test is a literal from `plan.md` or `data-model.md` § 9, never the
  output of the function under test
- `better-sqlite3` ABI: run `pnpm rebuild:node` before Vitest work and `pnpm rebuild:electron`
  before Layer 8. Do not run a Vitest agent and an e2e agent at the same time
- Open question 1 (`research.md`, resolved: confirmed by options-expert; Linear AC corrected):
  assert `$96.90 (from $96.35)` for the cycle-5 effective share cost
- Open questions 5, 6 and 10 (resolved): the closing-price warning reads `XYZ closed at $X on
DATE, at or above the $112.00 strike — this call may have been assigned. Check with your broker;
if it was, record an assignment instead.`; a rolled cycle labels its % `of cycle net credit` and
  its expiration card shows the expiring contract; a losing cycle shows no percentage

Shared files to watch when areas run in parallel:

| File                                                         | Areas                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `src/main/core/test-fixtures/arbitraries.ts`                 | 1 and 2 (both Layer 1 — add arbitraries in separate blocks) |
| `src/main/schemas.ts`                                        | 4 only; 6 reads it                                          |
| `src/preload/index.ts`, `index.d.ts`                         | 7 only (both positions and market-data methods)             |
| `src/renderer/src/lib/pmcc-roll.ts`                          | 8 only                                                      |
| `e2e/pmcc-timeline-helpers.ts`, `e2e/pmcc-retire-helpers.ts` | 13 then 14 (sequential)                                     |

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Core engine: the shared cycle fold

- [ ] **[Red]** Write failing tests — `src/main/core/pmcc-cycle.test.ts`
  - Test cases (full list in `plan.md` Area 1 Red):
    - `cycleNet`: cycle 5 sale `2.2000`/`220.0000`; with the 0.55 buyback `1.6500`/`165.0000`; with a $1.00 fee `1.6400`/`164.0000`; cycle 2 `1.2000`/`120.0000`
    - `cycleDaysHeld`: `24` (2027-06-22 → 07-16), `18` (2027-03-15 → 04-02), `0` same day
    - `percentOfMaxCaptured`: `'75.0000'`, `'100.0000'`, `'0.0000'` for a zero net; `null` for a losing net (`-90.0000` of `220.0000`) and for max `0` and negative
    - `retireCycle`: cycle 8 EXPIRED literal (`rollCount: 0`); cycle 5 CLOSED at 0.55 and at 3.10 (`percentOfMax: null`); rolled cycle 2 CLOSED at 0.30 (`'75.0000'`, `rollCount: 1`, 38 days)
    - `findOpenCycle`: cycle 8 `UNRECORDED` on the cut Background at 2027-07-19; cycle 9 `OPEN` on the full Background; `null` for an `ENDED` cycle's contract
    - `pmcc-timeline.test.ts` passes unchanged (regression gate for the extraction)
  - Property cases — `src/main/core/pmcc-cycle.property.test.ts`: fold law `extendCycleNet(cycleNet(cs), c) = cycleNet([...cs, c])`; `netTotal = netPerShare × shares` and order independence; zero contribution keeps the net and yields `100.0000`; `0 ≤ percentOfMaxCaptured ≤ 100` when `0 < max`, `0 ≤ net ≤ max`, and `null` iff `max ≤ 0` or `net < 0`; `cycleDaysHeld` oracle against `differenceInCalendarDays`
  - Add `pmccCycleNet` and `shortCallTerms` arbitraries to `src/main/core/test-fixtures/arbitraries.ts`
  - Run `pnpm test src/main/core/pmcc-cycle` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/core/pmcc-cycle.ts`, `src/main/core/pmcc-timeline.ts` _(depends on: Area 1 Red ✓)_
  - Types per `data-model.md` § Type Design: `PmccCycleNet` (`Pick` of `PmccCycleCommon`), `PmccRetireOutcome` (`Extract` of `PmccShortOutcome`), `PmccRetiredCycle<O>` (intersection of `Pick` slices incl. `rollCount`, with `outcome: O`, `percentOfMax`)
  - `cycleNet`, `extendCycleNet`, `cycleDaysHeld`, `percentOfMaxCaptured`, `findOpenCycle` (returns `Extract<PmccCycle, { status: 'OPEN' | 'UNRECORDED' }> | null`), `retireCycle` — signatures in `data-model.md` § 3
  - `pmcc-timeline.ts`: delete `netDollars`; `toCycle` calls `cycleNet`; `cycleStatus` calls `cycleDaysHeld`
  - Run `pnpm test src/main/core/pmcc-cycle src/main/core/pmcc-timeline` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/core/pmcc-cycle.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `pnpm test:mutation --mutate src/main/core/pmcc-cycle.ts`; kill or justify survivors
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Core rules: close-early fill-date issues

- [ ] **[Red]** Write failing tests — `src/main/core/pmcc-rules.test.ts`
  - Test cases:
    - cycle 5, today 2027-04-02: `2027-03-14` → `close_date_before_open` / `Fill date cannot be before the short call was sold (2027-03-15)`; `2027-04-17` → `close_date_after_expiration` / `Fill date cannot be after the expiration (2027-04-16)` as the **first** issue; `2027-04-03` → `cannot_be_future` / `Fill date cannot be in the future`; `2027-03-15` and `2027-04-02` → none
    - fill on the expiration day with today later → none
    - `FEES_NOT_NEGATIVE.message` `Fees cannot be negative.`; `NO_OPEN_SHORT_TO_RETIRE.message` `This PMCC has no open short call to retire.`; `expirationNotPassedMessage('2027-07-16')`
  - Property cases — `src/main/core/pmcc-rules.property.test.ts`: guard (empty iff `soldOn ≤ fill ≤ min(expiration, today)`); after-expiration always first when it applies
  - Run `pnpm test src/main/core/pmcc-rules` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/core/pmcc-rules.ts` _(depends on: Area 2 Red ✓)_
  - `PmccShortCloseInput`; `PmccShortCloseField` as `Extract<keyof PmccShortCloseInput, 'fillDate'>`; `pmccShortCloseIssues(input): PmccIssue<PmccShortCloseField>[]` via `issueIf`, ordered before-open → after-expiration → future
  - `NO_OPEN_SHORT_TO_RETIRE`, `FEES_NOT_NEGATIVE`, `expirationNotPassedMessage`
  - Run `pnpm test src/main/core/pmcc-rules` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/core/pmcc-rules.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share the before-open predicate with `pmccShortRollIssues` only if identical
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Engines, wire types and renderer libs (depend on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 3 — Core engines: `expirePmccShort` and `closePmccShortEarly`

**Requires:** Area 2 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases:
    - expire cycle 8 at 2027-07-19 → `{ phase: 'PMCC_OPEN', openShort: <same ref>, fillDate: '2027-07-16' }`; at 2027-07-16 and 2027-07-15 → `expiration` / `too_early` / `Cannot record expiration until after the expiration date (2027-07-16)`
    - close cycle 5 at 0.5500 / fees 0 / fill 2027-04-02 → accepted; 3.1000 accepted
    - both: `openShort: null` → `__root__` / `no_open_short_call`; `CC_OPEN`, `CSP_OPEN` → `__phase__` / `invalid_phase` first
    - close: cost `0.0000`, `-0.5000` → `costToClosePerContract` / `must_be_positive` / `Cost to close must be greater than zero`; fees `-1.0000` → `fees` / `must_not_be_negative`; each Area 2 fill-date row; cost `0` with a bad date reports cost first
  - Property cases — `src/main/core/lifecycle.property.test.ts`: expire accepts iff `referenceDate > expiration`; accepted results return `PMCC_OPEN` and the input short by reference; close accepts any positive cost with an in-window fill
  - Run `pnpm test src/main/core/lifecycle` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 3 Red ✓)_
  - `ExpirePmccShortInput<S>` / `ExpirePmccShortAccepted<S>` and `ClosePmccShortEarlyInput<S>` / `ClosePmccShortEarlyAccepted<S>`, generic over `S extends PmccShortCallTerms`, narrowing `openShort` to `S` (`data-model.md` § 1)
  - `expirePmccShort<S>(input)`: `requirePmccOpenPhase` → null short → `referenceDate <= expiration` throws `too_early`
  - `closePmccShortEarly<S>(input)`: phase → null short → `requirePositiveDecimal(cost, 'costToClosePerContract', 'Cost to close')` → fees → `throwIssue(first pmccShortCloseIssues issue)`
  - No I/O, no logging
  - Run `pnpm test src/main/core/lifecycle` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider `requireOpenShort<S>` shared with `rollPmccShortCall`
  - `pnpm test:mutation --mutate src/main/core/lifecycle.ts` (new functions)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Schemas: payloads and results

**Requires:** Area 1 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/schemas.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases: `ClosePmccShortPayloadSchema` accepts cost 0.55 with and without `fillDate`/`fees`, and cost 0 (engine owns bounds); rejects non-UUID id, string cost, `04/02/2027`; `ExpirePmccShortPayloadSchema` accepts `{ positionId }`; `GetStockClosePayloadSchema` rejects empty ticker and bad date; `expectTypeOf` checks on `ExpirePmccShortResult['leg']['action']`, `ClosePmccShortResult['snapshot']['triggerEvent']`, `ExpirePmccShortResult['cycle']`
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 4 Red ✓)_
  - Schemas and `z.infer` types (`data-model.md` § 5); `RetirePmccShortResultBase<Role, Action, Trigger, Outcome>` with `snapshot: AppendPmccSnapshotResult<Trigger>['snapshot']`; `ExpirePmccShortResult`, `ClosePmccShortResult`; `StockCloseResult`; ticker bound `MAX_TICKER_LENGTH`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8 — Renderer libs: coverage label, retire preview and advisory

**Requires:** Area 1 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-coverage.test.ts`, `src/renderer/src/lib/pmcc-retire.test.ts`, `src/renderer/src/lib/pmcc-roll.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases (full list in `plan.md` Area 8 Red):
    - `pmccCoverageLabel` no short / covered / `1 of 3 covered`, per US-115 Area 9; the US-108 card's state line uses it
    - `isShortExpirationPassed` on, after, before the expiration
    - `pmccCloseAdvisory`: 114.30 → `at_or_above_strike`, `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.`; 112.00 (threshold) → `at_or_above_strike` with `closed at $112.00`; 111.99 and 104.20 → `below_strike` text; `null` → `Confirm with your broker that this call was not assigned`
    - `closeEarlyPreview` cycle 5 at 0.55: `Cycle net +$1.65 / share · 75.0% of max captured`, `Cost basis after: $16.90 / share (from $16.35)`, `Effective share cost after: $96.90 (from $96.35)`; at 3.10: `Cycle net −$0.90 / share (−$90.00)` (no percentage), `losing`; rolled cycle 2 at 0.30: `Cycle net +$0.90 / share · 75.0% of cycle net credit captured`; empty / zero cost → `null`
    - copy builders: `Cycle 8 net +$2.40 / share (+$240.00) · 100% of max`; rolled `Cycle 2 net +$1.20 / share (+$120.00) · 100% of cycle net credit`; `+$1.65 / share (+$165.00) · 75.0% of max captured · 18 days held`; losing `−$0.90 / share (−$90.00) · 18 days held`; rolled `+$0.90 / share (+$90.00) · 75.0% of cycle net credit captured · 38 days held`; `shortSoldLine` `$112.00 · 2027-07-16 · sold at $2.40 · 24 days held` and rolled `$112.00 · 2026-12-18 · sold at $2.40`; `rolledCycleLine` `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share` (null for cycle 8); `$85.00 · 2028-01-21 · 186 DTE`; a null percent omits the segment
    - `pmccBasisAfter` oracle against `calculatePmccLedger`; US-104 roll preview tests unchanged
  - Run `pnpm test src/renderer/src/lib/pmcc-` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/lib/pmcc-coverage.ts`, `src/renderer/src/lib/pmcc-retire.ts`, `src/renderer/src/lib/pmcc-roll.ts`, `src/renderer/src/lib/pmcc-card-display.ts` _(depends on: Area 8 Red ✓)_
  - `pmccCoverageLabel` moved from the card's private `stateLabel` (which now delegates)
  - `PmccCloseAdvisory` discriminated union on `kind`; plain `PmccCloseEarlyPreview`; the preview calls `retireCycle` and `pmccBasisAfter` only
  - `pmccBasisAfter(ledger, contribution)` extracted from `pmccPostRollEffectiveCost`
  - `fmtPct` on the expiration line, `fmtPct1` on the close-early lines; `percentLabel(rollCount)` → `of max` / `of cycle net credit`; null percent drops the segment; U+2212 signs via `signedMoneyGrouped`
  - `shortSoldLine(cycle)` from `current` + the `ROLL_TO` sale (rolled) or `opening`; `rolledCycleLine(cycle)`
  - Run `pnpm test src/renderer/src/lib` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Services (depend on Layer 2)

> These areas can run in parallel with each other **after** their Layer 2 dependencies are complete.

### Area 5 — Services: terminal leg and snapshot in one transaction

**Requires:** Area 1 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/services/expire-pmcc-short-position.test.ts`, `src/main/services/close-pmcc-short-early-position.test.ts` _(depends on: Areas 3 and 4 Green ✓)_
  - Seed the two cut-off XYZ fixtures (`data-model.md` § 9) into `makeTestDb`
  - Test cases (full list in `plan.md` Area 5 Red):
    - expire at `today: '2027-07-19'`: the exact `SHORT_CALL_EXPIRED` row, one `PMCC_SHORT_EXPIRED` snapshot at `8.5000`, `pmccOpenLegs(...).short === null`, `positions` row byte-identical, `cycle` literal; timeline afterwards has cycle 8 `ENDED`/`EXPIRED` and `summary.open === null`
    - close at 0.55 / 2027-04-02: the exact `SHORT_CALL_CLOSE` row, snapshot `PMCC_SHORT_CLOSED` at `16.9000`, `effectiveShareCost '96.9000'`, `cycle` literal; default fill date = `today`; fees 1 → `'1.0000'` and `16.9100`
    - every rejection (LEAPS-only, `too_early`, each close rule, wheel `CC_OPEN`) leaves leg and snapshot counts unchanged
    - `appendPmccSnapshot` throwing after `insertLegRow` leaves no leg
    - INFO `pmcc_short_expired` / `pmcc_short_closed_early` with cycle net; INFO `*_rejected` with field and code; DEBUG payload / checkpoints
  - Run `pnpm test src/main/services/expire-pmcc-short src/main/services/close-pmcc-short` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/pmcc-short-retire-record.ts`, `src/main/services/expire-pmcc-short-position.ts`, `src/main/services/close-pmcc-short-early-position.ts` _(depends on: Area 5 Red ✓)_
  - `recordPmccShortRetirement(db, { positionId, leg, triggerEvent, eventDate, now })`: `insertLegRow` + `appendPmccSnapshot` in one `db.transaction`
  - `retiredCycleFor(db, positionId, openShort, outcome, endedOn, contribution, today)`: pre-write `getPositionDetail` timeline → `findOpenCycle` → `retireCycle` or `null`
  - `expirePmccShortPosition(db, positionId, payload, { today, now })` and `closePmccShortEarlyPosition(...)`: `loadPmccRollContext` → `logPmccRollRejection` around the engine → leg terms → `retiredCycleFor` → record → INFO → result. No `positions` write
  - Run `pnpm test src/main/services` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Rename `loadPmccRollContext` / `logPmccRollRejection` only if it pays for touching US-104 / US-105
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — Market data: the expiration-day close

**Requires:** Area 4 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/services/market-data.test.ts`, `src/main/ipc/market-data.test.ts` _(depends on: Area 4 Green ✓)_
  - Test cases: fake series close 114.3 on 2027-07-16 → `{ close: '114.3000' }` and the exact `getStockDailyBars` call; no bar → `null`; provider throws → `null` + one WARN `market_data_stock_close_failed`; handler `{ ok: true, close }` and the bad-date envelope
  - Run `pnpm test src/main/services/market-data.test.ts src/main/ipc/market-data.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/market-data.ts`, `src/main/ipc/market-data.ts` _(depends on: Area 6 Red ✓)_
  - `fetchStockClose(provider, ticker, date): Promise<StockCloseResult>`; `market-data:stock-close` in `registerMarketDataHandlers` via `handleIpcCall('market_data_stock_close_unhandled_error', …)`
  - Run `pnpm test src/main/services/market-data.test.ts src/main/ipc/market-data.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — IPC wiring (depends on Layer 3)

### Area 7 — IPC, preload and renderer API

**Requires:** Area 5 Green ✓, Area 6 Green ✓

- [ ] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts` _(depends on: Areas 5 and 6 Green ✓)_
  - Test cases (injected `getCurrentDate`): close 0.55 at `2027-04-02T16:00:00Z` → `ok`, fill date `2027-04-02`, basis `16.9000`; cost 0 → the `must_be_positive` envelope; expire at `2027-07-19T16:00:00Z` → `ok`, at `2027-07-16T16:00:00Z` → `too_early`; LEAPS-only → `no_open_short_call` on both channels; `2027-04-03T03:30:00Z` defaults the fill date to `2027-04-02`
  - Run `pnpm test src/main/ipc/positions.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/ipc/positions.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/api/market-data.ts` _(depends on: Area 7 Red ✓)_
  - `positions:expire-pmcc-short`, `positions:close-pmcc-short` through `registerParsedPositionHandler` with a closure passing `{ today: etDateOf(getCurrentDate()) }`
  - Preload `expirePmccShort`, `closePmccShortEarly`, `marketData.stockClose`; renderer adapters `expirePmccShort`, `closePmccShortEarly`, `getStockClose`
  - Run `pnpm test src/main/ipc` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Leave `positions:expire-cc` (US-9) on `localToday()`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Form and hooks (depend on Layers 1 and 4)

### Area 9 — Close-early form: schema and hooks

**Requires:** Area 2 Green ✓, Area 7 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/schemas/close-pmcc-short.test.ts`, hook tests beside each hook _(depends on: Areas 2 and 7 Green ✓)_
  - Test cases: the four AC rows with their exact messages on the right fields; fees `-1` → `Fees cannot be negative.`; cost 3.10 valid; form defaults `fillDate` to the passed `today` (`2027-04-02`) and fees `0.00`; mutations invalidate position / list / alerts queries; `useStockClose` returns `null` on `ok: false`
  - Run `pnpm test src/renderer/src/schemas/close-pmcc-short.test.ts src/renderer/src/hooks` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/schemas/close-pmcc-short.ts`, `src/renderer/src/hooks/useClosePmccShortEarlyForm.ts`, `useClosePmccShortEarly.ts`, `useExpirePmccShort.ts`, `useStockClose.ts` _(depends on: Area 9 Red ✓)_
  - `closePmccShortSchema(context)` with `superRefine` over `pmccShortCloseIssues`; RHF + `zodResolver`, mode `onChange`
  - Run `pnpm test src/renderer/src/schemas src/renderer/src/hooks` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Sheets (depend on Layer 5 and Area 8)

> These areas can run in parallel. Area 10 creates `PmccCoverageContextCard` and
> `PmccRetireSuccess`; Area 11 imports them, so Area 11's Green waits for Area 10's Green.

### Area 10 — Expiration sheet

**Requires:** Area 8 Green ✓, Area 9 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/PmccExpirationSheet.test.tsx` _(depends on: Areas 8 and 9 Green ✓)_
  - Test cases (full list in `plan.md` Area 10 Red): eyebrow, title, coverage card, this-cycle card and net line; no textbox or date picker; rolled cycle 2 card shows the expiring `$112.00 · 2026-12-18 · sold at $2.40` contract plus `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share` and `100% of cycle net credit`, not the 1.80 opening sale; `at_or_above_strike` warning `AlertBox` (`XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — …`) with Confirm enabled; muted no-close and below-strike lines; Confirm sends `{ positionId }` once, disabled while pending; `Could not record the expiration. Try again.`; success badge `Expired worthless`, net, `Sell the next short call →` → `onSellNextShort`, `Done` → `onClose`; `cycle: null` → `—`
  - Run `pnpm test src/renderer/src/components/PmccExpirationSheet.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/PmccExpirationSheet.tsx`, `PmccCoverageContextCard.tsx`, `PmccRetireSuccess.tsx` _(depends on: Area 10 Red ✓)_
  - Mockup `RetireShortSheet` in `expire` mode: `PmccRollSheetDialog` frame (440 px) labelled `Record Expiration`; eyebrow `RECORD EXPIRATION`; `Coverage · stays open` card; `This cycle · N` card showing the expiring contract (+ `rolledCycleLine` on a rolled cycle); advisory (`AlertBox variant="warning"` or muted line, never disabling Confirm); emphasized Net card with `Credit … moves from open to realized · basis unchanged`; footer `Cancel` · `Confirm Expiration`
  - No form; step union `{ step: 'form' } | { step: 'success'; result: ExpirePmccShortResult }`
  - Run `pnpm test src/renderer/src/components/PmccExpirationSheet.test.tsx` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 11 — Close-early sheet

**Requires:** Area 8 Green ✓, Area 9 Green ✓ (Green also needs Area 10 Green ✓)

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/ClosePmccShortEarlySheet.test.tsx` _(depends on: Areas 8 and 9 Green ✓)_
  - Test cases (full list in `plan.md` Area 11 Red): eyebrow, title, coverage card `$80.00 · 2027-09-17 · 168 DTE`, current short card (14 DTE); inputs and defaults; live preview at 0.55 (three lines) and 3.10 (loss colour + note, no percentage, Confirm enabled); each invalid row beside its field with Confirm disabled; submit payload; server field error routed; `Could not record the close. Your entries are preserved. Try again.` with values kept; success `Closed early` and the net line
  - Run `pnpm test src/renderer/src/components/ClosePmccShortEarlySheet.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/ClosePmccShortEarlySheet.tsx`, `ClosePmccShortEarlyForm.tsx`, `PmccRetireNetCard.tsx` _(depends on: Area 11 Red ✓, Area 10 Green ✓)_
  - Mockup `RetireShortSheet` in `close` mode: `PmccRollSheetDialog` labelled `Close Short Early`; eyebrow `CLOSE SHORT EARLY`; coverage + current short cards; `NumberInput` (`$`), `DatePicker`, optional Fees; `useWatch` → `closeEarlyPreview` → `PmccRetireNetCard` (emphasized); footer `Cancel` · `Confirm Close` disabled when invalid or pending; `useRollSheetSubmit` for server errors
  - Step union `{ step: 'form' } | { step: 'success'; result: ClosePmccShortResult }`; success via `PmccRetireSuccess`
  - Run `pnpm test src/renderer/src/components/ClosePmccShortEarlySheet.test.tsx` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Compare `PmccRetireNetCard` with `PmccRollNetPreview`; merge only with narrow props
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — Header and page wiring (depends on Layer 6)

### Area 12 — Header actions, coverage badge and page wiring

**Requires:** Area 8 Green ✓, Area 10 Green ✓, Area 11 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx`, page test beside `PositionDetailPage.tsx` _(depends on: Areas 10 and 11 Green ✓)_
  - Test cases: open short at 2027-07-19 → `close-pmcc-short-early-btn`, `record-pmcc-expiration-btn`, `roll-pmcc-short-btn`, no `sell-pmcc-short-btn`; at 2027-07-15 and 2027-07-16 → no `Record Expiration →`; LEAPS-only → `Sell Short Call →`, `Roll LEAPS →`, badge `LEAPS open · no short call`, none of the short actions; open short badge `LEAPS + short call open`; wheel `CC_OPEN` tests unchanged; page opens the right dialog and one sheet at a time
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx src/renderer/src/pages` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/PositionDetailActions.tsx`, `src/renderer/src/pages/usePositionDetailSheets.ts`, `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 12 Red ✓)_
  - Mockup header map (`leaps-only` preset for the no-short state); `PhaseBadge label={pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })}` for a PMCC
  - `pmccShortExpired` from `isShortExpirationPassed(short.expiration, pmccTimeline.valuationDate)`; `today = pmccTimeline.valuationDate`; open cycle via `findOpenCycle`
  - `PmccRetireSheet` (`'expire' | 'close' | null`); `onSellNextShort` → close sheet + `handleSellPmccShort` (add `Sell Short Call →` / `sell-pmcc-short-btn` / `sellPmccShortOpen` with these names if US-115 has not)
  - Run `pnpm test src/renderer` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Split PMCC sheet state into `usePmccSheets` if `usePositionDetailSheets` passes ~300 lines
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 8 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 13 — US-106 alert closure on the production path

- [ ] **[Red]** Rewrite the S6 test — `e2e/pmcc-assignment-risk-alert.spec.ts`; create `e2e/pmcc-retire-helpers.ts` _(depends on: Area 12 Green ✓)_
  - "A PMCC with no open short call is not evaluated": after the alert opens, buy the short back through `Close Short Early →` (cost 0.10, today) instead of `_test:pmcc-record-leg-event`; the next evaluation resolves `PMCC_ASSIGNMENT_RISK`
  - Run `pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts` — the rewritten test must fail before the helpers drive a real sheet (or be shown falsifiable by skipping the confirm)
- [ ] **[Green]** Make it pass _(depends on: Area 13 Red ✓)_
  - No change to `evaluate-alerts.ts`; a failure means an earlier area is incomplete
  - Run `pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review

### Area 14 — E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/pmcc-retire-short-call.spec.ts` _(depends on: all Green tasks ✓, Area 13 Green ✓)_
  - Add `VARIANTS.atCycle8Open` and `VARIANTS.atCycle5Open` to `e2e/pmcc-timeline-helpers.ts` (null patches over the Background)
  - One `it()` per AC bullet from the user story — test names must mirror AC language (assertions in `plan.md` Area 14 Red)
  - AC coverage:
    - AC-1: Record the short call expiring worthless → `it('Record the short call expiring worthless')` (2027-07-19)
    - AC-2: The expiration sheet shows what the cycle netted → `it('The expiration sheet shows what the cycle netted')`
    - AC-3: Record Expiration is offered only once the expiration has passed → `it('Record Expiration is offered only once the expiration has passed')` (2027-07-15)
    - AC-4: Expiring a short that closed in the money is turned toward assignment → `it('Expiring a short that closed in the money is turned toward assignment')` (close 114.30 via `_test:iv-series-set`; asserts `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.` — open question 6, deviates from the AC text, Linear being updated)
    - AC-4b: …when no closing price is available → `it('When no closing price is available the warning reads "Confirm with your broker that this call was not assigned"')`
    - AC-5: Buy the short call back early → `it('Buy the short call back early')` (2027-04-02; asserts `$16.90`, fails on `$16.35`)
    - AC-6: The close-early sheet previews the net before confirming → `it('The close-early sheet previews the net before confirming')`
    - AC-7: A buyback above the credit is allowed and shown as a losing cycle → `it('A buyback above the credit is allowed and shown as a losing cycle')`
    - AC-8a: Reject invalid close-early input — cost to close $0.00 → `it('Reject invalid close-early input: cost to close $0.00')`
    - AC-8b: Reject invalid close-early input — fill date 2027-03-14 → `it('Reject invalid close-early input: fill date 2027-03-14')`
    - AC-8c: Reject invalid close-early input — fill date 2027-04-17 → `it('Reject invalid close-early input: fill date 2027-04-17')`
    - AC-8d: Reject invalid close-early input — fill date 2027-04-03 → `it('Reject invalid close-early input: fill date 2027-04-03')`
    - AC-9: Reject either action when no short call is open → `it('Reject either action when no short call is open')`
    - AC-10: A failed save leaves the cycle open → `it('A failed save leaves the cycle open')` (read-only DB)
    - AC-11a: Success state points at the next cycle (expiration) → `it('Success state points at the next cycle: after an expiration')`
    - AC-11b: Success state points at the next cycle (buyback) → `it('Success state points at the next cycle: after a buyback')`
    - AC-11c: "Sell the next short call →" opens US-115's sheet → `it('"Sell the next short call →" opens US-115\'s sheet')` — red until US-115 merges
    - AC-12: The wheel is unchanged → `it('The wheel is unchanged')`
  - Run `pnpm test:e2e e2e/pmcc-retire-short-call.spec.ts` — every new test must fail for the right reason. Since Layers 1–7 are complete, a test that already passes must be shown falsifiable: break its fixture or expected literal once and confirm it fails
- [ ] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - A failure means an earlier area is incomplete; fix it there, not in the spec
  - Run `pnpm test:e2e` — all tests must pass, including `pmcc-leg-timeline`, `pmcc-short-call-roll`, `pmcc-leaps-roll`, `pmcc-cost-basis`, `close-cc-early`, `cc-expiration`
- [ ] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the variants as small patches over the one Background literal

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests, or a stated "no property" reason (Areas 1, 2, 3)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] No reproducible, non-equivalent surviving mutant in the new code of `pmcc-cycle.ts`, `pmcc-rules.ts`, `lifecycle.ts`
- [ ] E2E tests cover every AC (18 of 18; AC-11c after US-115)
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [ ] Open questions 7 and 9 in `research.md` answered by John, or the assumptions confirmed (1–6, 8 and 10 resolved by the options-expert review, John approved 2026-11-22)
- [ ] `/update-spec us-119` run before the plan directory is removed (supersedes the reserved `PMCC_LEAPS_ONLY` in US-101's ADR and `docs/spec/domain/wheel-lifecycle.md`)
