# US-101 — Open a PMCC position with two linked opening legs — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Plan: `plans/us-101/plan.md`. Types and rules: `plans/us-101/data-model.md`. Wire shapes: `plans/us-101/contracts/`
- `pnpm rebuild:node` before `pnpm test`; `pnpm rebuild:electron` before `pnpm test:e2e`

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Migration, enums and record types

- [x] **[Red]** Write failing tests — `src/main/db/migrate.test.ts`, `src/main/services/get-position.test.ts`, `src/main/core/types.test.ts`, `src/renderer/src/lib/phase.test.ts`
  - Test cases: after `runMigrations`, `PRAGMA table_info(legs)` includes `fees` with default `'0.0000'`; a leg inserted after migrations up to 016 reads `fees = '0.0000'` once 017 runs; a leg seeded with `fees = '1.0000'` comes back as `legs[0].fees === '1.0000'`; a wheel position from `createPosition` has `legs[0].fees` and `activeLeg.fees` `'0.0000'`; `WheelPhase.parse('PMCC_OPEN')`, `LegRole.parse('LEAPS_OPEN')`, `LegRole.parse('SHORT_CALL_OPEN')` succeed; `WheelPhase.parse('PMCC_LEAPS_ONLY')` throws; every `WheelPhase` value including `PMCC_OPEN` has a colour and both labels; `PHASE_LABEL.PMCC_OPEN === 'LEAPS + short call open'`
  - Property cases: no property — enum additions and a column default, no invariant to generate over
  - Run `pnpm test src/main/db/migrate.test.ts src/main/services/get-position.test.ts src/main/core/types.test.ts src/renderer/src/lib/phase.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `migrations/017_add_leg_fees.sql`, `src/main/core/types.ts`, `src/main/schemas.ts`, `src/main/services/get-position.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/lib/phase.ts` _(depends on: Area 1 Red ✓)_
  - `ALTER TABLE legs ADD COLUMN fees TEXT NOT NULL DEFAULT '0.0000'`
  - `WheelPhase` + `'PMCC_OPEN'`; `LegRole` + `'LEAPS_OPEN'`, `'SHORT_CALL_OPEN'`; `TriggerEvent` + `'PMCC_OPEN'`; `LegRecord.fees: string`
  - `fees` selected and mapped in `GET_LEGS_QUERY`, `mapLegRow`, `LegRow`, `GET_QUERY` / `mapActiveLeg`; `fees: '0.0000'` on every existing `LegRecord` literal (typecheck drives the list: close/assign/open-cc/close-cc/expire-\*/record-call-away/roll-csp/roll-cc services)
  - `IpcLegRecord.fees`, `LegDetail.fees`, renderer `WheelPhase` + `'PMCC_OPEN'`, `PositionDetail.position.strategyType: 'WHEEL' | 'PMCC'`
  - `PHASE_COLOR.PMCC_OPEN` (distinct from every wheel phase), `PHASE_LABEL.PMCC_OPEN` and `PHASE_LABEL_SHORT.PMCC_OPEN` = `'LEAPS + short call open'`, `LEG_ROLE_LABEL.LEAPS_OPEN = 'Buy LEAPS call'`, `.SHORT_CALL_OPEN = 'Sell short call'`
  - Run the same four test files — all tests must pass; `pnpm typecheck` clean
- [x] **[Refactor]** `/refactor` — `src/main/services/get-position.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: fold `mapActiveLeg` into a `mapLegRow` call over a re-aliased row, only if it reads simpler
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Pure opening-debit calculation (core engine)

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts` (`describe('calculatePmccOpeningDebit')`) and `src/main/core/costbasis.property.test.ts`
  - Test cases: fixture (1 contract, fills 25.00 / 2.00, strikes 80 / 110, fees 0 / 0) → `leapsCost '2500.0000'`, `shortCredit '200.0000'`, `fees '0.0000'`, `initialNetDebit '2300.0000'`, `netDebitBeforeFees '2300.0000'`, `basisPerShare '23.0000'`, `strikeWidthPerShare '30.0000'`, `debitToWidthPercent '76.6667'`; fees 1.00 / 1.00 → `fees '2.0000'`, `initialNetDebit '2302.0000'`, `basisPerShare '23.0200'`, ratio still `'76.6667'`; 3 contracts → `'7500.0000'` / `'600.0000'` / `'6900.0000'` / basis `'23.0000'`; width ≤ 0 (80 / 80) → `debitToWidthPercent: null`, other fields computed; fills `25.005` / `2.0049` → every output exactly 4 dp, half-up; short credit exceeding long cost → `netDebitBeforeFees '-100.0000'`, no throw
  - Property cases (`costbasis.property.test.ts`, generators from `test-fixtures/arbitraries.ts`): `initialNetDebit === leapsCost − shortCredit + fees` and `netDebitBeforeFees === leapsCost − shortCredit` as exact `Decimal` identities; `leapsCost === long.fillPrice × 100 × contracts` against an independent `Decimal` formula; `basisPerShare` and `debitToWidthPercent` are invariant under `contracts` scaling (1 vs n); `debitToWidthPercent === null` iff `short.strike ≤ long.strike` (unrounded comparison, so iff is safe); ratio unchanged when fees change; all outputs match `/^-?\d+\.\d{4}$/`
  - Run `pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 2 Red ✓)_
  - `PmccOpeningLegInput { strike; fillPrice; fees }` (structural subset of `OpenPmccLegInput`), `PmccOpeningDebitInput { contracts; long; short }`, `PmccOpeningDebitResult` per data-model §4
  - `calculatePmccOpeningDebit` using the module's `round4` and `sharesFromContracts`; `debitToWidthPercent = (longFill − shortFill) / (short.strike − long.strike) × 100`, `null` when width ≤ 0; every output `toFixed(4)`
  - No logging, no imports beyond `decimal.js`
  - Run `pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: a `money4(d: Decimal): string` helper if it removes the `round4(...).toFixed(4)` repetition across new and old functions
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Pure PMCC entry validation (core engine)

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts` (`describe('openPmcc')`) and `src/main/core/lifecycle.property.test.ts`
  - Test cases: valid fixture (data-model §11, `referenceDate` = both fill dates) → `{ phase: 'PMCC_OPEN' }`; one case per row of data-model §4's rule table (16 rules, 25 cases with `long`/`short` variants) asserting the thrown `ValidationError`'s `field`, `code` and exact `message` — short expiration equal to / after LEAPS → `short.expiration` / `short_not_before_long`; short underlying `ABC` → `underlying_mismatch`; short `PUT` → `not_a_call`; long 1 / short 2 → `short.contracts` / `quantity_mismatch`; short strike 75 and 80 → `strike_not_above_long`; `deliverableShares 50` → `nonstandard_deliverable`; contracts 0 and 1.5 → `must_be_positive_integer`; fill 0 and −1 → `must_be_positive`; fees −1 → `must_be_non_negative`; long fill after `referenceDate` → `cannot_be_future`; long fill after short fill → `short.fillDate` / `long_after_short`; expiration = fill date → `expiration_not_after_fill`; expiration before `referenceDate` → `expired_contract`; short fill 25.00 (equal) and 26.00 → `__pair__` / `not_net_debit`; rule order: strike rule + net-debit rule both broken → strike rule reported; ISO string comparison across different years orders correctly
  - Property cases (`lifecycle.property.test.ts`): a generated valid PMCC input (`ticker`, `orderedDays` for long fill ≤ short fill < short expiration < long expiration, short strike > long strike via `positiveMoney` offsets, long fill > short fill, `contracts`, non-negative fees) always returns `{ phase: 'PMCC_OPEN' }`; guards — for a valid base input, any `short.strike ≤ long.strike` throws `strike_not_above_long` on `short.strike`, any `short.expiration ≥ long.expiration` throws `short_not_before_long`, any `short.fillPrice ≥ long.fillPrice` throws `not_net_debit` on `__pair__`, any `instrumentType 'PUT'` on either leg throws `not_a_call` on that leg's path; every thrown `field` is a member of `PmccField`
  - Run `pnpm test src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 3 Red ✓)_
  - `OpenPmccLegInput` (`instrumentType: OptionInstrumentType` from `core/types.ts`), `OpenPmccInput`, `OpenPmccResult { phase: 'PMCC_OPEN' }`, `PmccField = 'ticker' | '__pair__' | \`${'long' | 'short'}.${keyof OpenPmccLegInput}\``
  - `openPmcc` checks rules 1–16 in data-model §4 order, reusing `TICKER_RE`, `requirePositiveStrike`, `requirePositiveDecimal`; new per-leg helpers `requireCall`, `requireStandardDeliverable`, `requireNonNegativeDecimal`, `requireFillDateNotFuture` taking `field: PmccField`
  - String comparison on ISO dates; no I/O, no logging
  - Run `pnpm test src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: switch `openWheel` / `openCoveredCall` to the parameterised helpers only if they read cleaner; otherwise leave them
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 12 — Test seam: chain delay in the fake provider

- [x] **[Red]** Write failing tests — `src/main/integrations/fake-market-data.test.ts`
  - Test cases: with `FAKE_OPTION_CHAIN_DELAY_MS=50`, `getOptionChainSnapshot` resolves no sooner than 50 ms (fake timers); unset → resolves on the next tick; the delay does not apply to `getOptionSnapshot` or `getStockQuotes`
  - Property cases: no property — not a core engine
  - Run `pnpm test src/main/integrations/fake-market-data.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/fake-market-data.ts` _(depends on: Area 12 Red ✓)_
  - `await delay(Number(process.env.FAKE_OPTION_CHAIN_DELAY_MS ?? 0))` at the top of `getOptionChainSnapshot`, after `maybeThrow()`
  - Run `pnpm test src/main/integrations/fake-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/fake-market-data.ts` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: read the env through `parseEnv` (or a sibling `envNumber`), not a bare `process.env`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Payload schema and envelope (depends on Layer 1)

> Starts after Area 1 Green and Area 2 Green.

### Area 4 — Payload schema, result type, dotted error paths

**Requires:** Area 1 Green ✓ (`TriggerEvent 'PMCC_OPEN'`, `LegRecord.fees`), Area 2 Green ✓ (`PmccOpeningDebitResult`)

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts`, `src/main/ipc/utils.test.ts` (create if absent) _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Test cases: the contract fixture payload parses; `strategy: 'WHEEL'` fails; missing `long.fillPrice` → one issue at path `['long','fillPrice']` with `Enter the actual LEAPS fill price.`; missing `short.fillPrice` → `Enter the actual short-call fill price.`; `short.expiration '10/16/2026'` fails with `IsoDateMessage`; `fees: -1`, `contracts: 0`, `strike: 0`, `deliverableShares: 50` all **pass** Zod (engine-owned rules, no `.int()` on `deliverableShares`); `handleIpcCall` with a `ZodError` at path `['long','fillPrice']` returns `errors[0].field === 'long.fillPrice'`; single-segment path still `'ticker'`; empty path → `'__root__'`; a `ValidationError('short.strike', …)` passes its dotted field through
  - Property cases: no property — Zod shape and a path join
  - Run `pnpm test src/main/schemas.test.ts src/main/ipc/utils.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/ipc/utils.ts` _(depends on: Area 4 Red ✓)_
  - `PmccLegPayloadSchema`, `CreatePmccPositionPayloadSchema` (`strategy: z.literal('PMCC')` kept; `z.number({ error })` for the two fill-price messages; `deliverableShares: z.number()`), `CreatePmccPositionPayload`
  - `CreatePmccPositionResult` with literal intersections per data-model §5: `position: PositionRecord & { strategyType: 'PMCC'; phase: 'PMCC_OPEN'; status: 'ACTIVE'; closedDate: null }`, `longLeg` / `shortLeg: LegRecord & { legRole; action; instrumentType: 'CALL'; fillPrice: string }`, `costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_OPEN'; finalPnl: null }`, `openingDebit: PmccOpeningDebitResult`
  - `handleIpcCall` Zod mapping: `issue.path.join('.') || '__root__'`
  - Run `pnpm test src/main/schemas.test.ts src/main/ipc/utils.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check duplication and naming against `OpenCcPayloadSchema` / `RollPayloadBaseSchema` (ISO-date regex constant already shared)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service and renderer pure helpers (depends on Layer 2)

> These two areas run in parallel after Area 4 Green.

### Area 5 — `createPmccPosition` service

**Requires:** Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/create-pmcc-position.test.ts` (`makeTestDb()`) _(depends on: Area 4 Green ✓)_
  - Test cases: valid fixture → `position` (`strategyType 'PMCC'`, `phase 'PMCC_OPEN'`, `status 'ACTIVE'`, `openedDate` = long fill date), `longLeg` (`LEAPS_OPEN` / `BUY` / `CALL` / `strike '80.0000'` / `premiumPerContract '25.0000'` / `fillPrice '25.0000'` / `fees '0.0000'`), `shortLeg` (`SHORT_CALL_OPEN` / `SELL` / `CALL` / `'110.0000'` / `'2.0000'`), `costBasisSnapshot` (`triggerEvent 'PMCC_OPEN'`, `basisPerShare '23.0000'`, `totalPremiumCollected '200.0000'`, `finalPnl null`), `openingDebit.initialNetDebit '2300.0000'`; exactly one `positions` row, two `legs` rows (LEAPS first in `GET_LEGS_QUERY` order), one snapshot; `roll_chain_id` null on both legs; fees 1.00 / 1.00 → legs `fees '1.0000'`, snapshot `basisPerShare '23.0200'`, `totalPremiumCollected '199.0000'`, `initialNetDebit '2302.0000'`; invalid entry (short expiration after LEAPS) → `ValidationError` with `field 'short.expiration'` and zero rows in all three tables; third insert throws (snapshot table dropped) → error propagates, no position and no legs remain; `ivrOnDemand.collect` called once with the ticker after commit, not on rejection; `getPosition(db, id)` → `activeLeg: null`, `legs.length === 2`, `costBasisSnapshot.triggerEvent === 'PMCC_OPEN'`; `listPositions` still returns the item without throwing; `logger.info` `'pmcc_position_created'` on success and `'pmcc_entry_rejected'` (`field`, `code`) on rejection
  - Property cases: no property — service over SQLite; the invariants are covered by Areas 2 and 3
  - Run `pnpm test src/main/services/create-pmcc-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/create-pmcc-position.ts`, re-export from `src/main/services/positions.ts` _(depends on: Area 5 Red ✓)_
  - `createPmccPosition(db, payload, ivrOnDemand?)`: `today = localToday()`; DEBUG `create_pmcc_position_inputs`; `openPmcc({...})` in `try/catch` that logs INFO `pmcc_entry_rejected` and rethrows; `calculatePmccOpeningDebit({ contracts, long, short })` with the payload legs passed through; DEBUG `pmcc_opening_debit_calculated`; one `db.transaction` inserting the rows of data-model §3 (LEAPS then short, same `now`); DEBUG `create_pmcc_position_tx_start` / `_committed`; INFO `pmcc_position_created { positionId, ticker, phase, initialNetDebit }`; `void ivrOnDemand?.collect(ticker)`; return `CreatePmccPositionResult`
  - Money through `new Decimal(x).toFixed(4)` as `createPosition` does; no broker import
  - Run `pnpm test src/main/services/create-pmcc-position.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/create-pmcc-position.ts`, `src/main/services/positions.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: extract `insertPosition(db, row)` / `toPositionRecord` (and an `insertLeg` helper if the roll services already share one) when `createPosition` and `createPmccPosition` are byte-identical apart from `strategy_type` / `phase`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8 — Renderer chain access and pure entry helpers

**Requires:** Area 3 Green ✓ (`PmccField`), Area 4 Green ✓ (`CreatePmccPositionPayload`)

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-entry.test.ts`, `src/renderer/src/schemas/pmcc-entry.test.ts`, `src/renderer/src/hooks/useCallChain.test.ts`, `src/renderer/src/api/market-data.test.ts` _(depends on: Area 4 Green ✓)_
  - Test cases (`lib/pmcc-entry`): `filterCallChain` keeps Δ 0.80 for the LEAPS preset, drops Δ 0.60 and 0.90, keeps a contract with no greeks at the end, treats `-0.30` as 0.30; `deriveChainNotice` returns a kind — pending → `'loading'`, error → `'unavailable'`, success + empty → `'empty'`, selected quote 6 min old → `'stale'`, 1 min old → `null`, pending outranks stale; `chainNoticeMessage` maps the four kinds to `Loading call contracts…` / `Quotes unavailable. Enter your filled trade manually.` / `No matching calls. Adjust filters or enter manually.` / `Quote is stale. Verify against your actual fill.` and `null` → `null`; `chainWindow(LEAPS_PRESET, 2026-09-14)` → `{ expirationFrom: '2027-03-13' }`; `chainWindow(SHORT_PRESET, …)` → `{ from: '2026-10-04', to: '2026-10-29' }`; `strikeBounds(LEAPS_PRESET, '100.00')` → `{ strikeTo: '100.00' }`, short → `{ strikeFrom }`, null price → `{}`; `formatContractOption` (LEAPS fixture, 2026-09-14) → `'Sep 17, 2027 · $80.00 · 368 DTE · Δ 0.80 · mid $25.00'`, missing greeks → `Δ —`
  - Test cases (`schemas/pmcc-entry`): fixture parses; empty long fill → `long.fillPrice` `Enter the actual LEAPS fill price.`; `'0'` fill → `Actual fill price must be greater than zero.`; contracts `'1.5'` / `'0'` → `Contracts must be a positive whole number.`; fees `'-1'` → `Fees cannot be negative.`; short expiration ≥ long → `short.expiration`; short strike ≤ long → `short.strike`; long fill date after short → `short.fillDate`; future fill date, expiration ≤ fill date, expiration before today → their messages; short fill ≥ long fill → path `['__pair__']` `This PMCC entry requires a net debit before fees.`; `toCreatePmccPayload` produces the contract example JSON
  - Test cases (`useCallChain`, mock `window.api.marketData.optionChain`): calls the IPC with `type: 'call'`, the preset's window and strike bounds; returns `{ status, contracts (filtered), error }`; no query when `ticker` is empty or fails `tickerSchema`; query key changes with the ticker. (`api/market-data`): `getOptionChain` throws `ApiError` 502 on `{ ok: false }`, returns `snapshots` on success
  - Property cases: no property — renderer helpers, not `src/main/core/`
  - Run `pnpm test src/renderer/src/lib/pmcc-entry.test.ts src/renderer/src/schemas/pmcc-entry.test.ts src/renderer/src/hooks/useCallChain.test.ts src/renderer/src/api/market-data.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-entry.ts`, `src/renderer/src/schemas/pmcc-entry.ts`, `src/renderer/src/api/market-data.ts`, `src/renderer/src/hooks/marketDataQueryKeys.ts`, `src/renderer/src/hooks/useCallChain.ts` _(depends on: Area 8 Red ✓)_
  - `LEAPS_PRESET`, `SHORT_PRESET`, `STALE_QUOTE_MS`, `ChainNotice` kind union, `CHAIN_NOTICE_COPY`, `chainNoticeMessage`, `ContractSelection`, `filterCallChain`, `deriveChainNotice`, `chainWindow`, `strikeBounds`, `formatContractOption` (calls `computeDteFromInput`) per data-model §8
  - `pmccEntrySchema` with `superRefine` for rules 10–16 (string date comparison, `parseInputDecimal`), `CROSS_LEG_PATHS … as const satisfies readonly PmccField[]`, `PmccEntryFormValues`, `toCreatePmccPayload`, `EMPTY_PMCC_DEFAULTS(today)` (no `.default()` on the schema)
  - `OptionChainQuote` mirror + `getOptionChain(filter)`; `optionChain(filter)` query key; `useCallChain({ ticker, preset, underlyingPrice })` = `useQuery` with `staleTime 30_000`, `refetchInterval 60_000`, `enabled` on `tickerSchema`, `select: filterCallChain`
  - Run the same four test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/pmcc-entry.ts`, `src/renderer/src/schemas/pmcc-entry.ts` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the `deriveChainNotice` / `chainNoticeMessage` split parallel to `derivePromoteBanner` / `promoteBannerMessage`; do not merge the two
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Transport and list (depends on Layer 3)

> These two areas run in parallel after Area 5 Green.

### Area 6 — IPC handler, preload, renderer adapter, mutation hook

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts`, `src/renderer/src/api/positions.test.ts` (or inline in the hook test), `src/renderer/src/hooks/useCreatePmccPosition.test.ts` _(depends on: Area 5 Green ✓)_
  - Test cases: `positions:create-pmcc` is registered; a valid payload calls `createPmccPosition(db, parsedPayload, ivrOnDemand)` and returns `{ ok: true, ...result }`; missing `long.fillPrice` → `{ ok: false, errors: [{ field: 'long.fillPrice', … 'Enter the actual LEAPS fill price.' }] }` without calling the service; a service `ValidationError('short.strike', 'strike_not_above_long', …)` returns that envelope; a generic throw → `internal_error`; renderer `createPmccPosition` passes the payload through unchanged (camelCase end to end), throws `ApiError` 400 with the field errors on `{ ok: false }`, returns the result on success; `useCreatePmccPosition` invalidates `positionQueryKeys.all` on success
  - Property cases: no property — transport
  - Run `pnpm test src/main/ipc/positions.test.ts src/renderer/src/hooks/useCreatePmccPosition.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/hooks/useCreatePmccPosition.ts` _(depends on: Area 6 Red ✓)_
  - Handler: `ipcMain.handle('positions:create-pmcc', (_, payload) => handleIpcCall('positions_create_pmcc_unhandled_error', () => createPmccPosition(db, CreatePmccPositionPayloadSchema.parse(payload), ivrOnDemand)))` — nothing else
  - Preload `createPmccPosition`; `IpcCreatePmccPositionPayload`, `IpcCreatePmccPositionResult` with the same literal narrowing as the main type (as `IpcRollCspResult` does), the `api` entry
  - Renderer `CreatePmccPositionPayload`, `CreatePmccPositionResponse`, `createPmccPosition()`; hook mirroring `useCreatePosition`
  - Run the same test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/positions.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: a `registerParsedHandler` without the `positionId` constraint, used for the new channel only; do not change `positions:create`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 7 — Positions list carries the PMCC summary; wheel-only jobs skip PMCC

