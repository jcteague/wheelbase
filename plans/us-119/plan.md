---
story: us-119
kind: feature
parent: null
topics: [pmcc, lifecycle, cost-basis, ipc-handlers, market-data]
status: planned
---

# Implementation Plan: US-119 — Retire the PMCC short call — record expiration or close early

## Summary

A PMCC detail page gains two header actions, `Record Expiration →` (once the open short's
expiration has passed) and `Close Short Early →` (while a short is open). Each opens a right-hand
sheet that previews what the cycle netted, records one terminal leg (`SHORT_CALL_EXPIRED` or
`SHORT_CALL_CLOSE`) and one US-103 snapshot in a single transaction, and ends on a success state
that points at selling the next short call. The position stays `PMCC_OPEN` with only its LEAPS
open, and reads `LEAPS open · no short call`. The cycle arithmetic US-109 computes inline moves
to one shared fold that the timeline, the services and the sheets all call. Done means every
acceptance scenario passes as an e2e test, US-106's no-short alert test runs on the production
path, and the wheel's US-8 / US-9 flows are unchanged.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** Linear [OPT-25](https://linear.app/optionswheel/issue/OPT-25) (`US-119`). Linear is the source; there is no story file.
- **Mockup:** `mockups/epic-09-pmcc-position-detail.mdx` — `RetireShortSheet` (presets `expire` and `close-early`; Linear calls them `retire short`), the detail header action map, and preset `leaps-only` for the state the story leaves behind.
- **Research & Design Decisions:** `plans/us-119/research.md`
- **Data Model & Type Design:** `plans/us-119/data-model.md`
- **API Contracts:** `plans/us-119/contracts/positions-expire-pmcc-short.md`, `plans/us-119/contracts/positions-close-pmcc-short.md`, `plans/us-119/contracts/market-data-stock-close.md`
- **Quickstart & Verification:** `plans/us-119/quickstart.md`

Four decisions differ from the story's text (recorded in `research.md`; Linear is being updated
to match): no `PMCC_LEAPS_ONLY` phase is added — coverage is read from the open legs; the services
take the Eastern `today` from the handler's clock; the cycle-5 effective share cost is asserted as
`$96.90 (from $96.35)`, the value the Background's $80 LEAPS gives on 2027-04-02 (open question 1,
confirmed by the options-expert; Linear AC corrected); and the closing-price warning reads `XYZ
closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been
assigned. Check with your broker; if it was, record an assignment instead.` rather than the AC's
"closed above … likely assigned" (open question 6). On a rolled cycle the `% of max` figure is
labelled `of cycle net credit` and the expiration card shows the expiring contract; a losing
cycle shows no percentage (open questions 5 and 10).

## Prerequisites

Already on `main`:

- US-101 PMCC positions and the `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` leg roles; US-103
  `calculatePmccLedger`, `appendPmccSnapshot`, `pmccOpenLegs` and the `PMCC_SHORT_EXPIRED` /
  `PMCC_SHORT_CLOSED` trigger events; US-104 / US-105 `requirePmccOpenPhase`,
  `loadPmccRollContext`, `logPmccRollRejection`, `PmccRollSheetDialog`, `useRollSheetSubmit`;
  US-106 ledger-driven alert closure; US-108 `stateLabel`; US-109 `buildPmccTimeline`,
  `pmccTimelineFromLegs`, `outcomeLabel`, `_test:pmcc-seed-position` and
  `e2e/pmcc-timeline-helpers.ts`.
- `insertLegRow` (`src/main/services/leg-rows.ts`), `etDateOf`, `daysBetween`
  (`src/main/core/dte.ts`), `MarketDataProvider.getStockDailyBars`, the fake provider's
  `_test:iv-series-set`, `AlertBox`, `SheetPanel`, `NumberInput`, `DatePicker`.

Not required to start: US-115 (its sheet is opened by the success state; two e2e cases wait for
it) and US-118 (the header action map; until it lands the buttons sit in
`PositionDetailActions`).

No migration.

## Implementation Areas

### 1. Core engine — the shared cycle fold

**Files to create or modify:**

- `src/main/core/pmcc-cycle.ts` — new: `cycleNet`, `extendCycleNet`, `cycleDaysHeld`, `percentOfMaxCaptured`, `findOpenCycle`, `retireCycle`
- `src/main/core/pmcc-cycle.test.ts` — new
- `src/main/core/pmcc-cycle.property.test.ts` — new
- `src/main/core/pmcc-timeline.ts` — `toCycle` / `cycleStatus` call the fold instead of the private `netDollars` and inline `daysBetween`
- `src/main/core/test-fixtures/arbitraries.ts` — add `pmccCycleNet` and `shortCallTerms` arbitraries

**Red — tests to write** (`pmcc-cycle.test.ts`, literals from `data-model.md` § 9):

- `cycleNet` of cycle 5's opening sale (`SHORT`, cash `−2.20`, 100 shares) is `{ netPerShare: '2.2000', netTotal: '220.0000' }`; with the `+0.55` buyback added it is `1.6500` / `165.0000`; a `$1.00` fee on the buyback gives `1.6400` / `164.0000`.
- `cycleNet` of cycle 2 (sell 1.80, roll debit 0.60) is `1.2000` / `120.0000` — the timeline's US-109 figure.
- `cycleDaysHeld('2027-06-22', '2027-07-16')` is `24`; `('2027-03-15', '2027-04-02')` is `18`; the same day is `0`.
- `percentOfMaxCaptured('165.0000', '220.0000')` is `'75.0000'`; `('240.0000', '240.0000')` is `'100.0000'`; `('0.0000', '220.0000')` is `'0.0000'`; `('-90.0000', '220.0000')` (a losing cycle) gives `null`; a max of `'0.0000'` or `'-10.0000'` gives `null`.
- `retireCycle` for cycle 8 (`EXPIRED`, zero contribution, ended 2027-07-16) returns `{ number: 8, outcome: 'EXPIRED', netPerShare: '2.4000', netTotal: '240.0000', percentOfMax: '100.0000', rollCount: 0, daysHeld: 24, endedOn: '2027-07-16' }`; for cycle 5 closed at 0.55 on 2027-04-02 it returns `1.6500`, `165.0000`, `'75.0000'`, `18`; at 3.10 it returns `-0.9000`, `-90.0000`, `percentOfMax: null`; for rolled cycle 2 (net `1.2000` / `120.0000`, `rollCount: 1`) closed at 0.30 on 2026-11-30 it returns `0.9000`, `90.0000`, `'75.0000'`, `rollCount: 1`, `38` (`data-model.md` § 9).
- `findOpenCycle` on the Background timeline at 2027-07-19 cut before cycle 8's expiry returns cycle 8 (`UNRECORDED`) for `{ strike: '112.0000', expiration: '2027-07-16' }`; on the full Background it returns cycle 9 (`OPEN`) for its contract and `null` for cycle 8's contract (already `ENDED`).
- `buildPmccTimeline` regression: every existing `pmcc-timeline.test.ts` expectation still passes unchanged after the extraction.

