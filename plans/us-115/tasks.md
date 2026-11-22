# US-115 — Sell a subsequent short call against an open LEAPS — Tasks

Plan: `plans/us-115/plan.md` (area numbers below match it). Story: Linear
[OPT-23](https://linear.app/optionswheel/issue/OPT-23). Read `research.md`, `data-model.md` and
`contracts/` before starting an area.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Every expected value in a test is a literal from `plan.md` or `data-model.md` § 5, never the
  output of the function under test
- Service and core tests use the story's literal dates with `today: '2027-07-23'`; e2e tests use
  the shifted Background (`plan.md` Area 15)
- `better-sqlite3` ABI: run `pnpm rebuild:node` before Vitest work and `pnpm rebuild:electron`
  before Layer 7. Do not run a Vitest agent and an e2e agent at the same time

Shared files to watch when areas run in parallel:

| File                                                             | Areas                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `src/main/core/pmcc-rules.ts`                                    | 1 (writes), then 2 and 11 import it (later layer)         |
| `src/main/schemas.ts`                                            | 5 only                                                    |
| `src/renderer/src/lib/pmcc-entry.ts`                             | 8 only                                                    |
| `src/renderer/src/schemas/pmcc-entry.ts`                         | 11 (exports `pmccLegSchema`, `PmccLegFormSlice`), then 12 |
| `src/renderer/src/lib/pmcc-roll.ts`, `RollPmccShortCallForm.tsx` | 10 only                                                   |
| `src/renderer/src/components/PositionDetailActions.tsx`          | 9, then 14 passes the new prop                            |
| `src/renderer/src/lib/pmcc-card-display.ts`                      | 9 only (state line from `pmccCoverageLabel`)              |

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Shared rules: `pmccSubsequentShortIssues` and the extracted US-101 constants

- [x] **[Red]** Write failing tests — `src/main/core/pmcc-rules.test.ts`, `src/main/core/pmcc-rules.property.test.ts`
  - Test cases (full list in `plan.md` Area 1 Red):
    - valid Background sale → `[]`
    - contracts cap `(1)` / `(3)`; fill in the future; fill `2027-07-15` → `… retired (2027-07-16).`, fill `2027-07-16` accepted
    - LEAPS bought after the retirement → `long_after_short` only; tie → `before_previous_short` only; `previousShortRetiredOn: null`
    - `expired_contract` before `expiration_not_after_fill`; `2028-01-21` / `2028-02-18` → `SHORT_NOT_BEFORE_LONG`; `85` / `80` → `strike_not_above_long`
    - issue order; `undefined` skips; `pmccCrossLegIssues` regression unchanged
    - `pmccFillDateFloor`: previous later → `previousShort`; tie → `previousShort`; LEAPS one day earlier → `previousShort`; LEAPS one day later → `leaps`; `null` previous → `leaps`
  - Property cases: agreement with an independent oracle; at most one floor issue and correcting to the named date clears it; every field in `PmccSubsequentShortField`; `pmccFillDateFloor` date = `date-fns` `max`, `kind` `previousShort` iff previous non-null and not before the LEAPS fill
  - Run `pnpm test src/main/core/pmcc-rules` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Red ✓)_
  - Extract `SHORT_STRIKE_NOT_ABOVE_LONG`, `FILL_DATE_IN_FUTURE`, `EXPIRED_CONTRACT`, `LEAPS_AFTER_SHORT` and use them in `pmccCrossLegIssues`
  - Add `SHORT_CALL_ALREADY_OPEN`, `exceedsLeapsContracts(n)`, `beforePreviousShortRetired(date)`, `PmccFillDateFloor`, `pmccFillDateFloor` (exported; tie → previous short; US-120 reuses it), `PmccSubsequentShortField`, `PmccSubsequentShortValues`, `PmccSubsequentShortContext`, `PmccSubsequentShortInput`, `pmccSubsequentShortIssues` (order: `data-model.md` § 3 rows 7–13)
  - No logging, no I/O
  - Run `pnpm test src/main/core/pmcc-rules` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: one `decided(...)` guard helper; `PmccRule` stays module-private
  - Run `pnpm test:mutation --mutate src/main/core/pmcc-rules.ts`; kill reproducible survivors in the new code
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Projection: `projectPmccLedger`

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`, `src/main/core/costbasis.property.test.ts`
  - Test cases: Background + `$1.95` → `6.5500` / `91.5500` / `70.8889`; `$90` at `$1.50` → `7.0000` / `92.0000` / `68.8889`; fees `1.0000` → `6.5600` / `91.5600` / `70.8444`; 3 LEAPS + 1 short → `7.8500` / `92.8500` / `65.1111`; no contributions → unchanged
  - Property cases: oracle `project(calculate(a), b) == calculate(a ++ b)`; order independence `project(project(x, b), c) == project(x, b ++ c)`
  - Run `pnpm test src/main/core/costbasis` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 3 Red ✓)_
  - Extract `ledgerFromTotals`; `calculatePmccLedger` delegates to it; add `PmccLedgerTotals`, `ProjectPmccLedgerInput`, `projectPmccLedger`
  - Run `pnpm test src/main/core/costbasis` — all tests (old and new) must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: note (do not do) rewriting `pmccPostRollEffectiveCost` / `pmccLeapsPostRoll` over the projection
  - Run `pnpm test:mutation --mutate src/main/core/costbasis.ts`; kill reproducible survivors in the new code
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Ledger helpers: `lastShortRetiredOn`, `nextPmccCycleNumber`

- [x] **[Red]** Write failing tests — `src/main/services/pmcc-ledger.test.ts`
  - Test cases: `null` with no closing leg; `2027-07-16` for the Background without cycle 9; a later `SHORT_CALL_CLOSE` wins; `SHORT_CALL_ASSIGNED` counts; `LEAPS_CLOSE` and short-roll legs do not; cycle number `2` and `9`; equals `buildPmccTimeline(...).cycles.length + 1`
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pmcc-ledger.ts` _(depends on: Area 4 Red ✓)_
  - Both helpers read `SHORT_CALL_CLOSING_ROLES`; pure reductions
  - Run `pnpm test src/main/services/pmcc-ledger.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Schemas: payload and result

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts`
  - Test cases: full payload parses; `fees` defaults to `0`; `fillDate` optional; `contracts: 0`, `fillPrice: 0`, `strike: 80` parse; bad date and missing strike fail on their paths; `expectTypeOf` on `SellPmccShortResult['snapshot']['triggerEvent']`
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 5 Red ✓)_
  - `SellPmccShortPayloadSchema`, `SellPmccShortPayload`, `SellPmccShortResult` per `contracts/positions-sell-pmcc-short.md`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8 — Chain bounded by the LEAPS

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-entry.test.ts`, `src/renderer/src/hooks/useCallChain.test.ts`
  - Test cases: `filterCallChain` with bounds drops the `85` / `80` strikes and the `2028-01-21` / `2028-02-18` expirations, keeps `118 · 2027-08-20`, drops a kept contract that breaks a bound; `chainWindow` clamps to the day before a 35-day LEAPS and is unchanged for a 182-day one; no bounds → existing behaviour; `useCallChain` puts `bounds` in its query key
  - Run `pnpm test src/renderer/src/lib/pmcc-entry.test.ts src/renderer/src/hooks/useCallChain.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-entry.ts`, `src/renderer/src/hooks/useCallChain.ts` _(depends on: Area 8 Red ✓)_
  - `ShortCallChainBounds`; filters use `shortExpiresBeforeLeaps` and `shortStrikeAboveLeaps`
  - Run the same tests — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 9 — Coverage label and the header action

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-coverage.test.ts`, `src/renderer/src/lib/pmcc-card-display.test.ts`, `src/renderer/src/components/PositionDetailActions.test.tsx`
  - Test cases: `pmccCoverageLabel` none / full / `2 of 3` / `1 of 3 covered` / `2 short calls` (`plan.md` Area 9); card partial case reads `LEAPS + short call open · 1 of 3 covered` on its state line and `3 × 100 sh` on its coverage line; LEAPS-only PMCC → badge `LEAPS open · no short call`, `sell-pmcc-short-btn` (`Sell Short Call →`) calls `onSellPmccShort`, no `roll-pmcc-short-btn`; open short → `LEAPS + short call open`, no sell button; 1 of 3 contracts → badge `LEAPS + short call open · 1 of 3 covered`; no LEAPS → no sell button; closed PMCC (`PMCC_CLOSED`, US-120; non-`PMCC_OPEN` stand-in until it lands) with open legs still set → no sell button; `HOLDING_SHARES` → `Open Covered Call →`, no sell button
  - Mockup: `epic-09-pmcc-position-detail.mdx`, presets `sell-short` and `healthy` (header)
  - Run `pnpm test src/renderer/src/lib/pmcc-coverage.test.ts src/renderer/src/components/PositionDetailActions.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-coverage.ts`, `pmcc-card-display.ts`, `PositionDetailActions.tsx` _(depends on: Area 9 Red ✓)_
  - Move `stateLabel` and the card's `N of M covered` into `pmccCoverageLabel({ shortCount, shortContracts, leapsContracts })`; `pmccCoverage` prop; `PhaseBadge label` for a PMCC in `PMCC_OPEN`; gate the button on `phase === 'PMCC_OPEN' && hasOpenLeaps && !hasOpenShortCall`
  - Run the same tests plus `pnpm test src/renderer/src/lib/pmcc-card-display.test.ts` — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Engine, preview and form rules (depend on Layer 1)