**Requires:** Area 1 Green ✓, Area 5 Green ✓ (test fixtures create a PMCC)

- [x] **[Red]** Write failing tests — `src/main/services/list-positions.test.ts`, `src/main/services/evaluate-alerts.test.ts`, `src/main/services/detect-assignments.test.ts` _(depends on: Area 5 Green ✓)_
  - Test cases: a PMCC created by `createPmccPosition` lists with `strategyType 'PMCC'`, `pmcc.long` (`strike '80.0000'`, `expiration`, `dte` = `computeDte(expiration)` typed `number`, `contracts 1`), `pmcc.short` likewise, `pmcc.initialNetDebit '2300.0000'`; its `strike`, `expiration`, `dte`, `instrumentType`, `contracts`, `entryPremiumPerContract` are all `null`; `premiumCollected '200.0000'`, `effectiveCostBasis '23.0000'`; a wheel item has `strategyType 'WHEEL'`, `pmcc: null`, every pre-existing key assertion still passes; existing `PositionListItem` fixtures gain `strategyType: 'WHEEL', pmcc: null`; one wheel + one PMCC → PMCC sorts after the wheel and the summary query ran once (`pmcc_summaries_read` DEBUG carries both ids); 3-contract PMCC → `initialNetDebit '6900.0000'`; a `PMCC_OPEN` position with an in-window short call produces no alert and no `logger.error` (`createdCount 0`); a `PMCC_OPEN` position is not an assignment candidate
  - Compile-time guard (no runtime test): a `PmccListItem` with `pmcc: null` or a `WheelListItem` with a summary fails `pnpm typecheck`
  - Property cases: no property — DB-backed service
  - Run `pnpm test src/main/services/list-positions.test.ts src/main/services/evaluate-alerts.test.ts src/main/services/detect-assignments.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/services/list-positions.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts` _(depends on: Area 7 Red ✓)_
  - `PmccLegSummary` (`dte: number`), `PmccListSummary`; `PositionListItem = WheelListItem | PmccListItem` discriminated on `strategyType` per data-model §6, mirrored in `IpcPositionListItem` and the renderer `PositionListItem`
  - `LIST_QUERY` adds `p.strategy_type`; one `SELECT … FROM legs WHERE position_id IN (…) AND leg_role IN ('LEAPS_OPEN','SHORT_CALL_OPEN')` for the PMCC ids; `initialNetDebit = basis_per_share × 100 × contracts` (4 dp); DEBUG `pmcc_summaries_read { ids }`
  - `toWheelItem(row)` / `toPmccItem(row, summary)` return the two arms; the renderer mapper branches once on `strategyType`
  - No change to `evaluate-alerts.ts` / `detect-assignments.ts` — the tests prove the phase filters already exclude PMCC
  - Run the same three test files — all tests must pass; `pnpm typecheck` clean