**Properties** (`pmcc-cycle.property.test.ts`):

- **Oracle / fold law:** for any contributions `cs` and contribution `c`, `extendCycleNet(cycleNet(cs, n), c, n)` equals `cycleNet([...cs, c], n)`.
- **Invariant:** `cycleNet(cs, n).netTotal` equals `netPerShare × n` to 4 dp, and `cycleNet` is order-independent over `cs`.
- **Invariant:** `retireCycle` with a zero-cash, zero-fee contribution leaves `netTotal` unchanged and yields `percentOfMax = '100.0000'` whenever the max is positive.
- **Bound:** `0 ≤ percentOfMaxCaptured(net, max) ≤ 100` whenever `0 < max` and `0 ≤ net ≤ max`; `null` iff `max ≤ 0` or `net < 0`.
- **Oracle:** `cycleDaysHeld(a, b)` equals `differenceInCalendarDays(parseISO(b), parseISO(a))` for ordered days.

**Green — implementation:**

- Create `PmccCycleNet` as `Pick<PmccCycleCommon, 'netPerShare' | 'netTotal'>`, `PmccRetireOutcome` as `Extract<PmccShortOutcome, 'EXPIRED' | 'CLOSED'>` and `PmccRetiredCycle<O>` as the intersection of `Pick` slices of `PmccCycleCommon` (including `rollCount`) and the `ENDED` arm of `PmccCycle` with `outcome: O` and `percentOfMax: string | null`, all in `src/main/core/pmcc-cycle.ts` (data-model.md § Type Design).
- `cycleNet` sums `−contributionDollars(c)` (from `core/costbasis.ts`) with `decimal.js` and divides by `shares`; `extendCycleNet` adds one contribution's dollars to `netTotal` and re-divides; `cycleDaysHeld` wraps `daysBetween`.
- `findOpenCycle` returns the cycle whose `status !== 'ENDED'` and whose `current` strike and expiration equal the short's (compared with `money4`), typed `Extract<PmccCycle, { status: 'OPEN' | 'UNRECORDED' }> | null`.
- In `pmcc-timeline.ts`, delete `netDollars`; `toCycle` takes `cycleNet(contributions, ledger.shares)`; `cycleStatus` takes `cycleDaysHeld` for `ENDED` and `UNRECORDED`.

**Refactor — cleanup to consider:**

- Re-export `PmccRetiredCycle` / `PmccCycleNet` from `pmcc-timeline.ts` only if a renderer import would otherwise reach two modules for one concept.
- `pnpm test:mutation --mutate src/main/core/pmcc-cycle.ts`.

**Acceptance criteria covered:**

- "The expiration sheet shows what the cycle netted", "Buy the short call back early", "The close-early sheet previews the net", "A buyback above the credit…" (the figures); the Technical Note on one shared fold.

---

