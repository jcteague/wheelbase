# US-101: Open a PMCC position with two linked opening legs

<!-- generated:from us-101 -->

## Summary

`Open Wheel` now opens a shared **New position** sheet over the positions list. The sheet has a
`Standard / PMCC` toggle.

- **Standard** is the shipped wheel form, unchanged.
- **PMCC** records a long LEAPS call and a short call together. Each leg can be chain-picked or
  typed, and each carries its actual fill, fill date and fees. A live review shows the opening
  cash flows.

A PMCC save goes through the new `positions:create-pmcc` handler. It writes the position, both
legs and the opening cost-basis snapshot in one transaction. This is journal entry, not order
placement: the service imports no broker module, and the e2e suite asserts that no `broker:`
channel is invoked on the success path.

The trader sees this behaviour today:

- **`Record PMCC` is always enabled.** Submitting an invalid form shows the field and pair errors
  and focuses the first one. While the save is pending the button reads `Recording…`, and a
  re-entry guard ignores double clicks.
- **The "unexpired contract" check runs before the "expiration after fill date" check.** This
  holds in both the engine and the form schema. An already-expired contract entered with today's
  fill date therefore gets `Use an unexpired contract for opening a current position.`
- **List and detail recompute the initial net debit from the two legs' fills and fees.** They do
  not derive it from the rounded per-share `basis_per_share`.
- **The ratio is labelled `Debit / strike width, before fees`.** Fees never change it.
- **The chain picker reads the underlying price from `useUnderlyingPrice`.** This is a one-shot
  quote snapshot on its own query key. It never takes over the positions list's live stock-quote
  subscription.
- **The chain request carries no `limit`.** The adapter follows every page, so a long LEAPS
  window is not truncated.
- **A selected contract survives a refetch.** This holds even when the refetch moves it out of
  the delta band or leaves it out entirely.
- **Closing the sheet returns focus to the element that opened it.** That can be the sidebar item,
  the header link or the empty-state link, with the header trigger as the fallback.

A `PMCC_OPEN` position gets a minimal row and detail page that report only what is true. Every
wheel-only job (alerts, assignment detection, option polling, the calendar) skips it by
construction.

Migration 017 adds `legs.fees`. `NewWheelPage.tsx` is deleted, and `#/` and `#/new` both render
`PositionsListPage`. This story names the PMCC phase and leg roles that the later Epic 09
lifecycle stories use. It also writes the opening snapshot in US-103's ledger convention.

Story: Linear OPT-7 / US-101, 8 points.

## Acceptance criteria

Scenario names come from Linear OPT-7. `e2e/open-pmcc-position.spec.ts` has one `it()` per
`Then` and one `it.each` row per outline example: 40 cases across 9 scenarios. The fixture is XYZ
at $100 with two legs:

- LEAPS: $80 call, 368 DTE, filled at $25.00.
- Short call: $110 call, 32 DTE, filled at $2.00.

1. **Open the shared new-position panel**
   - A right-hand "New position" panel opens over the positions list, with "Standard" selected.
   - The panel shows the existing wheel fields and the "Open Wheel" submit action.
   - A "Standard / PMCC" toggle is visible above the form.
2. **Switch the entry form in the same panel** (outline)
   - Standard → PMCC: the same panel shows the Buy LEAPS call and Sell short call sections and the
     Record PMCC action.
   - PMCC → Standard: the same panel shows the opening cash-secured put fields and the Open Wheel
     action.
   - The panel is not replaced. Both drafts are kept. Ticker and quantity are shared between
     modes, and the hidden form is never submitted.
3. **Select the two contracts independently**
   - Selecting the XYZ $80 call expiring in 368 days for the long leg shows its strike, expiration,
     368 DTE, quote timestamp, and bid, ask, mid and delta.
   - The short-call selection stays independent and offers only XYZ calls.
   - The actual fill price stays a separate required input.
