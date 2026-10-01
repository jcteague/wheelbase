# Refactor Phase Results: US-101 — Open a PMCC position with two linked opening legs

Refactors were run per layer, after each area's Green, with the affected suites re-run after
every change. The whole-suite gates (`pnpm test && pnpm lint && pnpm typecheck`) were re-run
at the end of the story's verification loop.

## Automated Simplification

- code-simplifier agent run: **passed** (two passes)
  - Layer 1 pass over `src/main/core/costbasis.ts`, `src/main/core/lifecycle.ts`,
    `src/main/integrations/fake-market-data.ts`, `src/main/services/get-position.ts` —
    `eachLeg` became a nested `function`, `requireNonNegativeDecimal` was renamed to
    `requireNonNegativeFees` (it only ever emits the fees message), and a redundant `?? 0`
    was dropped from the delay read.
  - Layer 5 pass over `PmccEntryForm.tsx`, `PmccLegSection.tsx`, `CallContractPicker.tsx`,
    `PmccCashFlows.tsx` — the two `Controller` + `DatePicker` blocks in the leg section became
    one module-private `LegDatePicker`; the per-leg `fill × 100 × contracts` preview moved into
    a pure `legCashFlow`; the save-error routing moved out of the component body into
    `showSaveErrors(error, setError)`.

## Manual Refactorings Performed

### 1. Extract helper — `money4` in the cost-basis engine

**File**: `src/main/core/costbasis.ts`
**Before**: `round4(x).toFixed(4)` appeared 13 times (5 pre-existing, 8 added by
`calculatePmccOpeningDebit`).
**After**: one `money4(value: Decimal): string` helper; every call site uses it.
**Reason**: one place owns the "4-dp TEXT money" convention.

### 2. Read the env through the file's helper — fake provider delay

**File**: `src/main/integrations/fake-market-data.ts`
**Before**: `await delay(Number(process.env.FAKE_OPTION_CHAIN_DELAY_MS) || 0)`.
**After**: `await delay(parseEnv<number>('FAKE_OPTION_CHAIN_DELAY_MS') ?? 0)`.
**Reason**: `parseEnv` is the file's single env-read seam; a bare `process.env` read was the
only one in the provider.

### 3. Extract constant — `IsoDateSchema` in the main-process schemas

**File**: `src/main/schemas.ts`
**Before**: `z.string().regex(IsoDateRegex, IsoDateMessage)` repeated five times (three
pre-existing, two new in the PMCC leg payload).
**After**: one `IsoDateSchema` used by all five fields.
**Reason**: duplication.

### 4. Extract shared row writer — `insertPosition`

**Files**: `src/main/services/position-rows.ts` (new), `src/main/services/positions.ts`,
`src/main/services/create-pmcc-position.ts`
**Before**: `createPosition` and `createPmccPosition` each carried a byte-identical
`INSERT INTO positions` statement (apart from the strategy literal) and a 15-field
`PositionRecord` literal.
**After**: `insertPosition<S, P>(db, row)` inserts the row and returns the record, narrowed to
the strategy and phase the caller opened with (`OpenedPositionRecord<S, P>`), so both services
keep their literal-typed results without repeating the fields.
**Reason**: duplication across the two opening services; the plan named this candidate.

### 5. Extract helper — `insertPmccLeg`

**File**: `src/main/services/create-pmcc-position.ts`
**Before**: two 13-argument `insertLeg.run(...)` calls plus two 15-field `LegRecord` literals for
the LEAPS and short legs.
**After**: `insertPmccLeg<R, A>(db, { id, positionId, legRole, action, leg, now })` writes one
row and returns the narrowed record; the transaction returns `{ position, longLeg, shortLeg }`.
**Reason**: the two legs differed only by role/action; the generic keeps `legRole: 'LEAPS_OPEN'`
/ `action: 'BUY'` narrowing on the result type.

### 6. Share the ISO-date regex in the renderer schemas