### 2. Core rules — close-early fill-date issues shared with the form

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts` — add `pmccShortCloseIssues`, `PmccShortCloseField`, `PmccShortCloseInput`, `NO_OPEN_SHORT_TO_RETIRE`, `FEES_NOT_NEGATIVE`, `expirationNotPassedMessage`
- `src/main/core/pmcc-rules.test.ts`, `src/main/core/pmcc-rules.property.test.ts`

**Red — tests to write:**

- Cycle 5 (`fillDate: '2027-03-15'`, `expiration: '2027-04-16'`, today `2027-04-02`): fill `2027-03-14` → one issue `{ field: 'fillDate', code: 'close_date_before_open', message: 'Fill date cannot be before the short call was sold (2027-03-15)' }`; `2027-04-17` → only `close_date_after_expiration`, `Fill date cannot be after the expiration (2027-04-16)` listed **first** (it is also in the future); `2027-04-03` → `cannot_be_future`, `Fill date cannot be in the future`; `2027-03-15`, `2027-04-02` → no issue.
- A fill on the expiration day with today after it (`2027-04-16`, today `2027-04-20`) → no issue.
- `FEES_NOT_NEGATIVE.message` is `Fees cannot be negative.`; `expirationNotPassedMessage('2027-07-16')` is `Cannot record expiration until after the expiration date (2027-07-16)`.

**Properties** (`pmcc-rules.property.test.ts`):

- **Guard:** for any ordered `soldOn ≤ fill ≤ min(expiration, today)`, `pmccShortCloseIssues` is empty; for any fill outside that window it is non-empty.
- **Invariant:** when the fill is after the expiration, the first issue is `close_date_after_expiration` whatever `today` is.

**Green — implementation:**

- `PmccShortCloseField` as `Extract<keyof PmccShortCloseInput, 'fillDate'>` in `src/main/core/pmcc-rules.ts` (not keyed off the lifecycle input: `lifecycle.ts` imports `pmcc-rules.ts`, so the reverse import would be a cycle); the issues are `PmccIssue<PmccShortCloseField>[]` built with the existing `issueIf` helper, in the order before-open → after-expiration → future. ISO strings compare lexically, as the existing rules do.

**Refactor — cleanup to consider:**

- If `pmccShortRollIssues` has an identical before-open check, share the predicate (not the message — the texts differ).

**Acceptance criteria covered:**

- "Reject invalid close-early input" — the three fill-date rows.

---

### 3. Core engines — `expirePmccShort` and `closePmccShortEarly`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add the two engines and their input / accepted types
- `src/main/core/lifecycle.test.ts`, `src/main/core/lifecycle.property.test.ts`

**Red — tests to write:**

- `expirePmccShort` for cycle 8 with reference date `2027-07-19` returns `{ phase: 'PMCC_OPEN', openShort: <the same object>, fillDate: '2027-07-16' }`; reference date `2027-07-16` and `2027-07-15` throw `expiration` / `too_early` / `Cannot record expiration until after the expiration date (2027-07-16)`.
- `closePmccShortEarly` for cycle 5 (cost `0.5500`, fees `0.0000`, fill `2027-04-02`, reference `2027-04-02`) returns `{ phase: 'PMCC_OPEN', openShort }`; cost `3.1000` is accepted (losing cycle).
- Both throw `__root__` / `no_open_short_call` / `This PMCC has no open short call to retire.` for `openShort: null`; both throw `__phase__` / `invalid_phase` for `CC_OPEN` and `CSP_OPEN` before looking at the short.
- `closePmccShortEarly` rejects cost `0.0000` and `-0.5000` with `costToClosePerContract` / `must_be_positive` / `Cost to close must be greater than zero`; fees `-1.0000` with `fees` / `must_not_be_negative` / `Fees cannot be negative.`; then each `pmccShortCloseIssues` row from Area 2; cost `0` with a bad fill date reports the cost first.

**Properties** (`lifecycle.property.test.ts`):

- **Guard:** for any `PmccShortCallTerms` and any reference date, `expirePmccShort` accepts iff `referenceDate > expiration`.
- **Invariant:** both engines, when they accept, return `phase: 'PMCC_OPEN'` and the input's `openShort` by reference (no copy), for any `PmccShortCallTerms` subtype.
- **Guard:** `closePmccShortEarly` accepts any positive cost (including above any credit) with an in-window fill date.

**Green — implementation:**

- Create `ExpirePmccShortInput<S>` / `ExpirePmccShortAccepted<S>` and `ClosePmccShortEarlyInput<S>` / `ClosePmccShortEarlyAccepted<S>`, generic over `S extends PmccShortCallTerms`, in `src/main/core/lifecycle.ts`; the accepted shapes narrow `openShort` to `S` and `ExpirePmccShortAccepted.fillDate` is `S['expiration']` (data-model.md § 1).
- Order: `requirePmccOpenPhase` → null short throws `NO_OPEN_SHORT_TO_RETIRE` on `__root__` → (expire) `referenceDate <= expiration` throws `too_early` / (close) `requirePositiveDecimal(cost, 'costToClosePerContract', 'Cost to close')` → fees `< 0` throws `FEES_NOT_NEGATIVE` → `throwIssue` of the first `pmccShortCloseIssues` issue. No I/O, no logging.

**Refactor — cleanup to consider:**

- `rollPmccShortCall` and the two new engines share "phase, then a non-null short"; extract `requireOpenShort<S>(openShort, message)` if it reads cleaner than three inline checks.
- `pnpm test:mutation --mutate src/main/core/lifecycle.ts` (new functions only).

**Acceptance criteria covered:**

- "Reject either action when no short call is open"; "Reject invalid close-early input" (cost row); "Record Expiration is offered only once the expiration has passed" (engine side); "A buyback above the credit is allowed".

---

### 4. Schemas — payloads and results

**Files to create or modify:**

- `src/main/schemas.ts` — `ExpirePmccShortPayloadSchema`, `ClosePmccShortPayloadSchema`, `GetStockClosePayloadSchema`, their `z.infer` types, `RetirePmccShortResultBase`, `ExpirePmccShortResult`, `ClosePmccShortResult`, `StockCloseResult`
- `src/main/schemas.test.ts`

**Red — tests to write:**

- `ClosePmccShortPayloadSchema` accepts `{ positionId: <uuid>, costToClosePerContract: 0.55, fillDate: '2027-04-02' }` and `{ positionId, costToClosePerContract: 0 }` (bounds are the engine's); rejects a non-UUID id, a string cost and `fillDate: '04/02/2027'`.
- `ExpirePmccShortPayloadSchema` accepts `{ positionId }` and strips nothing else of meaning; `GetStockClosePayloadSchema` rejects an empty ticker and a bad date.
- Type-level (`expectTypeOf`): `ExpirePmccShortResult['leg']['action']` is `'EXPIRE'`; `ClosePmccShortResult['snapshot']['triggerEvent']` is `'PMCC_SHORT_CLOSED'`; `ExpirePmccShortResult['cycle']` is `PmccRetiredCycle<'EXPIRED'> | null`.

**Green — implementation:**

- `ExpirePmccShortPayload`, `ClosePmccShortPayload`, `GetStockClosePayload` as `z.infer` of their schemas in `src/main/schemas.ts`; `RetirePmccShortResultBase<Role, Action, Trigger, Outcome>` generic base with `snapshot: AppendPmccSnapshotResult<Trigger>['snapshot']`, instantiated as `ExpirePmccShortResult` and `ClosePmccShortResult` (data-model.md § 5). The ticker bound reuses `MAX_TICKER_LENGTH`.

**Refactor — cleanup to consider:**

- None expected.

**Acceptance criteria covered:**

- Supports every write scenario (the wire shapes).

---

### 5. Services — record the terminal leg and snapshot in one transaction

**Files to create or modify:**

- `src/main/services/pmcc-short-retire-record.ts` — new: `recordPmccShortRetirement`, `retiredCycleFor`
- `src/main/services/expire-pmcc-short-position.ts` — new: `expirePmccShortPosition`
- `src/main/services/close-pmcc-short-early-position.ts` — new: `closePmccShortEarlyPosition`
- `src/main/services/expire-pmcc-short-position.test.ts`, `src/main/services/close-pmcc-short-early-position.test.ts` — new
- `src/main/services/test-fixtures/pmcc-legs.ts` — add the two cut-off XYZ fixtures (`data-model.md` § 9) if not already shared with US-109's

**Red — tests to write** (real in-memory DB via `makeTestDb`; seeded through the same leg literals as US-109):

- Expire on `atCycle8Open` with `today: '2027-07-19'`: one new `legs` row `SHORT_CALL_EXPIRED` / `EXPIRE` / `CALL` / `112.0000` / `2027-07-16` / `premium_per_contract '0.0000'` / `fill_price NULL` / `fill_date '2027-07-16'` / `fees '0.0000'`; one snapshot `PMCC_SHORT_EXPIRED` with `basis_per_share '8.5000'`; `pmccOpenLegs(...).short === null` afterwards; the `positions` row (phase and `updated_at`) is byte-identical to before; result `cycle` equals Area 1's cycle-8 literal.
- After the expire, `getPositionDetail(..., { valuationDate: '2027-07-19' }).pmccTimeline` has cycle 8 `ENDED` / `EXPIRED` and `summary.open === null`.
- Close on `atCycle5Open` with cost `0.55`, fill `2027-04-02`, `today: '2027-04-02'`: `SHORT_CALL_CLOSE` / `BUY` / `premium_per_contract = fill_price = '0.5500'` / `fill_date '2027-04-02'`; snapshot `PMCC_SHORT_CLOSED` with `basis_per_share '16.9000'`; `ledger.effectiveShareCost '96.9000'`; result `cycle` `1.6500` / `165.0000` / `'75.0000'` / `18`. Omitted `fillDate` defaults to `today`; `fees: 1` stores `'1.0000'` and gives `16.9100`.
- Rejections write nothing: a LEAPS-only PMCC (`no_open_short_call` on both services), expire at `today: '2027-07-16'` (`too_early`), every Area 3 close rule; each asserts equal `legs` and `cost_basis_snapshots` counts before and after.
- Atomicity: with `appendPmccSnapshot` forced to throw (spy on the module) after `insertLegRow`, no leg row remains.
- Logging: INFO `pmcc_short_expired` / `pmcc_short_closed_early` with `cycleNumber`, `netPerShare`, `netTotal`; INFO `pmcc_short_expire_rejected` / `pmcc_short_close_rejected` with `field` and `code`; DEBUG payload and checkpoint events (assert via the logger spy, as US-104's service test does).
- A wheel `CC_OPEN` position: both services reject with `invalid_phase` and the wheel's legs are untouched.

**Green — implementation:**

- `recordPmccShortRetirement(db, { positionId, leg, triggerEvent, eventDate, now })` runs `insertLegRow` then `appendPmccSnapshot` inside one `db.transaction`, logging DEBUG `pmcc_short_retire_leg_inserted` / `pmcc_short_retire_snapshot_appended`, and returns `{ leg, ...AppendPmccSnapshotResult<T> }`.
- `retiredCycleFor(db, positionId, openShort, outcome, endedOn, contribution, today)` reads `getPositionDetail(db, positionId, { valuationDate: today }).pmccTimeline`, calls `findOpenCycle`, and returns `retireCycle(...)` or `null`; it runs before the write.
- `expirePmccShortPosition(db, positionId, payload, { today, now = new Date().toISOString() })`: `loadPmccRollContext` → `logPmccRollRejection(positionId, 'pmcc_short_expire_rejected', () => expirePmccShort({ currentPhase, openShort: openLegs.short, referenceDate: today }))` → leg terms from the accepted `openShort` → `retiredCycleFor` with `legContribution` of the new leg → `recordPmccShortRetirement` with `PMCC_SHORT_EXPIRED` and `eventDate = accepted.fillDate` → INFO → `ExpirePmccShortResult`.
- `closePmccShortEarlyPosition`: same shell; `money4` on cost and fees; `fillDate ?? today`; engine `closePmccShortEarly`; `PMCC_SHORT_CLOSED`; DEBUG `pmcc_short_close_computed_net` with the retired cycle.
- No `positions` update in either service (research.md ADR "Coverage is derived from open legs").

**Refactor — cleanup to consider:**

- `loadPmccRollContext` / `logPmccRollRejection` now serve retirements too; rename to `loadPmccLegContext` / `logPmccRejection` only if the call sites read wrong — a rename touches US-104 / US-105.

**Acceptance criteria covered:**

- "Record the short call expiring worthless", "Buy the short call back early", "Reject either action when no short call is open", "A failed save leaves the cycle open" (atomicity), Technical Notes on logging.

---

### 6. Market data — the expiration-day close

**Files to create or modify:**

- `src/main/services/market-data.ts` — add `fetchStockClose`
- `src/main/services/market-data.test.ts`
- `src/main/ipc/market-data.ts` — register `market-data:stock-close`
- `src/main/ipc/market-data.test.ts`

**Red — tests to write:**

- `fetchStockClose(fake, 'XYZ', '2027-07-16')` with an IV series whose 2027-07-16 session closes at `114.3` returns `{ close: '114.3000' }` and calls `getStockDailyBars({ symbol: 'XYZ', start: '2027-07-16', end: '2027-07-16' })`.
- No bar for the date → `{ close: null }`; the provider throws (`ProviderError` and a plain `Error`) → `{ close: null }` and one WARN `market_data_stock_close_failed` with ticker and date.
- The IPC handler returns `{ ok: true, close: '114.3000' }`; a bad date returns `{ ok: false, errors: [{ field: 'date', ... }] }`.

**Green — implementation:**

- `fetchStockClose(provider, ticker, date): Promise<StockCloseResult>` picks the bar whose `date === date`, formats `close` with `money4`, and catches every error. Handler: `GetStockClosePayloadSchema.parse` inside `handleIpcCall('market_data_stock_close_unhandled_error', …)`.

**Refactor — cleanup to consider:**

- None expected; do not widen the provider port.

**Acceptance criteria covered:**

- "Expiring a short that closed in the money is turned toward assignment" (data side, both branches).

---

### 7. IPC, preload and renderer API

**Files to create or modify:**

- `src/main/ipc/positions.ts` — register `positions:expire-pmcc-short` and `positions:close-pmcc-short`
- `src/main/ipc/positions.test.ts`
- `src/preload/index.ts`, `src/preload/index.d.ts` — `expirePmccShort`, `closePmccShortEarly`, `marketData.stockClose`
- `src/renderer/src/api/positions.ts` — `expirePmccShort`, `closePmccShortEarly` adapters (`IpcPayload<K>` / `IpcSuccess<K>`)
- `src/renderer/src/api/market-data.ts` — `getStockClose`

**Red — tests to write** (`positions.test.ts`, registered handlers over a real DB, `getCurrentDate` injected as `new Date('2027-04-02T16:00:00Z')`):

- `positions:close-pmcc-short` with `{ positionId, costToClosePerContract: 0.55 }` returns `ok: true`, `leg.fillDate '2027-04-02'` (the injected clock's Eastern day), `ledger.basisPerShare '16.9000'`.
- `positions:close-pmcc-short` with `costToClosePerContract: 0` returns `{ ok: false, errors: [{ field: 'costToClosePerContract', code: 'must_be_positive', message: 'Cost to close must be greater than zero' }] }`.
- `positions:expire-pmcc-short` with the clock at `2027-07-19T16:00:00Z` on `atCycle8Open` returns `ok: true`; at `2027-07-16T16:00:00Z` returns the `too_early` envelope.
- Both channels on a LEAPS-only PMCC return `no_open_short_call` / `This PMCC has no open short call to retire.`.
- A clock at `2027-04-03T03:30:00Z` (still 2027-04-02 in New York) defaults the fill date to `2027-04-02`.

**Green — implementation:**

- Register both through `registerParsedPositionHandler` with a closure that passes `{ today: etDateOf(getCurrentDate()) }` to the service (research.md ADR "Dates are judged at the Eastern valuation date"). Preload methods typed `IpcResult<ExpirePmccShortResult>` / `IpcResult<ClosePmccShortResult>` / `IpcResult<StockCloseResult>`.

**Refactor — cleanup to consider:**

- If `registerParsedPositionHandler` gains an optional `today` argument instead of per-call closures, keep `positions:expire-cc` (US-9) unchanged — it keeps `localToday()`.

**Acceptance criteria covered:**

- "Reject either action when no short call is open" (both channels); the IPC envelope tests named in the Technical Notes.

---

### 8. Renderer libs — coverage label, retire preview and advisory

**Files to create or modify:**

- `src/renderer/src/lib/pmcc-coverage.ts` — new: `pmccCoverageLabel`
- `src/renderer/src/lib/pmcc-card-display.ts` — `stateLabel` delegates to `pmccCoverageLabel`
- `src/renderer/src/lib/pmcc-retire.ts` — new: `isShortExpirationPassed`, `pmccCloseAdvisory`, `closeEarlyPreview`, `expiredCyclePreview`, copy builders (`data-model.md` § 7)
- `src/renderer/src/lib/pmcc-roll.ts` — extract `pmccBasisAfter` from `pmccPostRollEffectiveCost`
- `src/renderer/src/lib/pmcc-coverage.test.ts`, `src/renderer/src/lib/pmcc-retire.test.ts`, `src/renderer/src/lib/pmcc-roll.test.ts`

**Red — tests to write:**

- `pmccCoverageLabel` per US-115 Area 9 (reuse it if US-115 landed first): `{ shortCount: 0, shortContracts: 0, leapsContracts: 1 }` `LEAPS open · no short call`; `{ 1, 1, 1 }` `LEAPS + short call open`; `{ 1, 1, 3 }` `LEAPS + short call open · 1 of 3 covered`. The US-108 card's state line uses it, as US-115 plans.
- `isShortExpirationPassed('2027-07-16', '2027-07-16')` false, `('2027-07-16', '2027-07-17')` true, `('2027-07-16', '2027-07-15')` false.
- `pmccCloseAdvisory`: close `114.3000`, strike `112.0000` → `at_or_above_strike`, `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.`; close `112.0000` (the threshold) → `at_or_above_strike`, `XYZ closed at $112.00 on 2027-07-16, at or above the $112.00 strike — …`; close `111.9900` → `below_strike`; close `104.2000` → `below_strike`, `XYZ closed at $104.20 on 2027-07-16 — below the $112.00 strike. Confirm with your broker that this call was not assigned.`; `null` → `no_close`, `Confirm with your broker that this call was not assigned`.
- `closeEarlyPreview` for cycle 5 (open cycle net `2.2000` / `220.0000`, opened 2027-03-15; ledger basis `16.3500`, strike `80.0000`, 100 shares) at cost `0.55`, fill `2027-04-02`: `previewNetLine` `Cycle net +$1.65 / share · 75.0% of max captured`; `basisAfterLine` `Cost basis after: $16.90 / share (from $16.35)`; `effectiveAfterLine` `Effective share cost after: $96.90 (from $96.35)`; `losing` false. At `3.10`: `Cycle net −$0.90 / share (−$90.00)` (no percentage), `losing` true. Rolled cycle 2 (open net `1.2000` / `120.0000`, `rollCount` 1) at `0.30`: `Cycle net +$0.90 / share · 75.0% of cycle net credit captured`. An empty or zero cost returns `null` (the card shows `—`).
- `expiredCycleNetLine` for cycle 8 `Cycle 8 net +$2.40 / share (+$240.00) · 100% of max`; for rolled cycle 2 `Cycle 2 net +$1.20 / share (+$120.00) · 100% of cycle net credit`; `closedCycleNetLine` for cycle 5 `+$1.65 / share (+$165.00) · 75.0% of max captured · 18 days held`, for cycle 5 at 3.10 `−$0.90 / share (−$90.00) · 18 days held` (no percentage), for rolled cycle 2 at 0.30 `+$0.90 / share (+$90.00) · 75.0% of cycle net credit captured · 38 days held`; `shortSoldLine` for cycle 8 `$112.00 · 2027-07-16 · sold at $2.40 · 24 days held`, for rolled cycle 2 `$112.00 · 2026-12-18 · sold at $2.40` (the `ROLL_TO` sale, not the 1.80 opening sale); `rolledCycleLine` for cycle 2 `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share`, `null` for cycle 8; `leapsContextLine` `$85.00 · 2028-01-21 · 186 DTE`; `percentOfMax: null` omits the `· N% of …` segment.
- `pmccBasisAfter` gives the same `basisPerShare` / `effectiveShareCost` as `calculatePmccLedger` over the full contribution list for cycle 5 (oracle example), and the US-104 roll preview tests still pass.

**Green — implementation:**

- `PmccCloseAdvisory` discriminated union on `kind` and the plain `PmccCloseEarlyPreview` in `src/renderer/src/lib/pmcc-retire.ts` (data-model.md § Type Design). The preview calls `retireCycle` from `src/main/core/pmcc-cycle.ts` with the projected `SHORT` contribution (`cashPerShare = cost`, `fees`) and `pmccBasisAfter` for the basis and effective cost; no arithmetic beyond those calls and formatting.
- `% of max` uses `fmtPct` (whole) on the expiration sheet and `fmtPct1` on the close-early sheet, as the AC shows. One private `percentLabel(rollCount)` picks `of max` (`rollCount === 0`, the AC's wording) or `of cycle net credit` (rolled), with `captured` appended on the close-early lines; a `null` `percentOfMax` drops the segment (research.md ADR "Rolled and losing cycles in the retire sheets"). Signs via `signedMoneyGrouped` (U+2212).
- `shortSoldLine(cycle)` reads the expiring contract from the timeline cycle: `current` strike and expiration, and the sale of the last `ROLL` row's `to` fill (the `ROLL_TO` leg) when `rollCount > 0`, else `opening`; `rolledCycleLine(cycle)` returns `opened {openedOn} · rolled {rollCount}× · cycle net {netPerShare} / share` or `null`.

**Refactor — cleanup to consider:**

- Keep every string in the copy builders so components hold no literals but labels.

**Acceptance criteria covered:**

- "The expiration sheet shows what the cycle netted", "Expiring a short that closed in the money…", "The close-early sheet previews the net", "A buyback above the credit…", "the position reads `LEAPS open · no short call`"; open questions 5, 6 and 10 (rolled-cycle label and card, losing cycle, warning wording).

---

### 9. Close-early form — schema and hook

**Files to create or modify:**

- `src/renderer/src/schemas/close-pmcc-short.ts` — new: `closePmccShortSchema(context)`
- `src/renderer/src/schemas/close-pmcc-short.test.ts`
- `src/renderer/src/hooks/useClosePmccShortEarlyForm.ts` — new
- `src/renderer/src/hooks/useClosePmccShortEarly.ts`, `src/renderer/src/hooks/useExpirePmccShort.ts`, `src/renderer/src/hooks/useStockClose.ts` — new

**Red — tests to write:**

- With context `{ openShort: { fillDate: '2027-03-15', expiration: '2027-04-16' }, today: '2027-04-02' }`: cost `''` and `'0'` → `Cost to close must be greater than zero` on `costToClosePerContract`; fill `2027-03-14` / `2027-04-17` / `2027-04-03` → the three AC messages on `fillDate`; fees `-1` → `Fees cannot be negative.`; cost `3.10` valid.
- `useClosePmccShortEarlyForm` defaults `fillDate` to the passed `today` (`2027-04-02`, not the real clock) and `fees` to `'0.00'`; mode `onChange`.
- `useClosePmccShortEarly` / `useExpirePmccShort` invalidate the position, positions list and alerts queries on success (as `usePositionMutation` does).
- `useStockClose('XYZ', '2027-07-16', { enabled })` returns `null` on an `ok: false` envelope.

**Green — implementation:**

- Schema mirrors `roll-pmcc-short-call.ts`: `moneySchema` / `isoDateSchema` from `schemas/common.ts`, `superRefine` adds `pmccShortCloseIssues` issues per field and the engine's cost / fees messages. Form values via `z.input`, submit values via `z.output`. RHF + `zodResolver` (CLAUDE.md).

**Refactor — cleanup to consider:**

- Share the cost / fees value parsing with `roll-pmcc-short-call.ts` if both define the same `inputToNumber` pipeline.

**Acceptance criteria covered:**

- "Reject invalid close-early input" (all four rows, renderer side).

---

### 10. Expiration sheet

**Files to create or modify:**

- `src/renderer/src/components/PmccExpirationSheet.tsx` — new
- `src/renderer/src/components/PmccCoverageContextCard.tsx` — new (shared with Area 11)
- `src/renderer/src/components/PmccRetireSuccess.tsx` — new (shared with Area 11)
- `src/renderer/src/components/PmccExpirationSheet.test.tsx`

**Red — tests to write** (Testing Library, `window.api` mocked):

- Renders eyebrow `RECORD EXPIRATION`, title `XYZ $112.00 call · 2027-07-16`; the `Coverage · stays open` card `$85.00 · 2028-01-21 · 186 DTE`; the `This cycle · 8` card `$112.00 · 2027-07-16 · sold at $2.40 · 24 days held` and `Cycle 8 net +$2.40 / share (+$240.00) · 100% of max`; the expiration date shown as text with no input or date picker (`queryByRole('textbox')` null).
- Rolled cycle 2 (`rollCount` 1, the `data-model.md` § 9 literal): the `This cycle · 2` card shows `$112.00 · 2026-12-18 · sold at $2.40` and `opened 2026-10-23 · rolled 1× · cycle net +$1.20 / share`, not the `$108.00` opening sale (`queryByText(/sold at \$1\.80/)` null, with the card's `$112.00` line as the positive control); the net line ends `· 100% of cycle net credit`.
- Close `114.3000` → an `AlertBox` with `role="alert"`, the gold warning class and the `at_or_above_strike` text `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.`; `Confirm Expiration` enabled.
- Close `null` → the muted line `Confirm with your broker that this call was not assigned`, no `AlertBox`; Confirm enabled. Close `104.2000` → the below-strike muted line.
- Confirm calls `expirePmccShort({ positionId })` once; while pending the button is disabled; an `ok: false` `internal_error` shows `Could not record the expiration. Try again.` in a danger `AlertBox` and keeps the sheet on the form.
- Success shows the `Expired worthless` badge, `Cycle 8 net +$2.40 / share (+$240.00)`, `Sell the next short call →` and `Done`; `Done` calls `onClose`; `Sell the next short call →` calls `onSellNextShort`. With `cycle: null` the net reads `—`.

**Green — implementation:**

- Follow the mockup's `RetireShortSheet` in `expire` mode (preset `expire`): `PmccRollSheetDialog` frame (440 px `SheetPanel`, portal, Escape, focus trap) labelled `Record Expiration`; eyebrow, title; `PmccCoverageContextCard` (LEAPS, Expires, DTE — read-only, "stays open"); a `This cycle · N` card showing the expiring contract (`shortSoldLine`: strike, expiration, sale price — the `ROLL_TO` leg's on a rolled cycle — and days held on an unrolled one; plus `rolledCycleLine` on a rolled cycle; research.md ADR "Rolled and losing cycles in the retire sheets"); the advisory from `useStockClose` + `pmccCloseAdvisory` (`AlertBox variant="warning"` for `at_or_above_strike`, muted `wb-text-muted` line otherwise, never disabling Confirm); the emphasized Net card with the credit line `Credit … moves from open to realized · basis unchanged` from the mockup; footer `Cancel` · `Confirm Expiration`.
- No form: Confirm runs `useExpirePmccShort` (research.md ADR "The expiration sheet is a confirmation").
- Sheet step union `{ step: 'form' } | { step: 'success'; result: ExpirePmccShortResult }` in local state; `PmccRetireSuccess` shows `outcomeLabel(result.cycle.outcome)` as a `Badge` (positive tone), the net, `Sell the next short call →` (primary) and `Done`.
- Props: `ticker`, `openShort`, `leaps`, `cycle` (the timeline's open cycle), `today` (`pmccTimeline.valuationDate`), `onClose`, `onSellNextShort`.

**Refactor — cleanup to consider:**

- Keep `PmccExpirationSheet` under ~150 lines by leaving the cards in their own components.

**Acceptance criteria covered:**

- "The expiration sheet shows what the cycle netted", "Expiring a short that closed in the money…" (both branches), "Success state points at the next cycle" (expiration), the expiration failure message.

---

### 11. Close-early sheet

**Files to create or modify:**

- `src/renderer/src/components/ClosePmccShortEarlySheet.tsx` — new
- `src/renderer/src/components/ClosePmccShortEarlyForm.tsx` — new
- `src/renderer/src/components/PmccRetireNetCard.tsx` — new
- `src/renderer/src/components/ClosePmccShortEarlySheet.test.tsx`

**Red — tests to write:**

- Renders eyebrow `CLOSE SHORT EARLY`, title `XYZ $114.00 call · 2027-04-16`, the Coverage card (`$80.00 · 2027-09-17 · 168 DTE`), the `Current short call` card (sold 2027-03-15 at $2.20, expires 2027-04-16, 14 DTE); inputs `Cost to close / share` (`$`prefix),`Fill date`defaulting to`2027-04-02`, `Fees`defaulting to`$0.00`.
- Typing `0.55` updates the Net card live: `Cycle net +$1.65 / share · 75.0% of max captured`, `Cost basis after: $16.90 / share (from $16.35)`, `Effective share cost after: $96.90 (from $96.35)`.
- Typing `3.10`: `Cycle net −$0.90 / share (−$90.00)` and no `% of` text in the Net card, with the loss-colour class (`text-wb-red`), the note `Buying back above the credit collected — this cycle nets a loss` in a warning `AlertBox`, `Confirm Close` enabled.
- Each invalid AC row shows its message beside the field (`aria-describedby`) and disables `Confirm Close`.
- Confirm sends `{ positionId, costToClosePerContract: 0.55, fillDate: '2027-04-02', fees: 0 }`; a server field error lands on its input via `useRollSheetSubmit`; `internal_error` shows `Could not record the close. Your entries are preserved. Try again.` and keeps the typed values.
- Success: `Closed early` badge, `+$1.65 / share (+$165.00) · 75.0% of max captured · 18 days held`, `Sell the next short call →`, `Done`.

**Green — implementation:**

- Follow `RetireShortSheet` in `close` mode (preset `close-early`): `PmccRollSheetDialog` labelled `Close Short Early`; `PmccCoverageContextCard`; a `Current short call` card from the current short leg (the `ROLL_TO` leg on a rolled cycle — unchanged by open question 10); `ClosePmccShortEarlyForm` (RHF via `useClosePmccShortEarlyForm`, `NumberInput` with `$` prefix, `DatePicker`, optional Fees) with `useWatch` feeding `closeEarlyPreview` into `PmccRetireNetCard` (emphasized card: cycle net, % of max captured, cost basis after from → to, effective share cost after from → to; loss colour + note when `losing`); footer `Cancel` · `Confirm Close` disabled while the form is invalid or pending.
- Step union `{ step: 'form' } | { step: 'success'; result: ClosePmccShortResult }`; success reuses `PmccRetireSuccess` with `closedCycleNetLine`.

**Refactor — cleanup to consider:**

- `PmccRetireNetCard` and US-104's `PmccRollNetPreview` share a layout; merge only if the props stay narrow (`Pick` slices).

**Acceptance criteria covered:**

- "Buy the short call back early", "The close-early sheet previews the net before confirming", "A buyback above the credit is allowed and shown as a losing cycle", "Reject invalid close-early input", "A failed save leaves the cycle open" (message, preserved entries), "Success state points at the next cycle" (close).

---

### 12. Header actions, coverage badge and page wiring

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.tsx` — `Close Short Early →`, `Record Expiration →`, `Sell Short Call →` (if US-115 has not added it), PMCC `PhaseBadge` label
- `src/renderer/src/components/PositionDetailActions.test.tsx`
- `src/renderer/src/pages/usePositionDetailSheets.ts` — `PmccRetireSheet` state, `handleRecordPmccExpiration`, `handleClosePmccShortEarly`, `handleClosePmccRetire`; `handleSellPmccShort` / `sellPmccShortOpen` if US-115 has not added them
- `src/renderer/src/pages/PositionDetailPage.tsx` — compute `pmccShortExpired`, pass props, render the two sheets

