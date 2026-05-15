# Red Phase Results: US-34 Layer 4 — Page Wiring

## Feature Context

- **Feature directory**: `plans/us-34/`
- **User story**: `docs/epics/06-stories/US-34-greeks-display.md`
- **Plan file**: `plans/us-34/plan.md`
- **Layer**: 4 — Page Wiring (PositionDetailContent + PositionDetailPage)

## Test Files Modified

- `src/renderer/src/pages/PositionDetailPage.test.tsx`

## What Changed

### Mock additions

- Added `vi.mock('../hooks/useStockQuotes')` and `mockStockQuotes()` helper
- `beforeEach` now also calls `mockStockQuotes(undefined)` (default: no stock quote data)

### Updated tests (10 → now assert new cockpit UI, fail against old layout)

| Test                                                                     | Old assertion                       | New assertion                                                     |
| ------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| `renders leg history section with two legs in order`                     | Direct `getAllByRole('row')`        | Click "Cost basis & history" drawer first                         |
| `does not render leg history section when legs array is empty`           | `queryByText('Leg History')` absent | `getByRole('button', { name: /cost basis/i })` present + no table |
| `leg history table shows running cost basis column header`               | Direct text assertion               | Click drawer first                                                |
| `leg history table shows running basis value for CSP_OPEN leg`           | Direct `$176.50`                    | Click drawer first                                                |
| `leg history table renders final P&L footer for WHEEL_COMPLETE position` | `getAllByText` ≥ 2 occurrences      | Click drawer first; 1 occurrence in tfoot only                    |
| `leg history table has no P&L footer when finalPnl is null`              | Direct `queryByText`                | Click drawer first                                                |
| `Open Leg section renders Current Mid stat with $1.30`                   | Direct text assertion               | Click "Leg reference" drawer first                                |
| `Open Leg section renders Unrealized P&L stat +$220.00`                  | `getByText('Unrealized P&L')`       | `getByText(/captured/)` + `getByRole('progressbar')`              |
| `Open Leg section renders Unrealized P&L stat -$170.00`                  | `getByText('Unrealized P&L')`       | `getByText(/captured/)` + `getByRole('progressbar')`              |
| `Open Leg section renders % of Max Profit stat as 62.9%`                 | `getByText('62.9%')`                | `getByText(/captured/)` + `getByRole('progressbar')`              |
| `Open Leg section omits stats when activeLeg is null`                    | Negative assertions only            | `getByText('NO ACTIVE LEG')` + negative assertions                |
| `Open Leg section omits stats when snapshot is undefined`                | Negative assertions only            | `getByText('Awaiting market data')` + negative assertions         |

### New tests (4)

1. `renders VerdictBlock with verdict pill when active leg and snapshot present` — asserts 'Awaiting market data', `captured`, progressbar
2. `renders NO ACTIVE LEG verdict when position is HOLDING_SHARES with no active leg` — asserts 'NO ACTIVE LEG', no 'Risk snapshot'
3. `renders ContextStrip theta/IV/vega/gamma when snapshot with greeks is present` — asserts Theta/IV/Vega/Gamma labels
4. `does not render RiskSnapshot when snapshot is absent` — asserts 'Awaiting market data' + no 'Risk snapshot'

## Test Execution Results

```
Tests  16 failed | 26 passed (42)
```

**All 16 failures are because the old layout (PositionDetailContent) doesn't have:**

- `<CollapsedDrawer>` buttons ("Cost basis & history", "Leg reference")
- `VerdictBlock` with "Awaiting market data" / "NO ACTIVE LEG" text
- `PnlSummary` with "captured" text and progressbar role
- `ContextStrip` with Theta/IV/Vega/Gamma labels

**26 passing tests** are unchanged tests that still work against the old layout (sheet wiring, blur behavior, loading/error states, notes, etc.).

## Verification

- ✅ Every failure is because the old PositionDetailContent doesn't use PositionCockpit
- ✅ No syntax errors in test file
- ✅ No fixture or import errors caused by test setup mistakes
- ✅ `useStockQuotes` mock is in place for when Green wires it into PositionDetailPage

## Handoff to Green Phase

Green phase implements Area 10 of plans/us-34/plan.md:

1. **`PositionDetailPage.tsx`** — add `useStockQuotes` hook, derive `underlyingPrice`, pass to `PositionDetailContent`
2. **`PositionDetailContent.tsx`** — accept `underlyingPrice?: string | null`, replace body with `<PositionCockpit>`, keep Notes/closed-banner/CloseCspForm below

After Green, all 42 tests must pass.