- [x] **[Refactor]** `/refactor` — `src/main/services/list-positions.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Candidate: a `toListItemBase(row)` if the two builders repeat the same seven base fields
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — PMCC form and PMCC surfaces (depends on Layer 4)

> These two areas run in parallel.

### Area 10 — PMCC entry form

**Requires:** Area 6 Green ✓ (`useCreatePmccPosition`), Area 8 Green ✓ (schema, helpers, `useCallChain`)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PmccEntryForm.test.tsx`, `PmccLegSection.test.tsx`, `CallContractPicker.test.tsx`, `PmccCashFlows.test.tsx` _(depends on: Area 6 Green ✓, Area 8 Green ✓)_
  - Test cases (`PmccEntryForm`, mock `useCallChain`, `useStockQuotes`, `useCreatePmccPosition`): `Ticker` and `Contracts per leg` in a two-column grid, then `Buy LEAPS call` (`BUY TO OPEN`, `180+ DTE · Δ 0.70–0.85`) and `Sell short call` (`SELL TO OPEN`, `20–45 DTE · Δ 0.25–0.35`), then `Opening cash flows`, then `Advanced · Thesis and notes`; footer `Initial net debit —` while fills are empty and `$2,300.00` with the fixture; `Record PMCC` disabled while invalid, reads `Recording…` + disabled while pending; `Uses your actual fills. No order is placed.` present; submitting the fixture calls the mutation with the contract example payload; success → `onRecorded({ id, ticker, kind: 'PMCC' })`; IPC 400 `short.expiration` → message inside the short section's Expiration `Field` (role `alert`); `__pair__` above the cash flows; `long.contracts` on `Contracts per leg`; `internal_error` → `Could not record PMCC. Your entries are preserved. Try again.` as `AlertBox variant="error"`, values kept, button re-enabled; changing Ticker clears both legs' `contractId`, strike, expiration, fill price but not fees / fill dates; fill date defaults to today, fees to `0.00`
  - Test cases (`CallContractPicker`): options via `formatContractOption`, first option `Choose contract / enter manually`; choosing calls `onSelect` with a `ContractSelection`; `Enter manually` → `onSelect(null)`; the notice from `deriveChainNotice` rendered through `chainNoticeMessage` in a gold `role="status"` box that never blocks the inputs
  - Test cases (`PmccLegSection`): quote block `Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80` and `Sep 14, 2026 · 10:42 ET`; `Quote / delta: —` and `No quote available` without a quote; `368 DTE` hint; strike / expiration `readOnly` while a chain contract is selected, editable after `Enter manually`; labels `Actual purchase / share` (long) and `Actual sale / share` (short); preview line `Debit $2,500.00` / `Credit $200.00`
  - Test cases (`PmccCashFlows`): `LEAPS purchase cost $2,500.00`, `Short-call credit $200.00`, `Fees $0.00`, `Strike width / share: $30.00`, `Debit / width before fees: 76.67%`, `Opening credit is not yet realized profit.`; all `—` while either fill is empty; fees 1.00 / 1.00 → `Fees $2.00`, footer `$2,302.00`, ratio `76.67%`; `max profit`, `breakeven`, `realized` (as a gain) absent
  - Property cases: no property — UI components
  - Run `pnpm test src/renderer/src/components/PmccEntryForm.test.tsx src/renderer/src/components/PmccLegSection.test.tsx src/renderer/src/components/CallContractPicker.test.tsx src/renderer/src/components/PmccCashFlows.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PmccEntryForm.tsx`, `PmccLegSection.tsx`, `CallContractPicker.tsx`, `PmccCashFlows.tsx` _(depends on: Area 10 Red ✓)_
  - `PmccEntryForm`: RHF + `zodResolver(pmccEntrySchema)`, `mode: 'onBlur'`, `defaultValues: EMPTY_PMCC_DEFAULTS(today)`, `useWatch` feeding `calculatePmccOpeningDebit` (guarded by `parseInputDecimal`), `useImperativeHandle` for the shared fields; owns the `<form>` and `SheetFooter` (`Initial net debit`, `Cancel`, `Record PMCC` with `pendingLabel="Recording…"`)
  - `CallContractPicker` uses `useCallChain({ ticker, preset, underlyingPrice })` with `underlyingPrice` from `useStockQuotes([ticker])`; `onSelect(selection: ContractSelection | null)`
  - Field ids `#pmcc-ticker`, `#pmcc-contracts`, `#long-strike`, `#long-expiration`, `#long-fill`, `#long-fees`, `#long-fill-date`, `#long-contract` and the `short-` twins; `data-testid="record-pmcc"`
  - Tailwind + `wb-*` tokens only; quote strip `border-l-2 border-wb-gold pl-3`; errors through `Field`'s `error` prop
  - Run the same four test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PmccEntryForm.tsx`, `PmccLegSection.tsx` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The leg section renders twice with `leg: 'long' | 'short'` + preset; nothing beyond labels (a `LEG_COPY` record) should differ. Do not extend `NewWheelForm`'s snake_case `API_TO_FORM_FIELD` map
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 11 — Minimal PMCC row and detail page

**Requires:** Area 1 Green ✓, Area 7 Green ✓ (renderer `PositionListItem` union)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PmccPositionRow.test.tsx`, `PositionCard.test.tsx`, `position-cockpit/PmccLegReference.spec.tsx`, `position-cockpit/PositionCockpit.spec.tsx`, `pages/PositionDetailContent` test, `components/PositionDetailActions.test.tsx` _(depends on: Area 7 Green ✓)_
  - Test cases: `PmccPositionRow` — `data-testid="position-card"` row; `XYZ` + `PMCC` badge; `LEAPS + short call open`; Price cell renders the live quote; Opt Mid and P&L `—`; Strike `$80.00 / $110.00`; Expiration two lines `LEAPS · 2027-09-17` / `Short · 2026-10-16`; DTE `368d` / `32d`; Premium `$200.00`; Cost Basis `$2,300.00 net debit`; click → `#/positions/<id>`; no `TargetBadge`, no `ExpiringSoonFlag`. `PositionCard` — wheel item renders exactly as before; `strategyType 'PMCC'` renders `PmccPositionRow`. `PmccLegReference` — two `SectionCard`s `Buy LEAPS call` / `Sell short call` with `Strike`, `Expiration`, `DTE`, `Contracts`, `Actual fill`, `Fill date`, `Fees`; `Initial net debit $2,300.00`; `Live P&L unavailable until PMCC valuation ships`; no `VerdictBlock`, no `Cost basis & history` drawer. `PositionCockpit` — `strategyType 'PMCC'` + `activeLeg null` renders `PmccLegReference`, not `SHARES_VERDICT`. `PositionDetailContent` — `PositionAlertOverridesForm` absent for PMCC, present for a wheel. `PositionDetailActions` — `phase 'PMCC_OPEN'` renders only the badge (no `record-call-away-btn`, `roll-cc-btn`, `open-covered-call-btn`, `roll-csp-btn`, `record-assignment-btn`, `record-expiration-btn`)
  - Property cases: no property — UI components
  - Run `pnpm test src/renderer/src/components/PmccPositionRow.test.tsx src/renderer/src/components/PositionCard.test.tsx src/renderer/src/components/position-cockpit src/renderer/src/components/PositionDetailActions.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PmccPositionRow.tsx`, `PositionCard.tsx`, `position-cockpit/PmccLegReference.tsx`, `position-cockpit/PositionCockpit.tsx`, `pages/PositionDetailContent.tsx` _(depends on: Area 11 Red ✓)_
  - `PmccPositionRow` in the `PositionRow` `<tr>` / `TableCell` pattern (`CELL_CLASS`, `VALUE_CLASS`), `Badge` `PMCC`, `PhaseBadge`, `PriceCell` reused, grouped money for the debit (add `fmtMoneyGrouped` if `fmtMoney` lacks grouping)
  - `PmccLegReference` from `detail.legs` filtered by `legRole` and `detail.costBasisSnapshot` (`basisPerShare × 100 × contracts`)
  - Branch on `strategyType` (narrowing the union), never on the phase string
  - Run the same test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PmccPositionRow.tsx` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep `PmccPositionRow`'s props to what it renders; add a `fmtMoney` sibling rather than altering its output
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Route and shared sheet (depends on Layer 5)

### Area 9 — Route + `NewPositionSheet` shell + Standard mode

**Requires:** Area 10 Green ✓ (`PmccEntryForm` mounts inside the sheet)

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionsListPage.test.tsx`, `components/NewPositionSheet.test.tsx`, `components/StrategyToggle.test.tsx`, `App.test.tsx` (or the existing router test) _(depends on: Area 10 Green ✓)_
  - Test cases (`PositionsListPage`, mock wouter): at `/` no dialog; at `/new` a `role="dialog"` named `New position` over the list with the `Standard / PMCC` group, `Standard` selected, the wheel fields (`#ticker`, `#strike`, `#contracts`, `#premiumPerContract`, `#expiration`) and `Open wheel`; list rows still in the DOM; `/new → /` unmounts the dialog without remounting the page (mount counter stays 1); after `onRecorded({ ticker: 'XYZ', kind: 'PMCC' })` the page shows `PMCC recorded — XYZ · LEAPS + short call open` with `View position →` to `#/positions/<id>`
  - Test cases (`NewPositionSheet`): Escape, ×, scrim and `Cancel` each call `onClose`, none while `isPending`; `Standard` renders `NewWheelForm` with `defaultTicker` from `?ticker=` and `promoted` from `?promoted=1…` (port the two `NewWheelPage.test.tsx` cases), `history.replaceState` called once; toggling to `PMCC` hides (not unmounts) the wheel form and shows `PmccEntryForm`; `XYZ` / `2` typed in Standard appear in PMCC's Ticker / Contracts per leg; toggling back keeps the wheel draft's strike / premium; toggle disabled while pending; eyebrow `OPEN WHEEL`, title `New position`, subtitle `Record a completed trade`; helper `Start the wheel with a cash-secured put.` / `Long LEAPS call + a shorter-dated short call.`
  - Test cases (`StrategyToggle`): `role="group"` `aria-label="Position strategy"`, two `FormButton`s, `aria-label="<choice> selected"` on the active one, primary / secondary swap, `disabled` forwarded. (`App`): `#/new` and `#/` both render `PositionsListPage`; `#/new?ticker=AAPL` reaches the sheet with the ticker pre-filled
  - Property cases: no property — UI
  - Run `pnpm test src/renderer/src/pages/PositionsListPage.test.tsx src/renderer/src/components/NewPositionSheet.test.tsx src/renderer/src/components/StrategyToggle.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/App.tsx`, `components/NewPositionSheet.tsx`, `components/StrategyToggle.tsx`, `components/NewWheelForm.tsx`, `pages/PositionsListPage.tsx`; delete `pages/NewWheelPage.tsx` + `.test.tsx` _(depends on: Area 9 Red ✓)_
  - One RegExp route `/^\/(new)?$/` → `PositionsListPage`; `sheetOpen = location === '/new'`, `onClose → navigate('/', { replace: true })`, focus restore to the `+ New Wheel` trigger, `recorded` banner state (`PositionsRecordedBanner`, role `status`, `AlertBox variant="success"`), cleared on next open
  - `NewPositionSheet`: `SheetOverlay` → `SheetPanel width={460}` → `role="dialog"` `aria-label="New position"` taking focus and handling Escape → `SheetHeader eyebrow="OPEN WHEEL" title="New position" subtitle="Record a completed trade"`; strip with `StrategyToggle` + helper line; `SheetBody` with both forms (`hidden` on the inactive one); footer owned by the active form
  - `NewWheelForm`: optional `sharedRef` (`useImperativeHandle` exposing `getShared` / `setShared`) and `onPendingChange`; success card and 2 s redirect unchanged
  - Run the same test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/NewPositionSheet.tsx`, `pages/PositionsListPage.tsx` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Leave `PAGE_TITLES['/new']`; verify `Breadcrumb` is used elsewhere before removing anything; keep `NewWheelForm`'s new props optional so its existing test runs unchanged
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/open-pmcc-position.spec.ts`, helpers in `e2e/pmcc-helpers.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC `Then`, one `it.each` row per Scenario Outline example — names mirror the Gherkin (Linear OPT-7). Existing specs and `e2e/helpers.ts` unchanged; `pmcc-helpers.ts` imports from `helpers.ts`, never copies
  - Helpers: `launchPmcc(dbPath, { fixtures, env })` (mirrors `launchFreshApp` with `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA`, `FAKE_BROKER`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`), `openNewPositionSheet`, `selectPmcc`, `fillPmccLegs`, `pmccFixture(today)` (`localDate(368)` / `localDate(32)`), `xyzChainFixtures(overrides)` (OCC-keyed `XYZ<yymmdd>C00080000` / `…C00110000` plus `ABC…C…` and `XYZ…P…` decoys), `recordPmcc`, `positionRows`
  - AC coverage (40 cases across 9 scenarios):
    - Open the shared new-position panel → `it('opens a right-hand "New position" panel over the positions list with "Standard" selected')`, `it('the panel shows the existing standard wheel fields and "Open Wheel" submit action')`, `it('a "Standard / PMCC" toggle is visible above the form')`
    - Switch the entry form in the same panel → `it('Standard → PMCC: the same panel shows Buy LEAPS call and Sell short call sections and the Record PMCC action')`, `it('PMCC → Standard: the same panel shows the existing opening cash-secured put fields and the Open Wheel action')`
    - Select the two contracts independently → `it('selecting the XYZ $80 call expiring in 368 days for the long leg shows its strike, expiration, 368 DTE, quote timestamp, and bid, ask, mid and delta')`, `it('the short-call selection remains independent and is limited to XYZ calls')`, `it('the actual fill price remains a separate required input')`
    - Review the initial cash flows → `it('shows LEAPS purchase cost $2,500.00 and Short-call credit $200.00')`, `it('shows Fees $0.00 and Initial net debit $2,300.00')`, `it('shows Strike width / share $30.00 and Debit / strike width, before fees 76.67%')`, `it('does not present short-call credit as earned profit or show a guaranteed maximum profit or breakeven')`, `it('adding $1.00 of fees to each leg changes the debit to $2,302.00 while the ratio stays 76.67%')`
    - Record the position and view both legs → `it('selecting Record PMCC closes the panel and one PMCC position appears with status "LEAPS + short call open" and initial net debit $2,300.00')`, `it('its detail page shows both legs with their quantities, actual fills, fill dates, strikes, and expirations')`, `it('its row in the positions list identifies PMCC and labels each leg's expiration separately')`, `it('no broker order is submitted')`
    - Reject an unsupported or incomplete entry → `it.each` `rejects when <invalid_case> with "<message>"`: 13 UI-driven rows (short expiration = / after LEAPS; short strike 75.00 / 80.00; long fill empty; contracts 0 / 1.5; fill 0 / −1; fees −1; long fill date tomorrow; long fill after short fill; expiration on/before fill date; expiration before today; short credit exceeding long cost) + 4 boundary rows via `page.evaluate(() => window.api.createPmccPosition(payload))` (short underlying `ABC`; short is a put; long 1 / short 2; `deliverableShares: 50`); every row asserts values preserved and `listPositions()` empty
    - Continue when market data cannot supply a selection → `it.each`: loading (`FAKE_OPTION_CHAIN_DELAY_MS=1500`) → `Loading call contracts…`; no contracts (only Δ 0.50 LEAPS fixtures) → `No matching calls. Adjust filters or enter manually.`; failed request (`FAKE_MARKET_DATA_ERROR=unknown`) → `Quotes unavailable. Enter your filled trade manually.`; stale (`timestamp` 10 min old, contract selected) → `Quote is stale. Verify against your actual fill.`; each row types `#long-fill` first and asserts it is preserved and manual entry works
    - Recover from a failed save without a partial position → `it('a storage failure shows "Could not record PMCC. Your entries are preserved. Try again." and neither an incomplete PMCC nor a standalone opening leg appears, and Record PMCC becomes available again')` (`chmod 0o444` the DB, restore after)
    - Cancel without recording → `it('selecting Cancel closes the panel with no new position and the underlying list retains its scroll position')` (seed ~30 wheels, compare `scrollTop`)
  - `pnpm rebuild:electron && pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Fix only what the failing cases point at; if an existing spec flakes on `[role="status"]` under the sheet, scope that selector to `[role="dialog"] [role="status"]` in that spec only
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/open-pmcc-position.spec.ts`, `e2e/pmcc-helpers.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test:e2e`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] Core-engine areas (2, 3) have property tests; every other area states its "no property" reason
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (40 cases, 9 scenarios — see the AC Audit in `plan.md`)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] `/update-spec us-101` run once the story completes