**Red — tests to write:**

- PMCC, open short, valuation `2027-07-19`, short expiring `2027-07-16`: `close-pmcc-short-early-btn` (`Close Short Early →`), `record-pmcc-expiration-btn` (`Record Expiration →`) and `roll-pmcc-short-btn` present; no `sell-pmcc-short-btn`.
- Valuation `2027-07-15`: `Close Short Early →` present, `Record Expiration →` absent; valuation `2027-07-16`: absent.
- PMCC with only the LEAPS: `Sell Short Call →` and `Roll LEAPS →` present; `Close Short Early →`, `Record Expiration →`, `Roll Short Call →` absent; badge `LEAPS open · no short call`. With a short open the badge reads `LEAPS + short call open`.
- Wheel `CC_OPEN`: `close-cc-early-btn` / `record-cc-expiration-btn` behave as before (existing tests unchanged); no PMCC button.
- Page: clicking `Record Expiration →` opens the dialog named `Record Expiration`; `Close Short Early →` opens `Close Short Early`; opening one closes any other sheet.

**Green — implementation:**

- Follow the mockup's header map: open short → `Roll Short Call →` · `Close Short Early →` · `Roll LEAPS →` (+ `Record Expiration →` once `pmccShortExpired`; unlike the mockup, `Close Short Early →` and US-104's `Roll Short Call →` stay after the expiration — research.md ADR "`Record Expiration →` appears only after the expiration date has passed"); no short → `Sell Short Call →` · `Roll LEAPS →` (preset `leaps-only`). `Record Assignment →` and `Close Position` stay out (US-111 / US-120). `PositionDetailActions` gains `pmccShortExpired`, `onClosePmccShortEarly`, `onRecordPmccExpiration`, `onSellPmccShort` props; `PhaseBadge` gets `label={pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })}` for a PMCC.
- `PositionDetailPage` computes `pmccShortExpired = isShortExpirationPassed(pmccOpenLegs.short.expiration, pmccTimeline.valuationDate)` and passes `today = pmccTimeline.valuationDate` and the open cycle (`findOpenCycle`) to the sheets. `PmccRetireSheet` (`'expire' | 'close' | null`) in `usePositionDetailSheets`. `onSellNextShort` closes the retire sheet and calls `handleSellPmccShort` (research.md ADR "`Sell Short Call →` and its sheet belong to US-115").

