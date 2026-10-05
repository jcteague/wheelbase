# Red Phase Results: US-103 Area 9 — Renderer (`fmtPct1`, `PmccCostBasis`, cockpit stack)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan**: `plans/us-103/plan.md` § 9. Renderer; tasks: `plans/us-103/tasks.md` Area 9
- **Layout of record**: `mockups/epic-09-pmcc-position-detail.mdx` (Cost basis CollapsedDrawer) — credits are neutral (mockup green ruled out by the story); `OwnerNote` → `Caption`

## Test Files Created/Modified

- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/lib/format.test.ts` — `describe('fmtPct1')`, 4 cases
- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/components/position-cockpit/PmccCostBasis.spec.tsx` (new) — 24 cases
- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` — 2 PMCC cases + new `describe('wheel position never renders the PMCC ledger')` (3 cases)

## Interfaces Under Test

```typescript
// src/renderer/src/lib/format.ts
export function fmtPct1(value: string): string // half-up, 1 dp, '%' suffix

// src/renderer/src/api/positions.ts
export type { PmccLedgerResult } from '../../../main/core/costbasis'

// src/renderer/src/components/position-cockpit/PmccCostBasis.tsx
export function PmccCostBasis({ ledger }: { ledger: PmccLedgerResult }): React.JSX.Element

// PositionCockpit PMCC branch renders <PmccCostBasis> after PmccLegReference when detail.pmccLedger != null
```

## Test Coverage Summary

- `fmtPct1`: `8.0000→8.0%`, `101.7778→101.8%`, `12.8000→12.8%`, `0.0500→0.1%`
- `PmccCostBasis`: button matching `/Cost basis\s*6 fields/`, `aria-expanded="true"` on mount; caption `US-103 · cash ledger, never a quote`; six labels in DOM order; values `$21.80`, `$2,180.00`, `$25.00`, `-$3.20`, `$101.80`, `12.8%`; negative ledger `-$0.40`, `-$40.00`, `101.8%`; null → `—` for Premium recovered / Effective share cost; drawer text never matches `/profit/i`, `/realized/i`, `/Effective Basis \/ Share/i`, `/\bShares\b/i`, `/Max profit/i`, `/Breakeven/i`, `/Annualized/i`; credits cell has no `.text-wb-green`; `$21.80` element has `text-wb-sky`
- `PositionCockpit`: `Buy LEAPS call` precedes the Cost basis button (`compareDocumentPosition`), `Cost basis / share` visible, `Cost basis & history` absent; `pmccLedger: null` → no Cost basis button; wheel CSP_OPEN / HOLDING_SHARES / WHEEL_COMPLETE never show `Cost basis / share` or `Effective share cost`
- Property cases: no property — renderer

## Test Design Assumptions

- Value lookup: `screen.getByText(label).parentElement` is the `Stat` inner div (label span + value span); `toHaveTextContent(value)` on it. Null case asserts `'<label>—'` concatenated.
- Class checks: `screen.getByText('$21.80')` must itself carry `text-wb-sky` — `Stat` has no className prop, so Green passes `value={<span className="text-wb-sky">…</span>}`. Credits: `cell.querySelector('.text-wb-green')` is null and `getByText('-$3.20')` lacks `text-wb-green`.
- Drawer text = `textContent` of the drawer button's parent (CollapsedDrawer root).
- Credits display is the negated per-share credit (`3.2000` → `-$3.20`).
- Wheel `baseDetail` already carried `pmccLedger: null`; no fixture change needed.
- Spec validity was checked against a throwaway reference implementation (24/24 pass), then the file was deleted.

## Test Execution Results

```
FAIL PmccCostBasis.spec.tsx — Failed to resolve import "./PmccCostBasis". Does the file exist?
FAIL format.test.ts > fmtPct1 (4) — TypeError: fmtPct1 is not a function
FAIL PositionCockpit.spec.tsx > PMCC position > renders the Cost basis drawer after the Buy LEAPS call card
     — Unable to find role="button" name /Cost basis\s*6 fields/
Test Files 3 failed (3); Tests 5 failed | 67 passed (72)
```

Typecheck (expected until Green): `PmccLedgerResult` not exported from `../../api/positions`; `./PmccCostBasis` not found; `fmtPct1` not exported.

Passing-by-design guards (regression guards, cannot fail before Green): `pmccLedger: null` → no drawer; the 3 wheel cases. All pre-existing cockpit/format tests still pass.

## Verification

- Every failure is due to missing implementation, not test bugs.