**Files**: `src/renderer/src/schemas/common.ts`, `src/renderer/src/schemas/pmcc-entry.ts`
**Before**: `pmcc-entry.ts` declared its own `ISO_DATE` regex identical to the one inside
`isoDateSchema`.
**After**: `common.ts` exports `ISO_DATE_REGEX`; both use it.
**Reason**: duplication. (The money refinements were _not_ folded into `positiveMoneySchema`:
the PMCC rules need the AC's exact messages and `parseInputDecimal`, which the shared
`parseFloat`-based helpers do not provide.)

### 7. Extract `toListItemBase` in the list service

**Files**: `src/main/services/list-positions.ts`, `src/main/schemas.ts` (exports
`PositionListItemBase`)
**Before**: `toWheelItem` and `toPmccItem` each repeated the seven shared fields.
**After**: both spread `toListItemBase(row)`.
**Reason**: the plan's named candidate; duplication.

### 8. Share the table-row style builder

**Files**: `src/renderer/src/components/positionRowStyles.ts`, `PositionCard.tsx`,
`PmccPositionRow.tsx`
**Before**: both rows built the same zebra/phase-colour CSS-variable object inline.
**After**: `rowStyle(index, phase)` lives beside the shared `CELL_CLASS` / `VALUE_CLASS`.
**Reason**: duplication; `PositionCard.tsx` also dropped a now-unused `PHASE_COLOR` import.

### 9. Underlying price without hijacking the quote stream (defect found during review)

**Files**: `src/renderer/src/hooks/useUnderlyingPrice.ts` (+ test), `PmccLegSection.tsx`
**Before**: the leg section called `useStockQuotes([ticker])`. That hook owns the main
process's single stock-quote stream subscription (`setStockQuoteTickers` on mount, `[]` on
unmount), so mounting it inside the sheet replaced the positions list's live feed and cleared
it on close.
**After**: `useUnderlyingPrice(ticker)` is a plain polled `useQuery` over `getStockQuotes`
(30 s stale / 60 s refetch) that never touches the subscription — asserted by a test.
**Reason**: behaviour fix surfaced by the Area 10 implementer; the plan's "the query is shared"
assumption did not hold.

### 10. Standard mode footer holds Cancel and the submit (UI-notes gap found during review)

**Files**: `src/renderer/src/components/NewWheelForm.tsx`, `NewPositionSheet.tsx` (+ test)
**Before**: the Standard pane's footer held only `Cancel`; `Open Wheel` stayed at the end of
the scrolling body.
**After**: `NewWheelForm` takes an optional `onCancel`; when present it renders its fields in a
`SheetBody` and `Cancel` + `Open Wheel` in a `SheetFooter`, exactly as `PmccEntryForm` does.
Without the prop it renders as before, so its own test suite is unchanged.
**Reason**: the story's UI notes ("Keep Cancel and the active strategy's primary action in the
fixed footer") and the plan's ownership rule (the active form owns the footer).

### 11. Review-driven fixes (test-first, after the first cold review)