**Refactor — cleanup to consider:**

- `usePositionDetailSheets` is long; group the PMCC sheet state in one `usePmccSheets` sub-hook if the file passes ~300 lines.

**Acceptance criteria covered:**

- "Record the short call expiring worthless" (badge and `Sell Short Call →`), "Record Expiration is offered only once the expiration has passed", "Buy the short call back early" (badge), "The wheel is unchanged".

---

### 13. US-106 alert closure on the production path

**Files to create or modify:**

- `e2e/pmcc-assignment-risk-alert.spec.ts` — the "A PMCC with no open short call is not evaluated" test
- `e2e/pmcc-retire-helpers.ts` — new: `openCloseShortEarlySheet`, `fillCloseShortEarly`, `confirmClose`, `openExpirationSheet`, `confirmExpiration`, readers for the sheet cards and success state

**Red — tests to write:**

- The existing S6 test, rewritten: after the alert is open, the trader buys the short back through `Close Short Early →` (cost `0.10`, fill date today on the real clock), and the next evaluation resolves the `PMCC_ASSIGNMENT_RISK` alert; the test no longer calls `_test:pmcc-record-leg-event`.

**Green — implementation:**

- Nothing in `evaluate-alerts.ts` (research.md ADR "Alert closure stays ledger-driven"). The helpers drive the real sheet.

