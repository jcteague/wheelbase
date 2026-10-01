---
story: us-101
kind: feature
parent: null
topics:
  [
    wheel-lifecycle,
    cost-basis,
    ipc-handlers,
    zod-schemas,
    tables,
    migrations,
    market-data,
    position-list,
    position-detail,
    pmcc
  ]
status: planned
---

# Implementation Plan: US-101 — Open a PMCC position with two linked opening legs

## Summary

Turn `Open Wheel` into a shared **New position** sheet over the positions list with a
`Standard / PMCC` toggle: Standard is the shipped wheel form unchanged, PMCC records a long LEAPS
call and a short call together — chain-picked or typed, with actual fills, per-leg fees and a live
opening cash-flow review — through a new `positions:create-pmcc` handler that writes the position,
both legs and the opening cost-basis snapshot in one transaction. Done when every Linear scenario
passes end to end, a `PMCC_OPEN` position shows a truthful minimal row and detail page, and every
wheel-only surface, job and existing e2e spec is unchanged.

Estimated at **8 points**. Areas 1–7 are main-process and stand alone; 8–11 are the renderer;
12 is a test seam; 13 is the AC-driven e2e suite.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-7](https://linear.app/optionswheel/issue/OPT-7/us-101-open-a-pmcc-position-with-two-linked-opening-legs) (the archived `docs/epics/09-stories/US-101-open-pmcc-position.md` is superseded; Linear wins)
- **Mockups:** `mockups/us-101-open-pmcc-position.mdx` (this story's sheet, states, and the post-record row) and `mockups/epic-09-pmcc-new-position.mdx` (ownership table; the `standard`, `pmcc-empty`, `pmcc-review`, `stale`, `quotes-unavailable`, `loading`, `no-matching`, `reject-structure`, `reject-dates`, `saving`, `save-failed` presets are US-101's)
- **Research & Design Decisions:** `plans/us-101/research.md`
- **Data Model & Validation Rules:** `plans/us-101/data-model.md`
- **API Contracts:** `plans/us-101/contracts/positions-create-pmcc.md`, `plans/us-101/contracts/positions-list.md`
- **Quickstart & Verification:** `plans/us-101/quickstart.md`

## Prerequisites

- **Existing, reused as-is:** `positions.strategy_type` column and the `StrategyType` enum (`'PMCC'` already present); `cost_basis_snapshots.trigger_event`; `handleIpcCall`; `db.transaction` pattern from `createPosition`; `market-data:option-chain` IPC + `GetOptionChainPayloadSchema`; `FakeMarketDataProvider.getOptionChainSnapshot`; `Sheet*`, `Field`, `NumberInput`, `FormButton`, `DatePicker`, `SectionCard`, `AlertBox`; `NewWheelForm` and its promote chrome; `computeDte` / `computeDteFromInput`; `parseInputDecimal`; `makeSnapshotAt`, `localToday`; `useStockQuotes`; `ivrOnDemand.collect`.
- **Not blocking:** US-103 (consumes the snapshot this story writes), US-113 / US-122 (extend the sheet), US-108 / US-118 (replace the minimal row and detail).

## Implementation Areas

### 1. Migration, enums and record types

**Files to create or modify:**

- `migrations/017_add_leg_fees.sql` — `ALTER TABLE legs ADD COLUMN fees TEXT NOT NULL DEFAULT '0.0000'`
- `src/main/core/types.ts` — `WheelPhase` + `'PMCC_OPEN'`; `LegRole` + `'LEAPS_OPEN'`, `'SHORT_CALL_OPEN'`
- `src/main/schemas.ts` — `LegRecord.fees: string`; `TriggerEvent` + `'PMCC_OPEN'`
- `src/main/services/get-position.ts` — select and map `fees` in `GET_LEGS_QUERY`, `mapLegRow`, `LegRow`, `GET_QUERY`/`mapActiveLeg`
- `src/main/services/positions.ts` and every service that builds a `LegRecord` literal (`close-csp-position.ts`, `assign-csp-position.ts`, `open-covered-call-position.ts`, `close-covered-call-position.ts`, `expire-*.ts`, `record-call-away-position.ts`, `roll-csp-position.ts`, `roll-cc-position.ts`) — add `fees: '0.0000'` to satisfy the widened type (typecheck drives the list)
- `src/preload/index.d.ts` — `IpcLegRecord.fees: string`
- `src/renderer/src/api/positions.ts` — `WheelPhase` + `'PMCC_OPEN'`; `LegDetail.fees: string`; `PositionDetail.position.strategyType: 'WHEEL' | 'PMCC'`
- `src/renderer/src/lib/phase.ts` — `PHASE_COLOR.PMCC_OPEN`, `PHASE_LABEL.PMCC_OPEN` and `PHASE_LABEL_SHORT.PMCC_OPEN` = `'LEAPS + short call open'`, `LEG_ROLE_LABEL.LEAPS_OPEN` / `.SHORT_CALL_OPEN`

**Red — tests to write:**

- `src/main/db/migrate.test.ts`: after `runMigrations`, `PRAGMA table_info(legs)` includes `fees` with default `'0.0000'`; an existing wheel leg inserted before 017 (simulate by running migrations up to 016, inserting, then 017) reads `fees = '0.0000'`.
- `src/main/services/get-position.test.ts`: a leg seeded with `fees = '1.0000'` comes back as `legs[0].fees === '1.0000'`; a wheel position created by `createPosition` has `legs[0].fees === '0.0000'` and `activeLeg.fees === '0.0000'`.
- `src/main/core/types.test.ts`: `WheelPhase.parse('PMCC_OPEN')`, `LegRole.parse('LEAPS_OPEN')`, `LegRole.parse('SHORT_CALL_OPEN')` succeed; `WheelPhase.parse('PMCC_LEAPS_ONLY')` throws (reserved, not added).
- `src/renderer/src/lib/phase.test.ts`: every `WheelPhase` value, including `PMCC_OPEN`, has a colour and both labels; `PHASE_LABEL.PMCC_OPEN === 'LEAPS + short call open'`.

**Green — implementation:**

- The migration file and the enum values in data-model §1–§2.
- `fees` threaded through `LegRecord`, `get-position.ts` (both queries), the preload type and `LegDetail`.
- `fees: '0.0000'` on every existing `LegRecord` literal (do not read the column there — the wheel never writes fees).
- The three `phase.ts` record entries.

**Refactor — cleanup to consider:**

- `mapActiveLeg` and `mapLegRow` in `get-position.ts` build the same `LegRecord` from differently-aliased rows; if adding `fees` to both is the third field copied, fold `mapActiveLeg` into a `mapLegRow` call over a re-aliased row. Only if it reads simpler.

**Acceptance criteria covered:**

- Foundation for "its detail page shows both legs with their quantities, actual fills, fill dates, strikes, and expirations" and for "Fees $0.00" / the `$2,302.00` fee example (fees must be recorded per leg).

### 2. Pure opening-debit calculation

**Files to create or modify:**

- `src/main/core/costbasis.ts` — `PmccOpeningDebitInput`, `PmccOpeningDebitResult`, `calculatePmccOpeningDebit`
- `src/main/core/costbasis.test.ts` — new describe block

**Red — tests to write (`costbasis.test.ts`, `describe('calculatePmccOpeningDebit')`):**

- Fixture (1 contract, 25.00 / 2.00, strikes 80 / 110, fees 0 / 0) → `leapsCost '2500.0000'`, `shortCredit '200.0000'`, `fees '0.0000'`, `initialNetDebit '2300.0000'`, `netDebitBeforeFees '2300.0000'`, `basisPerShare '23.0000'`, `strikeWidthPerShare '30.0000'`, `debitToWidthPercent '76.6667'`.
- Fees 1.00 / 1.00 → `fees '2.0000'`, `initialNetDebit '2302.0000'`, `basisPerShare '23.0200'`, `debitToWidthPercent` still `'76.6667'` (fees excluded from the ratio).
- 3 contracts, same fills → `leapsCost '7500.0000'`, `shortCredit '600.0000'`, `initialNetDebit '6900.0000'`, `basisPerShare '23.0000'` (per share regardless of quantity).
- Strike width ≤ 0 (short 80, long 80) → `debitToWidthPercent: null`, other fields still computed.
- Rounding: fills `25.005` / `2.0049` → every output is exactly 4 dp and rounded half-up (`Decimal` semantics, e.g. `basisPerShare '23.0001'`).
- Short credit exceeding long cost → `netDebitBeforeFees` negative string (`'-100.0000'`); the function does not throw (validation belongs to `openPmcc`).

**Green — implementation:**

- The function per data-model §4, using the module's `round4` and `sharesFromContracts`; all outputs `toFixed(4)` strings; `debitToWidthPercent = (longFill − shortFill) / width × 100` with `null` guard on `width ≤ 0`.
- `PmccOpeningLegInput` is `{ strike, fillPrice, fees }` — a structural subset of `OpenPmccLegInput` — so the service and the form preview pass their leg objects through as `{ contracts, long, short }` with no re-shaping.
- No logging, no imports beyond `decimal.js` (core rule).

**Refactor — cleanup to consider:**

- The module already has `round4` returning a `Decimal` and callers doing `.toFixed(4)`; if a `money4(d: Decimal): string` helper removes repetition across the new and old functions, extract it.

**Acceptance criteria covered:**

- "Review the initial cash flows": LEAPS purchase cost $2,500.00, Short-call credit $200.00, Fees $0.00, Initial net debit $2,300.00, Strike width / share $30.00, Debit / strike width before fees 76.67% — and the UI-Changes fee example ($2,302 / 76.67%).

### 3. Pure PMCC entry validation

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — `OpenPmccLegInput`, `OpenPmccInput`, `OpenPmccResult`, `PmccField`, `openPmcc`
- `src/main/core/lifecycle.test.ts` — new describe block

**Red — tests to write (`lifecycle.test.ts`, `describe('openPmcc')`):**

- Valid fixture (data-model §11, `referenceDate` = both fill dates) → `{ phase: 'PMCC_OPEN' }`.
- One test per row of data-model §4's rule table (16 rules, 25 cases counting `long`/`short` variants), each asserting the thrown `ValidationError`'s `field`, `code` and exact `message`. Concretely, from the AC outline: short expiration equal to the LEAPS expiration → `short.expiration` / `short_not_before_long`; short expiration after the LEAPS → same; `short.underlying = 'ABC'` → `underlying_mismatch`; short `instrumentType = 'PUT'` → `not_a_call`; long 1 / short 2 contracts → `short.contracts` / `quantity_mismatch`; short strike 75 and 80 → `strike_not_above_long`; `deliverableShares = 50` → `nonstandard_deliverable`; contracts 0 and 1.5 → `must_be_positive_integer`; fill price 0 and −1 → `must_be_positive`; fees −1 → `must_be_non_negative`; long fill date after `referenceDate` → `cannot_be_future`; long fill after short fill → `short.fillDate` / `long_after_short`; expiration equal to its fill date → `expiration_not_after_fill`; expiration before `referenceDate` → `expired_contract`; short fill 25.00 vs long 25.00 (equal) and short 26.00 → `__pair__` / `not_net_debit`.
- Rule order: an entry that breaks both the strike rule and the net-debit rule reports the strike rule (order in §4 is the contract).
- Date comparisons are string comparisons on ISO dates (no `Date` parsing): `'2027-09-17' < '2027-10-15'` behaves; a fixture with different years still orders correctly.

**Green — implementation:**

- `openPmcc` per data-model §4, reusing the module's `TICKER_RE`, `requirePositiveStrike`, `requirePositiveDecimal`; new small helpers `requireCall`, `requireStandardDeliverable`, `requireNonNegativeDecimal`, `requireFillDateNotFuture` applied per leg with a `path` prefix (`'long'` / `'short'`). The helpers take `field: PmccField` (the template-literal union in §4), so a misspelled path is a typecheck failure, not a message that lands beside no field. `OpenPmccLegInput.instrumentType` is `OptionInstrumentType` from `core/types.ts`, not a re-spelled `'PUT' | 'CALL'`.
- No I/O, no logging.

**Refactor — cleanup to consider:**

- Existing helpers hard-code field names (`requirePositivePremium` → `'premiumPerContract'`); the per-leg variants take the field path as an argument. If `openWheel`/`openCoveredCall` read cleaner using the new parameterised helpers, switch them; otherwise leave them.

**Acceptance criteria covered:**

- "Reject an unsupported or incomplete entry" — all 17 example rows (the boundary half of each).

### 4. Payload schema, result type, dotted error paths

**Files to create or modify:**

- `src/main/schemas.ts` — `PmccLegPayloadSchema`, `CreatePmccPositionPayloadSchema`, `CreatePmccPositionPayload`, `CreatePmccPositionResult`
- `src/main/ipc/utils.ts` — `ZodError` mapping uses `issue.path.join('.') || '__root__'`
- `src/main/schemas.test.ts`, `src/main/ipc/utils.test.ts` (create if absent)

**Red — tests to write:**

- `schemas.test.ts`: the fixture payload parses; `strategy: 'WHEEL'` fails; a missing `long.fillPrice` yields one issue at path `['long','fillPrice']` with message `Enter the actual LEAPS fill price.`; missing `short.fillPrice` → `Enter the actual short-call fill price.`; a malformed `short.expiration` (`'10/16/2026'`) fails with `IsoDateMessage`; `fees: -1`, `contracts: 0`, `strike: 0`, `deliverableShares: 50` all **pass** Zod (engine-owned rules — no `.int()` on `deliverableShares` either).
- `utils.test.ts`: `handleIpcCall` given a fn that throws a `ZodError` with path `['long','fillPrice']` returns `errors[0].field === 'long.fillPrice'`; a single-segment path still returns `'ticker'`; an empty path returns `'__root__'`; a `ValidationError('short.strike', …)` passes its dotted field through untouched.

**Green — implementation:**

- Schemas and result interface per data-model §5 and the contract; `z.number({ error })` for the two fill-price messages. `CreatePmccPositionResult` narrows `position`, `longLeg`, `shortLeg` and `costBasisSnapshot` with literal intersections (`phase: 'PMCC_OPEN'`, `legRole: 'LEAPS_OPEN'`, `fillPrice: string`, `finalPnl: null`, …) the way `OpenCcPositionResult` and `CostBasisSnapshotRecord & { finalPnl: string }` already do, so the service's return literal is checked rather than commented.
- The one-line path join in `utils.ts`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with `OpenCcPayloadSchema` / `RollPayloadBaseSchema` (e.g. the ISO-date regex constant is already shared).

**Acceptance criteria covered:**

- "the long actual fill price is empty → Enter the actual LEAPS fill price." at the boundary; the error-beside-the-relevant-field half of every rejection row (field paths survive the envelope).

### 5. `createPmccPosition` service

**Files to create or modify:**

- `src/main/services/create-pmcc-position.ts` — new
- `src/main/services/create-pmcc-position.test.ts` — new
- `src/main/services/positions.ts` — re-export `createPmccPosition`

**Red — tests to write (`create-pmcc-position.test.ts`, `makeTestDb()`):**

- Valid fixture → result has `position` (`strategyType 'PMCC'`, `phase 'PMCC_OPEN'`, `status 'ACTIVE'`, `openedDate` = long fill date), `longLeg` (`LEAPS_OPEN` / `BUY` / `CALL` / `strike '80.0000'` / `premiumPerContract '25.0000'` / `fillPrice '25.0000'` / `fees '0.0000'`), `shortLeg` (`SHORT_CALL_OPEN` / `SELL` / `CALL` / `'110.0000'` / `'2.0000'`), `costBasisSnapshot` (`triggerEvent 'PMCC_OPEN'`, `basisPerShare '23.0000'`, `totalPremiumCollected '200.0000'`, `finalPnl null`), `openingDebit.initialNetDebit '2300.0000'`.
- Persists exactly one `positions` row, two `legs` rows (LEAPS first in `GET_LEGS_QUERY` order), one `cost_basis_snapshots` row; `roll_chain_id` null on both legs.
- Fees 1.00 / 1.00 → legs carry `fees '1.0000'` each; snapshot `basisPerShare '23.0200'`, `totalPremiumCollected '199.0000'`; `openingDebit.initialNetDebit '2302.0000'`.
- Invalid entry (short expiration after LEAPS) → throws `ValidationError` with `field 'short.expiration'` **and** the DB has zero positions, zero legs, zero snapshots.
- Atomicity: stub `db.prepare` (or use a DB with the `cost_basis_snapshots` table dropped) so the third insert throws → the error propagates and neither the position nor either leg exists afterwards.
- `ivrOnDemand.collect` is called once with the ticker after commit; not called when validation rejects.
- `getPosition(db, id)` after creation returns `activeLeg: null` (phase-aware subquery ignores PMCC), `legs.length === 2`, `costBasisSnapshot.triggerEvent === 'PMCC_OPEN'`.
- `listPositions` (before area 7's change) still returns the item without throwing.
- Logging: `logger.info` called with `'pmcc_position_created'` on success and `'pmcc_entry_rejected'` (with `field`/`code`) on a validation failure.

**Green — implementation:**

- `createPmccPosition(db, payload, ivrOnDemand?)`: `today = localToday()`; DEBUG inputs; `openPmcc({...})` in a `try/catch` that logs INFO `pmcc_entry_rejected` and rethrows; `calculatePmccOpeningDebit({ contracts, long, short })` with the payload legs passed through unchanged; DEBUG result; ids; one `db.transaction` inserting the rows of data-model §3 (LEAPS leg, then short leg, same `now`); INFO `pmcc_position_created`; `void ivrOnDemand?.collect(ticker)`; return `CreatePmccPositionResult`.
- Money formatting through `new Decimal(x).toFixed(4)` exactly as `createPosition` does.

**Refactor — cleanup to consider:**

- `createPosition` and `createPmccPosition` share the `INSERT INTO positions` statement and the `PositionRecord` literal; extract `insertPosition(db, row)` / `toPositionRecord` into `services/positions.ts` if the two are byte-identical apart from `strategy_type`/`phase`. Same for a `insertLeg` helper if the roll services already have one to share.

**Acceptance criteria covered:**

- "Record the position and view both legs" (data half); "Recover from a failed save without a partial position" (atomicity); "no broker order is submitted" (the service imports no broker module — assert by construction in a test that the module's imports contain no `integrations/` path, or simply by review).

### 6. IPC handler, preload, renderer adapter

**Files to create or modify:**

- `src/main/ipc/positions.ts` — `positions:create-pmcc`
- `src/main/ipc/positions.test.ts` — new cases
- `src/preload/index.ts` — `createPmccPosition: (payload) => invoke('positions:create-pmcc', payload)`
- `src/preload/index.d.ts` — `IpcCreatePmccPositionPayload`, `IpcCreatePmccPositionResult`, the `api` entry
- `src/renderer/src/api/positions.ts` — `CreatePmccPositionPayload`, `CreatePmccPositionResponse`, `createPmccPosition()`
- `src/renderer/src/hooks/useCreatePmccPosition.ts` + `.test.ts`

**Red — tests to write:**

- `ipc/positions.test.ts`: the channel is registered; a valid payload calls `createPmccPosition(db, parsedPayload, ivrOnDemand)` and returns `{ ok: true, ...result }`; a payload missing `long.fillPrice` returns `{ ok: false, errors: [{ field: 'long.fillPrice', … message: 'Enter the actual LEAPS fill price.' }] }` without calling the service; a service `ValidationError('short.strike','strike_not_above_long',…)` returns that envelope; a generic throw returns `internal_error`.
- `api/positions.test.ts` (or inline in the hook test): `createPmccPosition` passes the payload through unchanged (no snake_case mapping — new code uses camelCase end to end), throws an `ApiError` with status 400 carrying the field errors on `{ ok: false }`, and returns the result on success.
- `useCreatePmccPosition.test.ts`: on success invalidates `positionQueryKeys.all`.

**Green — implementation:**

- Handler: `ipcMain.handle('positions:create-pmcc', (_, payload) => handleIpcCall('positions_create_pmcc_unhandled_error', () => createPmccPosition(db, CreatePmccPositionPayloadSchema.parse(payload), ivrOnDemand)))` — Zod parse + one service call, nothing else.
- Preload and `index.d.ts` entries; renderer adapter + mutation hook mirroring `useCreatePosition`. `IpcCreatePmccPositionResult` carries the same literal narrowing as the main-process type (as `IpcRollCspResult` does with `phase: 'CSP_OPEN'`), not the loose `string` fields of `IpcPositionRecord`.

**Refactor — cleanup to consider:**

- `registerParsedPositionHandler` requires `positionId`; if a `registerParsedHandler` without that constraint lets both `positions:create` (currently unparsed) and `positions:create-pmcc` share one shape, add it and use it for the new channel only (do not change `positions:create`'s behaviour in this story).

**Acceptance criteria covered:**

- Transport for "Record the position", "Reject an unsupported or incomplete entry" (error beside the relevant field) and "Recover from a failed save".

### 7. Positions list carries the PMCC summary; wheel-only jobs skip PMCC

**Files to create or modify:**

- `src/main/schemas.ts` — `PmccLegSummary`, `PmccListSummary`; `PositionListItem` becomes the union `WheelListItem | PmccListItem` discriminated on `strategyType` (data-model §6)
- `src/main/services/list-positions.ts` — select `p.strategy_type`; `readPmccSummaries(db, ids)`; map
- `src/main/services/list-positions.test.ts`, `evaluate-alerts.test.ts`, `detect-assignments.test.ts`
- `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts` — mirror the two fields

**Red — tests to write:**

- `list-positions.test.ts`: a PMCC created by area 5 lists with `strategyType 'PMCC'`, `pmcc.long` (`strike '80.0000'`, `expiration`, `dte` = `computeDte(expiration)` — typed `number`, never null, `contracts 1`), `pmcc.short` likewise, `pmcc.initialNetDebit '2300.0000'`; its `strike`, `expiration`, `dte`, `instrumentType`, `contracts`, `entryPremiumPerContract` are all `null`; `premiumCollected '200.0000'`, `effectiveCostBasis '23.0000'`.
- A wheel item has `strategyType 'WHEEL'` and `pmcc: null`; every pre-existing key assertion in the suite still passes. Existing fixtures that build a `PositionListItem` literal (renderer tests, `expiration-calendar`, `PositionCard`) gain `strategyType: 'WHEEL', pmcc: null`.
- Compile-time, not a runtime test: a `PmccListItem` with `pmcc: null`, or a `WheelListItem` carrying a summary, fails `pnpm typecheck` — the illegal states are unrepresentable.
- One wheel + one PMCC → the PMCC sorts after the wheel (null DTE last) and the summary query ran once (spy on `db.prepare`, or assert the `pmcc_summaries_read` DEBUG log carries both ids in one call).
- 3-contract PMCC → `initialNetDebit '6900.0000'` (basis per share × 100 × contracts).
- `evaluate-alerts.test.ts`: a `PMCC_OPEN` position with an in-window short call produces no alert and no error (`createdCount 0`, no `logger.error`).
- `detect-assignments.test.ts`: a `PMCC_OPEN` position is not selected as a candidate (fake broker activity for its ticker creates no pending assignment).

**Green — implementation:**

- `LIST_QUERY` adds `p.strategy_type`; after the main query, collect PMCC ids and run one `SELECT … FROM legs WHERE position_id IN (…) AND leg_role IN ('LEAPS_OPEN','SHORT_CALL_OPEN')`; build `PmccListSummary` per id (`initialNetDebit = basis_per_share × 100 × contracts`, 4 dp); DEBUG `pmcc_summaries_read { ids }`.
- Two builders, `toWheelItem(row)` and `toPmccItem(row, summary)`, return the two union arms; the row mapper picks one on `row.strategy_type`. The preload `IpcPositionListItem` and the renderer `PositionListItem` carry the same union, and the renderer mapper in `api/positions.ts` branches once on `strategyType`.
- No change to `evaluate-alerts.ts` / `detect-assignments.ts` — the tests prove the existing phase filters already exclude PMCC.

**Refactor — cleanup to consider:**

- With `toWheelItem` / `toPmccItem` in place, check that the shared base fields are built once (a `toListItemBase(row)` if the two builders repeat the same seven fields).

**Acceptance criteria covered:**

- "its row in the positions list identifies PMCC and labels each leg's expiration separately" (data); Technical note "Existing wheel-only polling, assignment detection, alerts … must skip unsupported PMCC processing safely".

### 8. Renderer chain access and pure entry helpers

**Files to create or modify:**

- `src/renderer/src/api/market-data.ts` — `OptionChainQuote` mirror, `getOptionChain(filter)`
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — `optionChain(filter)` key
- `src/renderer/src/hooks/useCallChain.ts` + `.test.ts`
- `src/renderer/src/lib/pmcc-entry.ts` + `.test.ts` — presets, `ChainNotice` (kind union), `CHAIN_NOTICE_COPY`, `chainNoticeMessage`, `ContractSelection`, `filterCallChain`, `deriveChainNotice`, `chainWindow`, `strikeBounds`, `formatContractOption`, `STALE_QUOTE_MS`
- `src/renderer/src/schemas/pmcc-entry.ts` + `.test.ts` — `pmccEntrySchema`, `PmccEntryFormValues`, `toCreatePmccPayload`, `EMPTY_PMCC_DEFAULTS(today)`

**Red — tests to write:**

- `pmcc-entry.test.ts`: `filterCallChain` keeps Δ 0.80 for the LEAPS preset, drops Δ 0.60 and Δ 0.90, keeps a contract with no greeks at the end; absolute delta (a `-0.30` string, should a vendor sign calls oddly, is treated as 0.30). `deriveChainNotice` returns a kind: pending → `'loading'`; error → `'unavailable'`; success + empty → `'empty'`; selected quote 6 min old → `'stale'`; selected quote 1 min old → `null`; pending outranks stale. `chainNoticeMessage` maps the four kinds to the AC strings (`Loading call contracts…`, `Quotes unavailable. Enter your filled trade manually.`, `No matching calls. Adjust filters or enter manually.`, `Quote is stale. Verify against your actual fill.`) and `null` → `null`. `chainWindow(LEAPS_PRESET, 2026-09-14)` → `{ expirationFrom: '2027-03-13' }` (no `To`); `chainWindow(SHORT_PRESET, …)` → `{ from: '2026-10-04', to: '2026-10-29' }`. `strikeBounds(LEAPS_PRESET, '100.00')` → `{ strikeTo: '100.00' }`; short → `{ strikeFrom }`; null price → `{}`. `formatContractOption` for the LEAPS fixture on 2026-09-14 → `'Sep 17, 2027 · $80.00 · 368 DTE · Δ 0.80 · mid $25.00'`; missing greeks → `Δ —`.
- `schemas/pmcc-entry.test.ts`: the fixture values parse; empty long fill → `long.fillPrice` `Enter the actual LEAPS fill price.`; `'0'` fill → `Actual fill price must be greater than zero.`; contracts `'1.5'` / `'0'` → `Contracts must be a positive whole number.`; fees `'-1'` → `Fees cannot be negative.`; short expiration ≥ long → `short.expiration` `Short call must expire before the LEAPS call.`; short strike ≤ long → `short.strike` message; long fill date after short → `short.fillDate` message; future fill date → `Fill date cannot be in the future.`; expiration ≤ fill date → `Expiration must be after the fill date.`; expiration before today → `Use an unexpired contract for opening a current position.`; short fill ≥ long fill → path `['__pair__']` `This PMCC entry requires a net debit before fees.`; `toCreatePmccPayload` produces the contract example JSON (numbers, `underlying: 'XYZ'`, `instrumentType 'CALL'`, `deliverableShares 100`, equal `contracts`).
- `useCallChain.test.ts` (mock `window.api.marketData.optionChain`): calls the IPC with `type: 'call'`, the preset's window and strike bounds; returns `{ status, contracts (filtered), error }`; does not query when `ticker` is empty or fails `tickerSchema`; the query key changes when the ticker changes.
- `api/market-data.test.ts`: `getOptionChain` throws `ApiError` 502 on `{ ok: false }`, returns `snapshots` on success.

**Green — implementation:**

- Types and helpers per data-model §7–§8; `useCallChain({ ticker, preset, underlyingPrice })` = `useQuery` with `staleTime 30_000`, `refetchInterval 60_000`, `enabled: tickerSchema.safeParse(ticker).success`, `select: filterCallChain`.
- `pmccEntrySchema` with `superRefine` for rules 10–16 using string date comparison and `parseInputDecimal` for money; the paths it reports on are a `const` array `satisfies readonly PmccField[]` (imported from `main/core/lifecycle`, as the preview already imports `main/core/costbasis`). Defaults come from `EMPTY_PMCC_DEFAULTS(today)` as `useForm` `defaultValues`, never from `.default()` on the schema, so `z.infer` stays one type.

**Refactor — cleanup to consider:**

- `deriveChainNotice` / `chainNoticeMessage` follow `derivePromoteBanner` / `promoteBannerMessage` (`lib/promote.ts`): a kind union plus a copy function. Do not merge the two (different inputs); do keep the split.
- `computeDteFromInput` already lives in `lib/format.ts`; `formatContractOption` should call it, not re-derive DTE.

**Acceptance criteria covered:**

- Pure halves of "Select the two contracts independently" (368 DTE, quote fields), "Continue when market data cannot supply a selection" (all four notices), and the form half of every "Reject" row.

### 9. Route + `NewPositionSheet` shell + Standard mode

**Files to create or modify:**

- `src/renderer/src/App.tsx` — one RegExp route `/^\/(new)?$/` → `PositionsListPage`; remove the `NewWheelPage` import and route
- `src/renderer/src/pages/NewWheelPage.tsx` + `.test.tsx` — delete (promote consume-on-mount logic moves into the sheet)
- `src/renderer/src/components/NewPositionSheet.tsx` + `.test.tsx` — new
- `src/renderer/src/components/StrategyToggle.tsx` + `.test.tsx` — new
- `src/renderer/src/components/NewWheelForm.tsx` — optional `sharedRef` (`useImperativeHandle` exposing `getShared` / `setShared`) and `onPendingChange`; otherwise untouched
- `src/renderer/src/pages/PositionsListPage.tsx` + `.test.tsx` — `sheetOpen = location === '/new'`, `onClose → navigate('/', { replace: true })`, focus restore to the `+ New Wheel` trigger, `recorded` banner state

**Red — tests to write:**

- `PositionsListPage.test.tsx` (mock wouter `useLocation` / `useSearch`): at `/` no dialog; at `/new` a `role="dialog"` named `New position` renders over the list with the `Standard / PMCC` group, `Standard` selected, the wheel fields (`#ticker`, `#strike`, `#contracts`, `#premiumPerContract`, `#expiration`) and an `Open wheel` submit; the list rows are still in the DOM (not unmounted). Flipping the mocked location `/new → /` unmounts the dialog and **does not remount the page** (a `useRef` counter or a mocked child's mount spy stays at 1). After `onRecorded({ ticker: 'XYZ', kind: 'PMCC' })` the page shows `PMCC recorded — XYZ · LEAPS + short call open` with a `View position →` link to `#/positions/<id>`.
- `NewPositionSheet.test.tsx`: Escape, the × button, the scrim and `Cancel` each call `onClose`; none does while `isPending`; `Standard` renders `NewWheelForm` with `defaultTicker` from `?ticker=` and `promoted` from a `?promoted=1…` search (the two cases `NewWheelPage.test.tsx` covered — port them here), and calls `window.history.replaceState` once to drop the promote query; toggling to `PMCC` hides (not unmounts) the wheel form and shows `PmccEntryForm`; typing `XYZ` / `2` in Standard then toggling shows `XYZ` / `2` in PMCC's Ticker and Contracts per leg; toggling back shows the wheel draft's strike/premium still present; the toggle buttons are `disabled` while a mutation is pending; the eyebrow reads `OPEN WHEEL`, title `New position`, subtitle `Record a completed trade`; the helper line reads `Start the wheel with a cash-secured put.` in Standard and `Long LEAPS call + a shorter-dated short call.` in PMCC.
- `StrategyToggle.test.tsx`: `role="group"` `aria-label="Position strategy"`, two `FormButton`s, `aria-label="<choice> selected"` on the active one, `variant` primary/secondary swap, `disabled` prop forwarded.
- `App.test.tsx` (or the existing router test): `#/new` and `#/` both render `PositionsListPage`; `#/new?ticker=AAPL` still reaches the sheet with the ticker pre-filled.

**Green — implementation:**

- Per research ADRs 1, 2 and 8. `NewPositionSheet` (mockup `us-101-open-pmcc-position.mdx`): `SheetOverlay` → `SheetPanel width={460}` → a `role="dialog"` `aria-label="New position"` wrapper that takes focus on open and handles Escape → `SheetHeader eyebrow="OPEN WHEEL" title="New position" subtitle="Record a completed trade"`; a bordered strip holding `StrategyToggle` and the one-line helper; `SheetBody` with both forms (`hidden` on the inactive one); `SheetFooter` is owned by the active form (Standard: the existing `Open Wheel` submit + a `Cancel` secondary; PMCC: area 10).
- `NewWheelForm` keeps its success card and 2 s redirect; the sheet passes `navigate` through.
- `PositionsListPage` renders `<NewPositionSheet open={sheetOpen} search={search} onClose onRecorded returnFocusRef />` and the `PositionsRecordedBanner` (role `status`, `AlertBox variant="success"`) above the table when `recorded` is set; clear it on the next open.

**Refactor — cleanup to consider:**

- `PAGE_TITLES['/new'] = 'Open Wheel'` still applies (the list is underneath); leave it. Remove `Breadcrumb` usage that only `NewWheelPage` needed if it becomes unused (it is used elsewhere — verify before deleting).
- `NewWheelForm`'s `navigate = () => {}` default and the new ref prop: keep both optional so `NewWheelForm.test.tsx` runs unchanged.

**Acceptance criteria covered:**

- "Open the shared new-position panel" (all four `Then`s); "Switch the entry form in the same panel" (both rows: same panel, retained drafts, shared ticker/quantity, hidden form never submits); "Cancel without recording" (panel closes, list keeps scroll — the page is not remounted); the UI-Changes rules on fresh Standard on reopen and disabled switching while saving.

### 10. PMCC entry form

**Files to create or modify:**

- `src/renderer/src/components/PmccEntryForm.tsx` + `.test.tsx` — RHF + `zodResolver(pmccEntrySchema)`, `mode: 'onBlur'`, `useWatch` for the preview, `useImperativeHandle` for the shared fields
- `src/renderer/src/components/PmccLegSection.tsx` + `.test.tsx` — one `SectionCard headerVariant="emphasized"` per leg
- `src/renderer/src/components/CallContractPicker.tsx` + `.test.tsx` — the chain `<select>` + `Enter manually`
- `src/renderer/src/components/PmccCashFlows.tsx` + `.test.tsx` — the "Opening cash flows" block

**Red — tests to write:**

- `PmccEntryForm.test.tsx` (mock `useCallChain`, `useStockQuotes`, `useCreatePmccPosition`): renders `Ticker` and `Contracts per leg` in a two-column grid, then `Buy LEAPS call` (`BUY TO OPEN` chip, filter caption `180+ DTE · Δ 0.70–0.85`) and `Sell short call` (`SELL TO OPEN`, `20–45 DTE · Δ 0.25–0.35`), then `Opening cash flows`, then the `Advanced · Thesis and notes` disclosure; footer shows `Initial net debit —` while fills are empty and `$2,300.00` once the fixture is entered; `Record PMCC` is disabled while the form is invalid and reads `Recording…` + disabled while pending; the small print `Uses your actual fills. No order is placed.` is present. Submitting the fixture calls the mutation with the contract example payload; on success calls `onRecorded({ id, ticker, kind: 'PMCC' })`. An IPC 400 with `field 'short.expiration'` renders `Short call must expire before the LEAPS call.` inside the short section's Expiration `Field` (role `alert`); `field '__pair__'` renders above the cash flows; `field 'long.contracts'` renders on `Contracts per leg`; an `internal_error` renders `Could not record PMCC. Your entries are preserved. Try again.` as an `AlertBox variant="error"` at the top of the body, keeps every input value and re-enables `Record PMCC`. Changing Ticker clears both legs' `contractId`, strike, expiration and fill price but not fees/fill dates. Each leg's fill date defaults to today and fees to `0.00`.
- `CallContractPicker.test.tsx`: options come from `contracts` via `formatContractOption`, first option `Choose contract / enter manually`; choosing an option calls `onSelect` with a `ContractSelection` (`{ strike, expiration, contractId }`); `Enter manually` calls `onSelect(null)`; the notice from `deriveChainNotice`, rendered through `chainNoticeMessage`, shows in a gold `role="status"` box (the mockup's `bg-wb-gold-dim text-wb-gold`) and never blocks the inputs.
- `PmccLegSection.test.tsx`: the quote block shows `Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80` and the quote time `Sep 14, 2026 · 10:42 ET` for the selected contract; `Quote / delta: —` and `No quote available` when the selected contract has no quote; the DTE hint `368 DTE` under Expiration; strike and expiration inputs are `readOnly` while a chain contract is selected and editable after `Enter manually`; the fill label is `Actual purchase / share` (long) and `Actual sale / share` (short); the cash-flow preview line reads `Debit $2,500.00` / `Credit $200.00`.
- `PmccCashFlows.test.tsx`: rows `LEAPS purchase cost $2,500.00`, `Short-call credit $200.00`, `Fees $0.00`; `Strike width / share: $30.00`; `Debit / width before fees: 76.67%`; the muted line `Opening credit is not yet realized profit.`; all `—` while either fill is empty; with fees 1.00 / 1.00 → `Fees $2.00` and the footer debit `$2,302.00` while the ratio stays `76.67%`; the words `max profit`, `breakeven`, `realized` (as a gain) do not appear.

**Green — implementation:**

- Per the mockup's PMCC branch and data-model §7–§8. `PmccEntryForm` owns the `<form>` and the `SheetFooter` content (`Initial net debit` line, `Cancel` secondary, `Record PMCC` primary with `pendingLabel="Recording…"`). Preview values come from `calculatePmccOpeningDebit` (imported from `main/core/costbasis`) fed by `useWatch` on the four money fields + contracts + strikes; guard with `parseInputDecimal` so half-typed values render `—`.
- `CallContractPicker` uses `useCallChain({ ticker, preset, underlyingPrice })` where `underlyingPrice` comes from `useStockQuotes([ticker])` (already polled on the list page; the query is shared).
- Field ids for e2e: `#pmcc-ticker`, `#pmcc-contracts`, `#long-strike`, `#long-expiration`, `#long-fill`, `#long-fees`, `#long-fill-date`, `#long-contract` (the select), same with `short-`; `data-testid="record-pmcc"` on the submit.
- Tailwind + `wb-*` tokens only; the quote block is the mockup's `border-l-2 border-wb-gold pl-3` strip; errors use `Field`'s `error` prop (red, `role="alert"`).

**Refactor — cleanup to consider:**

- The leg section is rendered twice with a `leg: 'long' | 'short'` prop and a preset — make sure nothing is duplicated between the two invocations beyond labels (a `LEG_COPY` record).
- `NewWheelForm`'s `API_TO_FORM_FIELD` mapping is snake_case-era; the PMCC form needs none (paths match). Do not extend the old map.

**Acceptance criteria covered:**

- "Select the two contracts independently"; "Review the initial cash flows" (incl. "does not present short-call credit as earned profit or show a guaranteed maximum profit or breakeven"); "Continue when market data cannot supply a selection" (manual entry stays available, selections and fills preserved); "Recover from a failed save" (message, preserved entries, button available again); UI-Changes: `Recording…`, no duplicate submit, refreshed quotes never overwrite fills, ticker change clears selections.

### 11. Minimal PMCC row and detail page

**Files to create or modify:**

- `src/renderer/src/components/PmccPositionRow.tsx` + `.test.tsx` — new
- `src/renderer/src/components/PositionCard.tsx` — delegate to `PmccPositionRow` when `item.pmcc`
- `src/renderer/src/components/position-cockpit/PmccLegReference.tsx` + `.spec.tsx` — new
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — PMCC branch
- `src/renderer/src/pages/PositionDetailContent.tsx` — hide `PositionAlertOverridesForm` for PMCC
- `src/renderer/src/components/PositionDetailActions.test.tsx` — regression case

**Red — tests to write:**

- `PmccPositionRow.test.tsx`: `data-testid="position-card"` row; ticker cell shows `XYZ` and a `PMCC` badge; phase cell shows `LEAPS + short call open`; Price cell still renders the live quote; Opt Mid and P&L cells show `—`; Strike cell `$80.00 / $110.00`; Expiration cell two lines `LEAPS · 2027-09-17` and `Short · 2026-10-16`; DTE cell `368d` / `32d`; Premium cell `$200.00`; Cost Basis cell `$2,300.00 net debit`; click navigates to `#/positions/<id>`; no `TargetBadge` and no `ExpiringSoonFlag` (wheel-only badges) render.
- `PositionCard.test.tsx`: a wheel item renders exactly as before (existing assertions untouched); an item with `pmcc` renders `PmccPositionRow`.
- `PmccLegReference.spec.tsx`: two `SectionCard`s titled `Buy LEAPS call` and `Sell short call`, each with `Strike`, `Expiration`, `DTE`, `Contracts`, `Actual fill`, `Fill date`, `Fees`; an `Initial net debit $2,300.00` stat; the caption `Live P&L unavailable until PMCC valuation ships`; no `VerdictBlock`, no `Cost basis & history` drawer (US-103 owns that panel), no phase-verdict copy.
- `PositionCockpit.spec.tsx`: `strategyType 'PMCC'` + `activeLeg null` renders `PmccLegReference`, not the `SHARES_VERDICT` block.
- `PositionDetailContent` test: `PositionAlertOverridesForm` absent for PMCC, present for a wheel.
- `PositionDetailActions.test.tsx`: `phase 'PMCC_OPEN'` renders only the badge — no `record-call-away-btn`, `roll-cc-btn`, `open-covered-call-btn`, `roll-csp-btn`, `record-assignment-btn`, `record-expiration-btn`.

**Green — implementation:**

- `PmccPositionRow` in the same `<tr>` / `TableCell` pattern as `PositionRow` (same `CELL_CLASS`, `VALUE_CLASS`), `Badge` `PMCC`, `PhaseBadge` for the phase, `PriceCell` reused, `fmtMoney` with thousands separators for the debit (add a `fmtMoneyGrouped` if `fmtMoney` lacks grouping — the AC strings are `$2,300.00`).
- `PmccLegReference` from `detail.legs` filtered by `legRole` (`LEAPS_OPEN`, `SHORT_CALL_OPEN`) and `detail.costBasisSnapshot` (`basisPerShare × 100 × contracts`).
- Branches by `strategyType`, never by phase string, so US-118 can replace one component.

**Refactor — cleanup to consider:**

- `PositionRow` has grown props for pending assignments, target badges etc. that PMCC ignores; keep `PmccPositionRow`'s props to what it renders. Check `fmtMoney` callers before changing its output format — add a sibling rather than altering it.

**Acceptance criteria covered:**

- "Record the position and view both legs": one PMCC position appears with status `LEAPS + short call open` and initial net debit $2,300.00; the detail page shows both legs with quantities, actual fills, fill dates, strikes, expirations; the row identifies PMCC and labels each leg's expiration separately. UI-Changes: no wheel-only labels, P&L formulas, target badges or Record Call-Away on a PMCC; combined live P&L shown as unavailable.

### 12. Test seam: chain delay in the fake provider

**Files to create or modify:**

- `src/main/integrations/fake-market-data.ts` — `FAKE_OPTION_CHAIN_DELAY_MS`
- `src/main/integrations/fake-market-data.test.ts`

**Red — tests to write:**

- With `FAKE_OPTION_CHAIN_DELAY_MS=50`, `getOptionChainSnapshot` resolves no sooner than 50 ms (fake timers); unset → resolves on the next tick; the delay does not apply to `getOptionSnapshot` or `getStockQuotes`.

**Green — implementation:**

- `await delay(Number(process.env.FAKE_OPTION_CHAIN_DELAY_MS ?? 0))` at the top of `getOptionChainSnapshot`, after `maybeThrow()`.

**Refactor — cleanup to consider:**

- `parseEnv` already centralises env reads in this file; use it (or a sibling `envNumber`) rather than a bare `process.env` read.

**Acceptance criteria covered:**

- Makes "the call chain request is still loading → Loading call contracts…" deterministically testable end to end.

### 13. E2e Tests

**Files to create or modify:**

- `e2e/open-pmcc-position.spec.ts` — new; one `it` per AC scenario, one `it.each` row per Scenario Outline example, names mirroring the Gherkin
- `e2e/pmcc-helpers.ts` — `launchPmcc(dbPath, { fixtures, env })`, `openNewPositionSheet(page)`, `selectPmcc(page)`, `fillPmccLegs(page, fixture)`, `pmccFixture(today)` (dates from `localDate(368)` / `localDate(32)`), `xyzChainFixtures(overrides)` (OCC-keyed, with `greeks.delta`, `bid/ask/mid`, `timestamp`), `recordPmcc(page)`, `positionRows(page)`
- Existing specs and `e2e/helpers.ts`: **unchanged**. If one flakes on `[role="status"]` because the list now sits under the sheet, scope that selector to `[role="dialog"] [role="status"]` in that spec only.

**Red — tests to write (AC audit — every AC bullet appears exactly once):**

Scenario: Open the shared new-position panel

- `opens a right-hand "New position" panel over the positions list with "Standard" selected` — seed one wheel first so the list has a row; click the sidebar `Open Wheel`; assert `role=dialog[name="New position"]` visible, the wheel row still visible behind the scrim, `Standard` has `aria-label="Standard selected"`.
- `the panel shows the existing standard wheel fields and "Open Wheel" submit action` — `#ticker`, `#strike`, `#contracts`, `#premiumPerContract`, `#expiration` present; `button[aria-label="Open wheel"]` present.
- `a "Standard / PMCC" toggle is visible above the form` — `role=group[name="Position strategy"]` precedes the first field in DOM order.

Scenario Outline: Switch the entry form in the same panel

- `Standard → PMCC: the same panel shows Buy LEAPS call and Sell short call sections and the Record PMCC action` — type ticker `XYZ` and contracts `2` in Standard, toggle; same dialog element (compare a `data-dialog-id`), sections visible, `data-testid=record-pmcc`, `#pmcc-ticker` = `XYZ`, `#pmcc-contracts` = `2`; toggle back → strike/premium draft still present, `#ticker` = `XYZ`.
- `PMCC → Standard: the same panel shows the existing opening cash-secured put fields and the Open Wheel action` — start in PMCC with a partial draft, toggle; wheel fields shown; `listPositions` via `window.api.listPositions()` still empty (switching records nothing); the PMCC fields are not in the submitted form (`form:visible` contains no `#long-fill`).

Scenario: Select the two contracts independently

- `selecting the XYZ $80 call expiring in 368 days for the long leg shows its strike, expiration, 368 DTE, quote timestamp, and bid, ask, mid and delta` — choose from `#long-contract`; assert `#long-strike` = `80.00`, `#long-expiration` = the date, hint `368 DTE`, quote strip contains `Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80` and a time.
- `the short-call selection remains independent and is limited to XYZ calls` — `#short-contract` options list only the short-band XYZ calls (an ABC call and an XYZ put in the fixture never appear); selecting in `#short-contract` leaves `#long-strike` untouched.
- `the actual fill price remains a separate required input` — after both selections `#long-fill` is empty and `record-pmcc` is disabled until it is typed.

Scenario: Review the initial cash flows

- `shows LEAPS purchase cost $2,500.00 and Short-call credit $200.00` after entering both fills.
- `shows Fees $0.00 and Initial net debit $2,300.00`.
- `shows Strike width / share $30.00 and Debit / strike width, before fees 76.67%`.
- `does not present short-call credit as earned profit or show a guaranteed maximum profit or breakeven` — the dialog text contains `Opening credit is not yet realized profit.` and does not match `/max(imum)? profit|breakeven/i`.
- (UI-Changes example) `adding $1.00 of fees to each leg changes the debit to $2,302.00 while the ratio stays 76.67%`.

Scenario: Record the position and view both legs

- `selecting Record PMCC closes the panel and one PMCC position appears with status "LEAPS + short call open" and initial net debit $2,300.00` — dialog detached; `PMCC recorded — XYZ · LEAPS + short call open` banner; exactly one `[data-testid=position-card]` with `PMCC`, `LEAPS + short call open`, `$2,300.00 net debit`.
- `its detail page shows both legs with their quantities, actual fills, fill dates, strikes, and expirations` — click the row; both `SectionCard`s with `1` contract, `$25.00` / `$2.00`, today's date, `$80.00` / `$110.00`, both expirations.
- `its row in the positions list identifies PMCC and labels each leg's expiration separately` — row contains `LEAPS · <date> · 368d` and `Short · <date> · 32d`.
- `no broker order is submitted` — with `FAKE_BROKER=true`, `window.api.broker.activities({ type: 'FILL' })` after recording returns no XYZ fill (the fake broker's activity log is empty), and the fake broker order count (if the fake exposes one) is unchanged; at minimum, assert the success path never called a `broker:` channel by spying on `ipcRenderer.invoke` in the preload context via `page.evaluate` wrapping `window.api.broker` before the click.

Scenario Outline: Reject an unsupported or incomplete entry (`it.each`, one row each, name = `rejects when <invalid_case> with "<message>"`; every row also asserts the entered values are still in their inputs and `listPositions()` is empty)

- UI-driven (13 rows): short expiration = LEAPS expiration; short expiration after LEAPS; short strike 75.00; short strike 80.00; long fill empty; contracts 0; contracts 1.5; fill price 0; fill price −1; fees −1; long fill date tomorrow; long fill date after short fill date; expiration on/before fill date; expiration before today; short credit exceeding long cost (2 messages of those 13 rows share a message — `Contracts` 0 and fractional share one, price 0 and negative share one — each still gets its own `it`).
- Boundary-only (4 rows): short underlying `ABC`; short leg is a put; long 1 / short 2 contracts; adjusted deliverable (`deliverableShares: 50`) — via `page.evaluate(() => window.api.createPmccPosition(payload))`, asserting `{ ok: false, errors: [{ field, message }] }` and `listPositions()` empty.

Scenario Outline: Continue when market data cannot supply a selection (`it.each`, one row each; each row types a fill in `#long-fill` before the state and asserts it is preserved and manual entry works)

- `the call chain request is still loading → "Loading call contracts…"` — `FAKE_OPTION_CHAIN_DELAY_MS=1500`.
- `the selected filters return no contracts → "No matching calls. Adjust filters or enter manually."` — fixture with only Δ 0.50 calls for the LEAPS band; the short section still lists its contracts.
- `the market-data request failed → "Quotes unavailable. Enter your filled trade manually."` — `FAKE_MARKET_DATA_ERROR=unknown`.
- `the options quote is stale → "Quote is stale. Verify against your actual fill."` — fixture `timestamp` 10 min old, contract selected.

Scenario: Recover from a failed save without a partial position

- `a storage failure shows "Could not record PMCC. Your entries are preserved. Try again." and neither an incomplete PMCC nor a standalone opening leg appears, and Record PMCC becomes available again` — `chmod 0o444` the DB before clicking; assert the `AlertBox` text, inputs intact, `record-pmcc` enabled; restore permissions; `listPositions()` empty; `window.api.getPosition` not needed — assert via `_test:` if a raw-count channel exists, else via the list.

Scenario: Cancel without recording

- `selecting Cancel closes the panel with no new position and the underlying list retains its scroll position` — seed ~30 wheels so the list scrolls; scroll the list container; open the sheet; type a draft; `Cancel`; assert dialog detached, `listPositions()` count unchanged, the list container's `scrollTop` equals the pre-open value.

**Green — implementation:**

- The helpers above; fixtures keyed `XYZ<yymmdd>C00080000` / `XYZ<yymmdd>C00110000` (dates from `localDate`), plus decoy `ABC…C…` and `XYZ…P…` entries; `launchPmcc` mirrors `launchFreshApp` in `open-covered-call.spec.ts` with `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA`, `FAKE_BROKER`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`.
- Rebuild note: `pnpm rebuild:electron` before `pnpm test:e2e`.

**Refactor — cleanup to consider:**

- `e2e/helpers.ts` and `open-covered-call.spec.ts` both define `selectDate` / `openPosition`; do not touch them here, but `pmcc-helpers.ts` must import from `helpers.ts`, not copy a third time.

**Acceptance criteria covered:**

- All of them — see the audit above: 3 + 2 + 3 + 5 + 4 + 17 + 4 + 1 + 1 = 40 named cases across 9 scenarios.

## AC Audit

| AC (Linear OPT-7)                                            | E2e case(s) in area 13       |
| ------------------------------------------------------------ | ---------------------------- |
| Open the shared new-position panel (3 `Then`s)               | 3 cases                      |
| Switch the entry form in the same panel (2 rows)             | 2 cases                      |
| Select the two contracts independently (3 `Then`s)           | 3 cases                      |
| Review the initial cash flows (4 `Then`s + fee example)      | 5 cases                      |
| Record the position and view both legs (4 `Then`s)           | 4 cases                      |
| Reject an unsupported or incomplete entry (17 rows)          | 17 cases (13 UI, 4 boundary) |
| Continue when market data cannot supply a selection (4 rows) | 4 cases                      |
| Recover from a failed save without a partial position        | 1 case                       |
| Cancel without recording                                     | 1 case                       |

No AC is uncovered.