4. **Review the initial cash flows**
   - Shows LEAPS purchase cost $2,500.00 and Short-call credit $200.00.
   - Shows Fees $0.00 and Initial net debit $2,300.00.
   - Shows Strike width / share $30.00 and Debit / strike width, before fees 76.67%.
   - Does not present the short-call credit as earned profit. Shows no guaranteed maximum profit
     and no breakeven.
   - Adding $1.00 of fees to each leg changes the debit to $2,302.00. The ratio stays 76.67%.
5. **Record the position and view both legs**
   - Selecting Record PMCC closes the panel. One PMCC position appears with status "LEAPS + short
     call open" and initial net debit $2,300.00.
   - Its detail page shows both legs with their quantities, actual fills, fill dates, strikes and
     expirations.
   - Its list row identifies it as PMCC and labels each leg's expiration separately.
   - No broker order is submitted.
6. **Reject an unsupported or incomplete entry** (outline, 17 rows named
   `rejects when <invalid_case> with "<message>"`). Every row also checks that the entered values
   are kept and that `listPositions()` returns nothing.
   - Entered through the form (13 rows): - Short expiration equal to or after the LEAPS expiration → `Short call must expire before the
LEAPS call.` - Short strike 75.00 or 80.00 → `Short-call strike must be above the LEAPS strike.` - Long fill empty → `Enter the actual LEAPS fill price.` - Contracts 0 or 1.5 → `Contracts must be a positive whole number.` - Fill price 0 or −1 → `Actual fill price must be greater than zero.` - Fees −1 → `Fees cannot be negative.` - Long fill date tomorrow → `Fill date cannot be in the future.` - Long fill date after the short fill date → `LEAPS must be acquired no later than the
short-call fill.` - Expiration on or before the fill date → `Expiration must be after the fill date.` - Expiration before today → `Use an unexpired contract for opening a current position.` - Short credit greater than the long cost → `This PMCC entry requires a net debit before
fees.`
   - Sent straight to the handler with `window.api.createPmccPosition` (4 rows): - Short underlying `ABC` → `Both calls must have the same underlying.` - Short leg is a put → `PMCC entry requires two call options.` - Long 1 contract, short 2 → `Opening quantities must match for this PMCC entry.` - Adjusted deliverable (`deliverableShares: 50`) → `This entry supports standard 100-share
contracts only.`
7. **Continue when market data cannot supply a selection** (outline, 4 rows). In every row the
   fill is kept and manual entry still works.
   - The chain request is still loading → "Loading call contracts…"
   - The filters return no contracts → "No matching calls. Adjust filters or enter manually."
   - The market-data request failed → "Quotes unavailable. Enter your filled trade manually."
   - The option quote is stale → "Quote is stale. Verify against your actual fill."
8. **Recover from a failed save without a partial position**
   - A storage failure shows "Could not record PMCC. Your entries are preserved. Try again."
     Neither an incomplete PMCC nor a standalone opening leg appears, and Record PMCC becomes
     available again.
9. **Cancel without recording**
   - Selecting Cancel closes the panel. No position is created, and the list underneath keeps its
     scroll position.

## What was built

### The sheet and the route

`App.tsx` sends `/` and `/new` to `PositionsListPage` through a single RegExp route. The page
opens the sheet when the location is `/new`. Every way of closing the sheet calls
`navigate('/', { replace: true })`: Cancel, ×, Escape, the scrim, or a PMCC success.

Because the page does not remount when the route changes:

- the list keeps its scroll position;
- the PMCC recorded banner stays alive after the sheet closes.

Closing the sheet refetches the page's stale queries, which the old page remount used to do
without being asked.

Every existing `#/new…` entry point still works: the sidebar `Open Wheel`, `+ New Wheel`, the
empty-state link, `CallAwaySuccess` and the promote handoff from
[US-68](./us-68-promote-result-to-new-wheel.md). The promote query string is now read by the sheet
when it opens. `NewWheelPage.tsx` is gone.