**Refactor — cleanup to consider:**

- Leave other specs' `recordEvent` seeding alone; they set up history, not the action under test.

**Acceptance criteria covered:**

- The OPT-25 comment's requirement that recording through the real UI resolves US-106's alerts.

---

### 14. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-retire-short-call.spec.ts` — new
- `e2e/pmcc-retire-helpers.ts` — from Area 13
- `e2e/pmcc-timeline-helpers.ts` — add `VARIANTS.atCycle8Open` (drop `c8Expire`, `c9Sell` — leg patches set to `null`) and `VARIANTS.atCycle5Open` (drop `c5Close` and every later leg)

Each test launches with `launchTimeline(fakeNow)` (`WHEELBASE_FAKE_NOW` at 16:00Z = noon Eastern),
seeds through `seedXyz(page, variant)`, and opens the detail page. Each assertion is a literal a
fallback cannot produce. Disposal via `disposeTimeline` in `afterEach`.

**Red — tests to write** (one per acceptance scenario or example row; names mirror the AC):

1. **Record the short call expiring worthless** — `atCycle8Open` at 2027-07-19: before, `Open cycle credit` reads `+$2.40 / share · open`; click `Record Expiration →`, `Confirm Expiration`, `Done`. Then cycle 8 in the leg timeline ends `Expired worthless` dated `2027-07-16` with net `Net credit` (not `Net credit, open`); `Realized net credits` reads `+$14.00 / share (+$1,400.00)` and `Open cycle credit` reads `—`; the `Cost basis / share` cell reads `$8.50`; the header badge reads `LEAPS open · no short call`; the header shows `Sell Short Call →` and no `Record Expiration →` or `Close Short Early →`.
2. **The expiration sheet shows what the cycle netted** — `atCycle8Open` at 2027-07-19, open the sheet: `$112.00 · 2027-07-16 · sold at $2.40 · 24 days held`; `Cycle 8 net +$2.40 / share (+$240.00) · 100% of max`; the coverage card `$85.00 · 2028-01-21 · 186 DTE`; the dialog has no textbox and no date picker, and `2027-07-16` is shown as text.
3. **Record Expiration is offered only once the expiration has passed** — `atCycle8Open` at 2027-07-15: `record-pmcc-expiration-btn` count `0`; `close-pmcc-short-early-btn` visible with `Close Short Early →`.
4. **Expiring a short that closed in the money is turned toward assignment** — `atCycle8Open` at 2027-07-19 with `_test:iv-series-set` giving XYZ's 2027-07-16 close `114.30`: the warning `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have been assigned. Check with your broker; if it was, record an assignment instead.` is visible in a warning alert; `Confirm Expiration` is enabled (wording per open question 6; Linear's AC text is being updated to match).
5. **When no closing price is available the warning reads "Confirm with your broker that this call was not assigned"** — same seed, no IV series for XYZ: that muted line is visible, no warning alert, `Confirm Expiration` enabled.
6. **Buy the short call back early** — `atCycle5Open` at 2027-04-02: `Close Short Early →`, cost `0.55`, fill date `2027-04-02`, `Confirm Close`. The success state reads `+$1.65 / share (+$165.00) · 75.0% of max captured · 18 days held`; after `Done`, cycle 5 ends `Closed early` with a buyback row `−$0.55` dated `2027-04-02`; `Cost basis / share` reads `$16.90` (the test fails on a fixture still reading `$16.35`); the badge reads `LEAPS open · no short call`.
7. **The close-early sheet previews the net before confirming** — `atCycle5Open`: type `0.55` without confirming: `Cycle net +$1.65 / share · 75.0% of max captured`, `Cost basis after: $16.90 / share (from $16.35)`, `Effective share cost after: $96.90 (from $96.35)` (open question 1, resolved); no leg recorded yet (cycle 5 still `Open`).
8. **A buyback above the credit is allowed and shown as a losing cycle** — type `3.10`: `Cycle net −$0.90 / share (−$90.00)` with the loss-colour class and no `% of` figure in the Net card; the note `Buying back above the credit collected — this cycle nets a loss`; `Confirm Close` enabled.
9. **Reject invalid close-early input: cost to close $0.00** — `Cost to close must be greater than zero` beside the cost input; `Confirm Close` disabled.
10. **Reject invalid close-early input: fill date 2027-03-14** — `Fill date cannot be before the short call was sold (2027-03-15)` beside the fill date; Confirm disabled.
11. **Reject invalid close-early input: fill date 2027-04-17** — `Fill date cannot be after the expiration (2027-04-16)`; Confirm disabled.
12. **Reject invalid close-early input: fill date 2027-04-03** — `Fill date cannot be in the future`; Confirm disabled.
13. **Reject either action when no short call is open** — seed `LEAPS_ONLY`; call `window.api.expirePmccShort` and `window.api.closePmccShortEarly` (cost 0.55) from the page: both return `ok: false` with `This PMCC has no open short call to retire.`; the leg and snapshot counts (`snapshots(page, id)`) are unchanged.
14. **A failed save leaves the cycle open** — `atCycle5Open`, fill cost `0.55`, make the DB read-only, `Confirm Close`: `Could not record the close. Your entries are preserved. Try again.` is visible and the cost input still holds `0.55`; restore permissions, reload: cycle 5 still `Open`, `Cost basis / share` `$16.35`, no `SHORT_CALL_CLOSE` leg.
15. **Success state points at the next cycle: after an expiration** — the success view shows the `Expired worthless` badge, `Cycle 8 net +$2.40 / share (+$240.00)`, `Sell the next short call →` and `Done`; `Done` closes the sheet.
16. **Success state points at the next cycle: after a buyback** — `Closed early` badge, `+$1.65 / share (+$165.00)`, both actions; `Done` closes the sheet.
17. **"Sell the next short call →" opens US-115's sheet** — after either action, clicking it closes this sheet and opens the dialog named `Sell Short Call`. _(depends on US-115)_
18. **The wheel is unchanged** — a classic wheel taken to `CC_OPEN` with the existing helpers (real clock): `Close CC Early →` opens the US-8 sheet and `Record Expiration →` follows US-9 (unchanged testIds `close-cc-early-btn`, `record-cc-expiration-btn`); none of `close-pmcc-short-early-btn`, `record-pmcc-expiration-btn`, `% of max`, `of cycle net credit`, `Cycle` figures or `LEAPS open · no short call` appear.