**Files**: `src/main/core/lifecycle.ts`, `src/main/services/list-positions.ts`,
`src/renderer/src/components/PmccEntryForm.tsx`, `PmccLegSection.tsx`, `PmccCashFlows.tsx`,
`NewPositionSheet.tsx`, `position-cockpit/PmccLegReference.tsx`, `schemas/pmcc-entry.ts`,
`lib/pmcc-entry.ts`, `hooks/useCallChain.ts`, `hooks/useUnderlyingPrice.ts`,
`hooks/marketDataQueryKeys.ts`, `e2e/open-pmcc-position.spec.ts`
**What changed**: `Record PMCC` stays enabled so submit surfaces resolver errors (AC "select
Record PMCC → error beside the field"); the "unexpired contract" rule now precedes "after fill
date" in both the engine and the form schema; list and detail recompute the initial net debit
from the legs' fills and fees through `calculatePmccOpeningDebit` instead of the rounded
`basis_per_share`; the ratio label reads `Debit / strike width, before fees`; the underlying
price is a one-shot snapshot on its own query key and the chain keeps its previous page for the
same ticker; a disabled chain query reports `idle` (no "Loading…" before a ticker is typed);
a re-entry guard prevents double submits; Escape inside a portalled popover no longer closes the
sheet; `__pair__` is a typed optional key of the entry schema (two casts removed).
**Reason**: blocking findings B1–B5, B7–B10 of the cold review.

### 12. Second-review fixes (test-first)

**Files**: `src/renderer/src/lib/pmcc-entry.ts`, `hooks/useCallChain.ts`,
`components/PmccLegSection.tsx`, `components/PmccEntryForm.tsx`, `components/NewPositionSheet.tsx`
**What changed**: `filterCallChain` keeps the selected contract in the list even when a refetch
moves it out of the delta band, and drops any quote whose OCC root is not the ticker (adjusted
contracts never reach the picker); the leg section holds the last-seen selected quote so the
select, quote strip and stale notice survive a refetch that omits it; the sheet restores focus to
whichever element opened it (sidebar item, header link, empty-state link) and falls back to the
header trigger; the server's pair-level errors now share the client's typed `__pair__` slot.
**Reason**: blocking findings of the second cold review.

### Candidates considered and declined

- `registerParsedHandler` for `positions:create-pmcc` (Area 6): the handler is already the
  mandated five-line shape and would be the helper's only caller.
- Folding `mapActiveLeg` into `mapLegRow` (Area 1): the two rows are aliased differently;
  a re-alias would not read simpler than the third copied field.
- Switching `openWheel` / `openCoveredCall` to the parameterised per-leg helpers (Area 3):
  their messages differ from the PMCC ones, so nothing would be shared.

## Test Execution Results

See the story's verification-loop report; every refactor above was followed by the affected
suites (and, at each layer boundary, `pnpm lint && pnpm typecheck`) running green.

## Quality Checks

- ✅ `pnpm test` passed after every layer's refactor (no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Files touched (production)

- `src/main/core/costbasis.ts`
- `src/main/core/lifecycle.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/main/schemas.ts`
- `src/main/services/position-rows.ts`
- `src/main/services/positions.ts`
- `src/main/services/create-pmcc-position.ts`
- `src/main/services/list-positions.ts`
- `src/renderer/src/schemas/common.ts`
- `src/renderer/src/schemas/pmcc-entry.ts`
- `src/renderer/src/components/positionRowStyles.ts`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/components/PmccPositionRow.tsx`
- `src/renderer/src/components/PmccLegSection.tsx`
- `src/renderer/src/components/PmccEntryForm.tsx`
- `src/renderer/src/components/NewWheelForm.tsx`
- `src/renderer/src/components/NewPositionSheet.tsx`
- `src/renderer/src/hooks/useUnderlyingPrice.ts`

## E2E coverage added or modified

- `e2e/open-pmcc-position.spec.ts` — 40 cases across 9 scenarios (Layer 7)

## Remaining Tech Debt

- [ ] `mapActiveLeg` in `get-position.ts` reads the LEFT-JOINed leg columns with `!` (pre-existing
      pattern, now including `fees`); a typed narrowing of the joined row would remove them.
- [ ] `createPosition` returns `snapshotAt: now` while it persists `makeSnapshotAt(fillDate)`;
      `createPmccPosition` returns the persisted value. Pre-existing inconsistency, not changed
      here.
- [ ] `useStockQuotes` is single-subscriber by design; any second concurrent consumer would
      need a reference-counted subscription in the main process.
- [ ] `listPositions` drops a PMCC whose leg rows are missing (WARN `pmcc_list_summary_incomplete`)
      rather than surfacing it; unreachable through `createPmccPosition`, noted for US-108.

## Notes

All refactorings performed incrementally with tests passing after each change.