`NewPositionSheet` is built on the shared sheet primitives. See
[design system — sheet primitives](../architecture/03-design-system.md#sheet-primitives). Its
header reads `OPEN WHEEL` / `New position` / `Record a completed trade`, and it is 460 px wide.

- **Standard mode.** Standard mode renders `NewWheelForm` as it shipped, with the same field ids,
  validation, promote chrome, `✓ WHEEL OPENED` status card and 2 s redirect. The form gained three
  optional props:
  - `onCancel` puts its fields in a `SheetBody` and its buttons in a `SheetFooter`;
  - `sharedRef` exposes the ticker and quantity to the sheet;
  - `onPendingChange` reports when a save is in flight.
- **Draft retention.** Both forms are mounted from the first open, and `hidden` hides the inactive
  one. Each form exposes `getShared` / `setShared` for ticker and contracts, which the sheet copies
  across on toggle. Each form is its own `<form>`, so the hidden one can never submit.
- **The toggle is locked while a save is pending, and so is closing.** Escape inside a portalled
  popover does not close the sheet.
- **Closing drops both drafts.** The sheet reopens fresh in Standard.
- **A failed PMCC save keeps the sheet open,** along with its mode and its draft.

### The PMCC form

`PmccEntryForm` (React Hook Form + `pmccEntrySchema`) has these parts:

- a shared ticker field and a `Contracts per leg` field;
- two `PmccLegSection`s:
  - `Buy LEAPS call`: `BUY TO OPEN`, `180+ DTE · Δ 0.70–0.85`;
  - `Sell short call`: `SELL TO OPEN`, `20–45 DTE · Δ 0.25–0.35`;
- the `PmccCashFlows` review block;
- optional thesis and notes;
- the small print `Uses your actual fills. No order is placed.`

Each leg has a strike, an expiration, an actual fill (`Actual purchase / share` or `Actual sale /
share`), fees (default `0.00`) and a fill date (default today). `LegDatePicker` supplies the
expiration and fill-date inputs.

Changing the ticker clears both legs' contract, strike, expiration and fill. It leaves fees and
fill dates alone.

Errors are routed to where the trader will see them:

- `__pair__` errors appear above the cash-flows block.
- `long.contracts` and `short.contracts` land on the shared contracts field.
- `__root__` errors become the `AlertBox` recovery banner at the top of the body.

`showSaveErrors` performs that routing.

`PmccCashFlows` uses the same engine function as the service, so the preview and the stored
record cannot disagree. The block also says `Opening credit is not yet realized profit.`

### The call-chain picker

`useCallChain` runs a TanStack query on the existing `market-data:option-chain` channel. That
channel also serves the watchlist chains in
[US-64](./us-64-pull-option-chains-for-watchlist.md). The request asks for calls only and applies
the preset's expiration window and strike bounds. The query is considered stale after 30 s,
refetches every 60 s, and runs only once the ticker is valid.

The delta band is applied on the client by `filterCallChain`, because Alpaca's chain filter has no
delta parameter. `filterCallChain` also does three other things:

- it moves contracts without greeks to the end and shows them as `Δ —`;
- it drops quotes whose OCC root is not the ticker, so adjusted contracts never appear;
- it keeps the selected contract in the list.

`CallContractPicker` is a native `<select>`. Its first option is `Choose contract / enter
manually`.

- **Choosing a contract** writes only the strike, expiration and contract id. It never writes
  fill, fees or fill date, and neither does a refetch.
- **Entering manually** clears the selection and unlocks the fields.
- **During a refetch,** the leg section keeps the last-seen selected quote, so the select, quote
  strip and stale notice survive.
- **Before a ticker is typed,** the disabled query reports `idle`, so nothing shows "Loading…".

Each leg has one notice slot. `deriveChainNotice` picks the notice in priority order: loading,
then unavailable, then empty, then stale. A quote counts as stale when it is older than
`STALE_QUOTE_MS`, which is 5 minutes and matches the detail page's snapshot threshold.

The underlying price comes from `useUnderlyingPrice`. `useStockQuotes` was not usable because it
owns the main process's single stock-quote subscription: mounting it in the sheet replaced the
list's live feed, and unmounting it cleared the feed. A live price in the chain's query key would
also have dropped the selected contract on every tick.

Market-data layer context: [domain/market-data](../domain/market-data.md).

### Engine, service and IPC

- **`openPmcc`** (`core/lifecycle.ts`) is the pure validator. It throws `ValidationError` with the
  AC's exact messages and dotted field paths (`long.fillPrice`, `short.strike`, `__pair__`). Those
  paths are typed by `PmccField`, and the only phase it returns is `PMCC_OPEN`.
  - The renderer's `pmccEntrySchema` repeats the field-shape rules with the same messages. It
    repeats the cross-leg rules in a `superRefine`, with its paths pinned to `PmccField`.
  - Four rules have no form field and exist only at the handler: same underlying, calls only,
    matching quantity and a 100-share deliverable. The form always sends values that pass them.
  - See [domain/wheel-lifecycle](../domain/wheel-lifecycle.md).
- **`calculatePmccOpeningDebit`** (`core/costbasis.ts`) is the one pure calculation behind the
  service, the form preview, the list row and the detail page. See
  [domain/cost-basis](../domain/cost-basis.md).

  ```
  leapsCost       = long.fill  × contracts × 100
  shortCredit     = short.fill × contracts × 100
  initialNetDebit = leapsCost − shortCredit + long.fees + short.fees
  basisPerShare   = initialNetDebit / (contracts × 100)
  debit/width %   = (long.fill − short.fill) / (short.strike − long.strike) × 100
                    (fees excluded; null when the width ≤ 0)
  ```

  `money4` now owns the "4-dp TEXT money" convention across the module.

- **`createPmccPosition`** (`services/create-pmcc-position.ts`) logs its inputs, runs `openPmcc`,
  computes the debit, and inserts all rows in one transaction:
  - **Position:** one `positions` row with `strategy_type 'PMCC'` and `phase 'PMCC_OPEN'`, opened
    on the LEAPS fill date.
  - **Legs:** two `legs` rows, `LEAPS_OPEN` / `BUY` / `CALL` and then `SHORT_CALL_OPEN` / `SELL` /
    `CALL`. They share one `created_at`, so the LEAPS sorts first when the fill dates tie. They are
    linked only by `position_id`: this is not a roll pair, and `roll_chain_id` is NULL.
  - **Snapshot:** one `PMCC_OPEN` `cost_basis_snapshots` row. `basis_per_share` includes fees
    (`23.0200` in the fee example). `total_premium_collected` is the short credit after fees.

  The rows go through the shared `insertPosition` (`services/position-rows.ts`) and `insertPmccLeg`
  helpers. Any failure rolls back every row. After commit the service starts IV collection for the
  ticker in the background. It logs `pmcc_position_created` and `pmcc_entry_rejected` at INFO.

- **`positions:create-pmcc`** is a thin handler: a Zod parse and a service call inside
  `handleIpcCall`. `handleIpcCall` now joins Zod issue paths with `.`, so nested errors reach
  React Hook Form's `setError('long.fillPrice')` directly. Existing single-segment paths are
  unchanged.

### List and detail branches

- **List data.** `positions:list` returns `WheelListItem | PmccListItem`, told apart by
  `strategyType`.
  - Only the PMCC arm carries `pmcc: PmccListSummary`: each leg's strike, expiration, DTE and
    contracts, plus the recomputed `initialNetDebit`. `readPmccSummaries` fills it with one extra
    legs query.
  - The PMCC arm sets the six wheel fields to `null`: `strike`, `expiration`, `dte`,
    `instrumentType`, `contracts` and `entryPremiumPerContract`.
  - PMCC rows sort by their short call's DTE among the wheel rows (`sortPositionsByDte`).
  - A PMCC whose leg rows are missing is dropped from the list with a WARN.
- **List row.** `PositionCard` hands PMCC rows to `PmccPositionRow`, which shows:
  - a `PMCC` badge and `LEAPS + short call open`;
  - both strikes, with expiration and DTE labelled `LEAPS ·` / `Short ·`;
  - Premium, the short credit after fees;
  - `$2,300.00 net debit`;
  - `—` for option mid and P&L, with no target badge and no expiring flag.

  `rowStyle` is shared with the wheel row. See [us-2](./us-2-position-list.md).

- **Detail page.** The detail page shows `PmccLegReference`: two section cards listing each leg's
  strike, expiration, DTE, contracts, actual fill, fill date and fees. Below them are
  `Initial net debit` and `Live P&L unavailable until PMCC valuation ships`.
  - `PositionDetailContent` hides the alert-override form.
  - `PositionDetailActions` shows only the badge.
  - There is no verdict block and no cost-basis history drawer; US-103 adds the drawer.
  - See [us-34](./us-34-position-cockpit.md).

Every branch checks `strategyType`, never the phase string. US-108 and US-118 will replace these
minimal views.

**Why the wheel-only jobs skip PMCC without being changed.** `evaluate-alerts.ts` and
`detect-assignments.ts` are untouched. Their SQL filters name wheel phases explicitly
(`phase IN ('CSP_OPEN','CC_OPEN')`, `phase = 'CSP_OPEN'`), and the phase-aware
`activeLegSubquery()` finds no wheel leg for a PMCC. Tests pin all three.

The PMCC list item types the wheel's expiration, DTE and instrument fields as `null`. So:

- the calendar never plots a PMCC;
- `useOptionSnapshots` never polls one;
- `deriveRowDisplay` never renders one through wheel copy such as "CC expiring".

The `PMCC_` phase prefix is what keeps every `phase IN (…)` filter correct.

### Test seams

- `FakeMarketDataProvider.getOptionChainSnapshot` honours `FAKE_OPTION_CHAIN_DELAY_MS`, so the
  loading notice can be asserted without a race.
- The storage-failure scenario uses a `BEFORE INSERT … RAISE(ABORT)` trigger on
  `cost_basis_snapshots`. It fails the transaction's last write, which is the only way a passing
  test proves the rollback.
- Property tests cover both engines:
  - `calculatePmccOpeningDebit`: Decimal identities, contract scale-invariance, a `null` ratio iff
    the width ≤ 0, a ratio that does not depend on fees, and 4-dp output.
  - `openPmcc`: valid input is accepted, the guards reject, and every thrown field is a
    `PmccField`.

### Deliberate limits

- **DTE uses the local calendar day**, as the rest of the codebase does, not the story's
  America/New_York valuation date. The fixture yields 368 / 32 on any US-zone machine.
- **A successful Standard save does not close the sheet.** Closing it with a list banner is a
  follow-up.
- **Remaining tech debt:**
  - `mapActiveLeg` reads `fees` with a non-null assertion.
  - `createPosition` returns a `snapshotAt` that differs from the one it persists.
  - A second `useStockQuotes` consumer would need a reference-counted subscription.

Follow-up stories:

| Story                          | Adds                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| US-103                         | running PMCC basis and the history drawer                       |
| US-108, US-118                 | the full PMCC row and cockpit                                   |
| US-113, US-122                 | the IV block, and promoting into PMCC from this sheet           |
| US-115, US-119, US-120, US-111 | the reserved `PMCC_LEAPS_ONLY` / `PMCC_CLOSED` phases and roles |

## Architecture decisions

- [new-route-is-list-with-sheet-open](../architecture/02-adrs/new-route-is-list-with-sheet-open.md)
  — `#/new` is the list with the sheet open, through one RegExp route; `NewWheelPage` is deleted.
- [standard-mode-is-new-wheel-form](../architecture/02-adrs/standard-mode-is-new-wheel-form.md) —
  Standard is the shipped form, including its in-form success card and redirect.
- [pmcc-phase-and-leg-role-names](../architecture/02-adrs/pmcc-phase-and-leg-role-names.md) —
  `PMCC_OPEN`, `LEAPS_OPEN`, `SHORT_CALL_OPEN`; `PMCC_LEAPS_ONLY`, `PMCC_CLOSED` and the closing
  roles are reserved by name but not added.
- [per-leg-fees-on-legs-table](../architecture/02-adrs/per-leg-fees-on-legs-table.md) —
  `legs.fees`, not a field on the snapshot and not a separate table.
- [pmcc-opening-snapshot-ledger-convention](../architecture/02-adrs/pmcc-opening-snapshot-ledger-convention.md)
  — the opening snapshot's units follow US-103.
- [shared-pure-pmcc-opening-debit](../architecture/02-adrs/shared-pure-pmcc-opening-debit.md) —
  one engine for the service, preview, list and detail; the debit is recomputed from the legs.
- [pmcc-validation-pure-engine-mirrored-by-form-schema](../architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md)
  — `openPmcc` owns the rules and the form schema repeats them; dotted paths; rule 13 runs before
  rule 12.
- [call-chain-picker-client-side-delta-band](../architecture/02-adrs/call-chain-picker-client-side-delta-band.md)
  — the chain IPC plus a client-side delta band; no `limit`; `useUnderlyingPrice`; the selection
  is kept across refetches.
- [draft-retention-both-forms-mounted](../architecture/02-adrs/draft-retention-both-forms-mounted.md)
  — both forms stay mounted, with one imperative handle for the shared fields.
- [fake-provider-option-chain-delay](../architecture/02-adrs/fake-provider-option-chain-delay.md)
  — `FAKE_OPTION_CHAIN_DELAY_MS`.
- [storage-failure-e2e-via-sqlite-trigger](../architecture/02-adrs/storage-failure-e2e-via-sqlite-trigger.md)
  — a `RAISE(ABORT)` trigger, replacing the planned read-only file.
- [pmcc-list-item-discriminated-union](../architecture/02-adrs/pmcc-list-item-discriminated-union.md)
  — `WheelListItem | PmccListItem`; branches check `strategyType`; the wheel jobs are untouched.

## Contracts touched

- **`positions:create-pmcc` (new).** It takes `CreatePmccPositionPayloadSchema`: `strategy:
'PMCC'`, `ticker`, `long` / `short` legs, and optional `accountId`, `thesis` and `notes`. Each
  leg carries `underlying`, `instrumentType`, `deliverableShares`, `strike`, `expiration`,
  `contracts`, `fillPrice`, `fillDate` and `fees`.
  - On success it returns `{ position, longLeg, shortLeg, costBasisSnapshot, openingDebit }`.
  - On failure it returns `{ ok: false, errors }` with the field, code and message table from the
    AC.
  - Numeric bounds are left out of Zod on purpose, because the engine owns those messages.
  - See [contracts/ipc-handlers](../contracts/ipc-handlers.md) and
    [contracts/zod-schemas](../contracts/zod-schemas.md).
- **`handleIpcCall`.** It maps Zod paths to `issue.path.join('.') || '__root__'`.
- **`positions:list`.** It returns `PositionListItem = WheelListItem | PmccListItem`, with
  `PmccListSummary` and `PositionListItemBase`, and `phase` now includes `PMCC_OPEN`.
- **`positions:get`.** Leg records carry `fees`, and `strategyType` is `'WHEEL' | 'PMCC'`.
- **`market-data:option-chain`.** The renderer has a new consumer: `getOptionChain`, the
  `optionChain` query key and `useCallChain`.
- **Enums.** `WheelPhase` gains `PMCC_OPEN`. `LegRole` gains `LEAPS_OPEN` and `SHORT_CALL_OPEN`.
  `TriggerEvent` gains `PMCC_OPEN`. `PHASE_LABEL`, `PHASE_COLOR` and `LEG_ROLE_LABEL` have entries
  for the new values.
- **Preload.** `createPmccPosition`, with `IpcCreatePmccPositionPayload` and
  `IpcCreatePmccPositionResult`.
- **Test seam.** The `FAKE_OPTION_CHAIN_DELAY_MS` environment variable.
- **Schema.** Migration `017_add_leg_fees.sql` adds `legs.fees TEXT NOT NULL DEFAULT '0.0000'`.
  Every wheel leg keeps the default. See [schema/tables](../schema/tables.md) and
  [schema/migrations](../schema/migrations.md).

## Source files

- **Migration:** `migrations/017_add_leg_fees.sql`
- **Core:**
  - `src/main/core/costbasis.ts` (`calculatePmccOpeningDebit`, `money4`)
  - `src/main/core/lifecycle.ts` (`openPmcc`, `PmccField`)
  - `src/main/core/types.ts`
- **Schemas and IPC:**
  - `src/main/schemas.ts`
  - `src/main/ipc/positions.ts`
  - `src/main/ipc/utils.ts`
- **Services:**
  - `src/main/services/create-pmcc-position.ts`
  - `src/main/services/position-rows.ts`
  - `src/main/services/positions.ts`
  - `src/main/services/list-positions.ts`
  - `src/main/services/get-position.ts`
  - These wheel services only gained `fees: '0.0000'` on their leg literals:
    `close-csp-position.ts`, `assign-csp-position.ts`, `open-covered-call-position.ts`,
    `close-covered-call-position.ts`, `expire-csp-position.ts`, `expire-cc-position.ts`,
    `record-call-away-position.ts`, `roll-csp-position.ts` and `roll-cc-position.ts`.
- **Integrations:** `src/main/integrations/fake-market-data.ts`
- **Preload:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Renderer API and hooks:**
  - `src/renderer/src/api/positions.ts`, `api/market-data.ts`
  - `src/renderer/src/hooks/useCallChain.ts`, `useUnderlyingPrice.ts`,
    `useCreatePmccPosition.ts`, `marketDataQueryKeys.ts`
- **Renderer logic:**
  - `src/renderer/src/lib/pmcc-entry.ts`, `lib/phase.ts`
  - `src/renderer/src/schemas/pmcc-entry.ts`, `schemas/common.ts`
- **Renderer components:**
  - `src/renderer/src/components/NewPositionSheet.tsx`, `StrategyToggle.tsx`, `NewWheelForm.tsx`
  - `PmccEntryForm.tsx`, `PmccLegSection.tsx`, `CallContractPicker.tsx`, `PmccCashFlows.tsx`
  - `PmccPositionRow.tsx`, `positionRowStyles.ts`, `PositionCard.tsx`,
    `PositionDetailActions.tsx`
  - `components/position-cockpit/PmccLegReference.tsx`, `PositionCockpit.tsx`
- **Renderer pages:**
  - `src/renderer/src/pages/PositionsListPage.tsx`, `PositionDetailContent.tsx`
  - `src/renderer/src/App.tsx` (the single RegExp route)
- **E2E:**
  - `e2e/open-pmcc-position.spec.ts`, which covers all 9 scenarios in 40 cases
  - `e2e/pmcc-helpers.ts`
- **Deleted:** `src/renderer/src/pages/NewWheelPage.tsx`

Sources: [extract: us-101](../.extracts/us-101.md), `plans/us-101/`,
`docs/us-101-implementation.md`.

Related stories:

- [us-68](./us-68-promote-result-to-new-wheel.md): its promote handoff now lands in this sheet.
- [us-64](./us-64-pull-option-chains-for-watchlist.md): its chain IPC is reused here.
- [us-2](./us-2-position-list.md)
- [us-34](./us-34-position-cockpit.md)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