**Green — implementation:**

- Nothing new should be needed; a failing e2e test means an earlier area is incomplete. Fix it there.

**Refactor — cleanup to consider:**

- Keep the two new variants as patches over the one Background literal.
- Confirm the % of max figures appear only in the retire sheets, never in US-109's timeline drawers (US-109's "No per-cycle percentage" e2e still passes).

**Acceptance criteria covered:**

- All 12 scenarios in OPT-25 (the outline as four rows, the advisory as two branches, the success state as three cases), one test each (AC audit below).

## AC Audit

| #   | Acceptance scenario (OPT-25)                                                                     | E2e test |
| --- | ------------------------------------------------------------------------------------------------ | -------- |
| 1   | Record the short call expiring worthless                                                         | 1        |
| 2   | The expiration sheet shows what the cycle netted                                                 | 2        |
| 3   | Record Expiration is offered only once the expiration has passed                                 | 3        |
| 4   | Expiring a short that closed in the money is turned toward assignment — warning, confirm enabled | 4        |
| 4b  | … when no closing price is available the warning reads "Confirm with your broker…"               | 5        |
| 5   | Buy the short call back early                                                                    | 6        |
| 6   | The close-early sheet previews the net before confirming                                         | 7        |
| 7   | A buyback above the credit is allowed and shown as a losing cycle                                | 8        |
| 8   | Reject invalid close-early input — cost to close $0.00                                           | 9        |
| 8   | Reject invalid close-early input — fill date 2027-03-14                                          | 10       |
| 8   | Reject invalid close-early input — fill date 2027-04-17                                          | 11       |
| 8   | Reject invalid close-early input — fill date 2027-04-03                                          | 12       |
| 9   | Reject either action when no short call is open                                                  | 13       |
| 10  | A failed save leaves the cycle open                                                              | 14       |
| 11  | Success state points at the next cycle — outcome, net, `Done` (expiration)                       | 15       |
| 11  | Success state points at the next cycle — outcome, net, `Done` (buyback)                          | 16       |
| 11  | Success state — "Sell the next short call →" opens US-115's sheet                                | 17       |
| 12  | The wheel is unchanged                                                                           | 18       |

Every AC bullet has a named e2e test. Test 7 asserts the effective share cost the Background
produces (`$96.90 from $96.35`), not the story's original `$101.90 from $101.35` — open question
1 in `research.md`, confirmed by the options-expert, Linear AC corrected. Test 4 asserts the
warning `XYZ closed at $114.30 on 2027-07-16, at or above the $112.00 strike — this call may have
been assigned. Check with your broker; if it was, record an assignment instead.`, which deviates
from the AC's text (open question 6; Linear is being updated to match). The rolled-cycle label
and card (open questions 5 and 10) are not an AC scenario — the AC cycles 5 and 8 are unrolled —
so they are covered by Areas 1, 8 and 10, not by an e2e test. Test 17 is red until US-115 merges.