### Area 2 — Engine: `sellPmccShort`

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`, `src/main/core/lifecycle.property.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases (full list in `plan.md` Area 2 Red): happy path; partial coverage accepted; `invalid_phase`; `short_call_already_open` wins over every other error; contracts `0` / `-1` / `1.5`; price `0`; fees `-1`; strike `0`; each shared rule thrown with its field / code / message; shape checks before shared rules
  - Property cases: phase guard; open-short guard; accepts iff `pmccSubsequentShortIssues` is empty, otherwise throws exactly its first issue
  - Run `pnpm test src/main/core/lifecycle` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 2 Red ✓)_
  - `SellPmccShortField`, `SellPmccShortInput`, `SellPmccShortAccepted`, `sellPmccShort`; widen the three helpers' `field` type
  - Run `pnpm test src/main/core/lifecycle` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test:mutation --mutate src/main/core/lifecycle.ts`; kill reproducible survivors in `sellPmccShort`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 10 — Preview arithmetic and advisory text

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-sell-short.test.ts`, `src/renderer/src/lib/pmcc-roll.test.ts` _(depends on: Area 3 Green ✓)_
  - Test cases: preview `195.0000` / `28` / `8.5000 → 6.5500` / `93.5000 → 91.5500` / `62.2222 → 70.8889` / margin `26.4500`; `$90 · $1.50` → `150.0000`, `7.0000`, `92.0000`, shortfall `2.0000`; at the line → margin `0.0000`; 3 LEAPS / 1 contract → `uncoveredContracts` `2`; `uncoveredContractsNote` `2` and `1` (one-open-short sentence); incomplete → `null`; `shortfallWarningText` `'sale'` (`Short strike $90.00 is below your effective share cost of $92.00 after this sale. …roughly $2.00 per share of loss. You can still record it.`) and `'roll'` (US-104's sentence byte for byte); `previousCycleLine` expired / closed / none; `coverageCardLine` with and without delta
  - Mockup: `SellShortSheet` Coverage and `After this sale` cards
  - Run the two test files — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-sell-short.ts`, `src/renderer/src/lib/pmcc-roll.ts`, `RollPmccShortCallForm.tsx` _(depends on: Area 10 Red ✓)_
  - `sellPmccShortPreview` over `projectPmccLedger` and `pmccStrikeShortfall`; `uncoveredContractsNote`; `shortfallWarningText` rendered by the roll form
  - Run the two test files plus `pnpm test src/renderer/src/components/RollPmccShortCallForm.test.tsx` — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 11 — Form schema

- [x] **[Red]** Write failing tests — `src/renderer/src/schemas/sell-pmcc-short.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases: defaults (`contracts` `'1'`, fill date today, fees `'0.00'`); the six invalid-entry rows and four shape rows on their form paths; first issue per field only; mid-edit fields report only `required`; `toSellPmccShortPayload` numbers; `SellPmccShortFormValues` assignable to `PmccLegFormSlice`
  - Run `pnpm test src/renderer/src/schemas/sell-pmcc-short.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/schemas/sell-pmcc-short.ts`, `src/renderer/src/schemas/pmcc-entry.ts` _(depends on: Area 11 Red ✓)_
  - Export `pmccLegSchema` and `PmccLegFormSlice`; `superRefine` over `pmccSubsequentShortIssues`
  - Run the test file plus `pnpm test src/renderer/src/schemas/pmcc-entry.test.ts` — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: share the issue-to-path mapper with `schemas/roll-pmcc-short-call.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service and shared section (depend on Layers 1–2)

### Area 6 — Service: `sellPmccShortPosition`

- [x] **[Red]** Write failing tests — `src/main/services/sell-pmcc-short-position.test.ts` _(depends on: Areas 2, 4, 5 Green ✓)_
  - Test cases (full list in `plan.md` Area 6 Red): happy path (cycle `9`, `6.5500`, one leg, one `PMCC_SHORT_OPEN` snapshot, position row unchanged); default fill date; live LEAPS after a seeded LEAPS roll; each rejection writes nothing; storage-failure rollback; `not_found`; wheel → `invalid_phase`; INFO logs on success and rejection
  - Run `pnpm test src/main/services/sell-pmcc-short-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/sell-pmcc-short-position.ts` _(depends on: Area 6 Red ✓)_
  - `loadPmccRollContext` → `lastShortRetiredOn` → `sellPmccShort` inside `logPmccRollRejection(…, 'pmcc_sell_short_rejected', …)` → one transaction: `insertLegRow`, `appendPmccSnapshot('PMCC_SHORT_OPEN')`; `nextPmccCycleNumber`
  - Run the test file — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: one `pmccLegRecord(...)` shared with `insertPmccLeg`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 12 — `PmccLegSection` reused by both sheets

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PmccLegSection.test.tsx` _(depends on: Areas 8, 11 Green ✓)_
  - Test cases: `ticker` and `bounds` props reach `useCallChain` and filter the list; `fillLabel`; selecting a contract never fills the price; `pairRule={false}`; `children` render; manual entry and `Quotes unavailable. Enter your filled trade manually.` unchanged
  - Mockup: `SellShortSheet` picker and fields
  - Run `pnpm test src/renderer/src/components/PmccLegSection.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PmccLegSection.tsx` _(depends on: Area 12 Red ✓)_
  - Bind to `PmccLegFormSlice`; optional props with defaults that reproduce US-101
  - Run the test file plus `pnpm test src/renderer/src/components/PmccEntryForm.test.tsx src/renderer/src/components/NewPositionSheet.test.tsx` — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — IPC wiring (depends on Area 6)

### Area 7 — IPC handler, preload and renderer client

- [x] **[Red]** Write failing tests — `src/main/ipc/positions-sell-pmcc-short.test.ts` _(depends on: Area 6 Green ✓)_
  - Test cases: channel registered; success envelope with `cycleNumber: 9`; injected clock `2027-07-24T03:30:00Z` rejects a `2027-07-24` fill as future; rejection envelope for `short_not_before_long`; Zod field error; `internal_error`
  - Run `pnpm test src/main/ipc/positions-sell-pmcc-short.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts` _(depends on: Area 7 Red ✓)_
  - `registerParsedPositionHandler(db, 'positions:sell-pmcc-short', 'positions_sell_pmcc_short_unhandled_error', SellPmccShortPayloadSchema, …)` with `today: etDateOf(getCurrentDate())`
  - Run the test file plus `pnpm test src/main/ipc/positions.test.ts` — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — The sheet (depends on Areas 7, 10, 11, 12)

### Area 13 — The sheet

- [x] **[Red]** Write failing tests — `SellPmccShortSheet.test.tsx`, `SellPmccShortForm.test.tsx`, `src/renderer/src/hooks/useSellPmccShort.test.ts` _(depends on: Areas 7, 10, 11, 12 Green ✓)_
  - Test cases (full list in `plan.md` Area 13 Red): eyebrow and title; coverage and previous-cycle lines; the five preview lines with `text-wb-green`; `$90 · $1.50` warning with confirm enabled; the partial note with `Only one short call can be open at a time`; invalid field disables confirm; `Recording…`; payload; server field-error routing; save-failed copy with values kept; success `PMCC updated` / `Cycle 9 opened` / `Done`
  - Mockup: `SellShortSheet`, preset `sell-short`
  - Run `pnpm test src/renderer/src/components/SellPmccShort src/renderer/src/hooks/useSellPmccShort.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `PmccRollSheetDialog.tsx` (`width`), `SellPmccShortSheet.tsx`, `SellPmccShortForm.tsx`, `SellShortCoverageCard.tsx`, `SellPmccShortPreview.tsx`, `SellPmccShortSuccess.tsx`, `useSellPmccShort.ts`, `useSellPmccShortForm.ts` _(depends on: Area 13 Red ✓)_
  - `useRollSheetSubmit` with `SELL_SHORT_FORM_FIELDS`; `newYorkToday()`; LEAPS delta from `useOptionSnapshots`
  - Run the same tests plus the US-104 / US-105 sheet tests — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: share the footer with `RollPmccShortCallForm`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Detail-page wiring (depends on Areas 9 and 13)

### Area 14 — Detail-page wiring

- [x] **[Red]** Write failing tests — the detail page test _(depends on: Areas 9, 13 Green ✓)_
  - Test cases: `Sell Short Call →` opens the sheet titled `XYZ · against $85.00 LEAPS` and closes any other sheet; the sheet does not render while a short is open; a closed PMCC (`PMCC_CLOSED`, US-120) offers no `Sell Short Call →` and renders no sheet; partial badge `LEAPS + short call open · 1 of 3 covered`
  - Mockup: preset `sell-short`
  - Run the test file — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/usePositionDetailSheets.ts`, `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 14 Red ✓)_
  - `'pmccSellShort'` slot; pass `onSellPmccShort`, `pmccCoverage`, `pmccOpenLegs.long`, `pmccLedger`, `lastEndedCycle(data.pmccTimeline)`; render the sheet only in `PMCC_OPEN`
  - Run `pnpm test src/renderer/src/pages` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 15 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-sell-short.spec.ts`, `e2e/pmcc-sell-short-helpers.ts` _(depends on: all Green tasks ✓)_
  - `pnpm rebuild:electron` first
  - Helpers: export `Variant` and `backgroundLegs` and add `VARIANTS.withoutCycle9` in `e2e/pmcc-timeline-helpers.ts`; `tableCount` accepts `cost_basis_snapshots` in `e2e/pmcc-helpers.ts`; `nyToday()` in `e2e/dates.ts`; launch without `WHEELBASE_FAKE_NOW`, with the shifted chain fixture; `shift(iso)`; `seedLeapsOnly`; `directSell`
  - Every test seeds through `_test:pmcc-seed-position`; assertions are the literals in `plan.md` Area 15, dates through `shift`
  - AC coverage:
    - AC-1: Sell the next short call → `it('Sell the next short call')`
    - AC-2: The sheet shows the LEAPS as coverage context and the previous cycle's outcome → `it("The sheet shows the LEAPS as coverage context and the previous cycle's outcome")`
    - AC-3: The preview shows the cash and the new guardrails before confirming → `it('The preview shows the cash and the new guardrails before confirming')`
    - AC-4: Warn when the strike is below the effective share cost → `it('Warn when the strike is below the effective share cost')` (XYZ quoted at $86.50 via `WHEELBASE_MOCK_STOCK_QUOTES`; $90.00 call at $1.50 → effective $92.00, $2.00 short; Q1)
    - AC-5: Reject a short call that breaks the PMCC shape → `it.each(SHAPE_ROWS)('Reject a short call that breaks the PMCC shape: $strike · $expiration')` (4 rows)
    - AC-6: Reject a bypassed short call that would outlast the LEAPS without a partial record → `it('Reject a bypassed short call that would outlast the LEAPS without a partial record')`
    - AC-7: Reject invalid entry → `it.each(INVALID_ROWS)('Reject invalid entry: $field $value')` (6 rows)
    - AC-8: Partial coverage is allowed and stated → `it('Partial coverage is allowed and stated')` (one-open-short note; `1 of 3 covered` on the detail header and the card)
    - AC-9: Reject when a short call is already open → `it('Reject when a short call is already open')`
    - AC-10: Continue when market data cannot supply the picker → `it('Continue when market data cannot supply the picker')` (relaunch with `FAKE_MARKET_DATA_ERROR=unknown`)
    - AC-11: A failed save leaves the position LEAPS-only → `it('A failed save leaves the position LEAPS-only')`
    - AC-12: The wheel is unchanged → `it('The wheel is unchanged')`
  - Run `pnpm test:e2e e2e/pmcc-sell-short.spec.ts` — every new test must fail for the right reason. Since Layers 1–6 are complete, a test that already passes must be shown falsifiable: break its fixture or expected literal once (for AC-1, a fixture still at `$8.50`) and confirm it fails
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - A failure means an earlier area is incomplete; fix it there, not in the spec
  - Run `pnpm test:e2e` — all tests must pass, including `open-pmcc-position`, `pmcc-cost-basis`, `pmcc-short-call-roll`, `pmcc-leaps-roll`, `pmcc-leg-timeline`, `pmcc-position-card`, `open-covered-call`
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep variants as patches over the one Background; `shift` is the only date offset

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] Core-engine areas have property tests: Area 1 (`pmcc-rules.property.test.ts`), Area 2 (`lifecycle.property.test.ts`), Area 3 (`costbasis.property.test.ts`)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] No reproducible, non-equivalent surviving mutant in the new code of `pmcc-rules.ts`, `lifecycle.ts`, `costbasis.ts`
- [ ] E2E tests cover every AC (12 of 12; 20 tests with outline rows)
- [ ] US-101's entry sheet and US-104's roll sheet unchanged in behaviour (their unit and e2e tests green)
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [ ] `/update-spec us-115` run before the plan directory is removed (drop the spec's `PMCC_LEAPS_ONLY` reservation; record `positions:sell-pmcc-short`)
