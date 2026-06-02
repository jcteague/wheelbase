---
plan: us-8-pct-fix
source: plans/us-8-pct-fix/
extracted_at: 2026-05-30
status: complete
revision_of: us-8
---

# Extract: us-8-pct-fix (revision of us-8)

## Summary

Revision of US-8 (Close Covered Call Early). The `CcPnlPreview` component's profit-branch percentage label was computing the wrong value: it used `closePrice / openPremium × 100` ("% of premium paid back") instead of `(openPremium − closePrice) / openPremium × 100` ("% of max profit captured"). The latter is the industry-standard tastytrade-popularised framing that wheel traders use to apply the 50%-of-max close rule, and it is the metric called out in US-8's acceptance criteria. The fix is a one-line change in the renderer component plus updated unit and e2e test expectations. This revision rolls into US-8's feature page; it does not introduce new entities, contracts, or schema changes.

## Architecture Decisions

### ADR: "% of max profit captured" Formula in CcPnlPreview

- **Decision:** Use `(openPremium − closePrice) / openPremium × 100` for the "% of max" label in the profit branch of `CcPnlPreview`.
- **Why:** This is the industry-standard "% of max profit captured" framing popularised by tastytrade and widely used by wheel traders. Traders use this number to apply the 50%-of-max close rule. The previous implementation computed `closePrice / openPremium × 100` ("% of premium you're paying back"), which is a valid complementary metric but does not match trader mental models or US-8's acceptance criteria. It also produces incorrect values for every close price except the exact 50% breakeven point.
- **Alternatives considered:**
  - Keep the current formula and relabel it to "% of premium returned" — rejected because it does not match trader mental models or the acceptance criteria.
- **Source:** `plans/us-8-pct-fix/research.md`, `plans/us-8-pct-fix/plan.md`

### ADR: Loss Branch Left Unchanged

- **Decision:** Leave the loss-branch label ("% above open") unchanged. The loss branch formula `(closePrice − openPremium) / openPremium × 100` and its comment are correct.
- **Why:** The options expert confirmed there is no industry-standard equivalent metric for the loss side; "% above open" is a reasonable descriptive label. The original US-8 AC said to omit the percentage on the loss side, but the current label is a valid enhancement and is out of scope for this fix.
- **Alternatives considered:** Remove the loss-branch percentage entirely to match the original AC — deferred; out of scope.
- **Source:** `plans/us-8-pct-fix/research.md`

### ADR: E2E Test Close Price Moved Off 50% Midpoint

- **Decision:** Change the e2e profit-preview test's close price from `$1.15` to `$1.10` and tighten the assertion to `toContain('52.2% of max')`.
- **Why:** With `openPremium = $2.30`, a close price of `$1.15` is the exact 50% midpoint where both the old (`1.15 / 2.30 = 50.0%`) and corrected (`(2.30 − 1.15) / 2.30 = 50.0%`) formulas yield the same value. The test was therefore unable to catch a regression. `$1.10` yields `52.2%` under the corrected formula and `47.8%` under the old formula, so the test now falsifies the wrong implementation.
- **Alternatives considered:** Keep `$1.15` and add a second assertion at another price — rejected as duplicative; moving the single existing assertion off the midpoint is enough.
- **Source:** `plans/us-8-pct-fix/research.md`, `plans/us-8-pct-fix/plan.md`

## Contracts

No new contracts, no IPC payload changes, no schema additions. This revision modifies the body of an existing pure formula inside one renderer component.

The corrected formula (for reference):

```typescript
// src/renderer/src/components/ui/CcPnlPreview.tsx (profit branch, ~line 33–34)
// % of max profit captured = (openPremium − closePrice) / openPremium × 100
const pct = open.minus(closeDecimal).div(open).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
```

The loss-branch formula and comment are unchanged: `(closePrice − openPremium) / openPremium × 100 = % above open`.

- **Source:** `plans/us-8-pct-fix/plan.md`
- **Implementation:** `src/renderer/src/components/ui/CcPnlPreview.tsx`

## Schema Changes

None. No new entities, migrations, IPC changes, or service-layer changes. The fix is renderer-only.

**Source:** `plans/us-8-pct-fix/plan.md`

## Acceptance Criteria

From `plans/us-8-pct-fix/plan.md` (acceptance criteria covered by this revision):

- **AC3 (US-8):** "P&L preview shown on the form before submission — profit close: shows '+$115.00 profit (50% of max)'." The corrected formula produces `(openPremium − closePrice) / openPremium × 100` as specified in the AC technical requirements.
- AC3 also covered at the e2e level: the form displays the correct percentage label before submission.

Worked numeric examples used as test fixtures:

- `openPremium = $2.30`, `closePrice = $1.10`, `contracts = 1` → P&L `+$120.00`, label `52.2% of max` (corrected) vs. `47.8% of max` (incorrect/old).
- `openPremium = $2.30`, `closePrice = $1.15`, `contracts = 1` → P&L `+$115.00`, label `50.0% of max` (both formulas agree — why this fixture is unsuitable for regression testing).

## Decisions & Tradeoffs

- **One-line formula change:** "In `CcPnlPreview.tsx` line 34, change the profit-branch percentage calculation" — the fix is a single expression rewrite from `closeDecimal.div(open)` to `open.minus(closeDecimal).div(open)`, plus an updated inline comment (`plan.md`).
- **No service or IPC changes:** "this fix touches only the renderer component and its unit test; no DB migrations, IPC changes, or service-layer changes are required" (`plan.md`).
- **`pct` variable naming retained:** "`pct` is used in both branches; no renaming needed" (`plan.md`, refactor section).
- **Decimal precision retained:** continues to use `decimal.js` with `ROUND_HALF_UP` to one decimal place, matching project money-math standards.
- **Loss-side "% above open" left intact:** deliberately out of scope; the loss-branch enhancement beyond the original AC is preserved (`research.md`).

## Source Code References

Files modified by this revision:

- `src/renderer/src/components/ui/CcPnlPreview.tsx` (modified — profit-branch formula + inline comment)
- `src/renderer/src/components/ui/CcPnlPreview.test.tsx` (modified — profit-case expectation updated from `47.8%` to `52.2%`, with negative assertion that `47.8% of max` is NOT present)
- `e2e/close-cc-early.spec.ts` (modified — close price changed from `$1.15` to `$1.10`; assertion tightened to `toContain('52.2% of max')`; P&L assertion updated to `toContain('120')`)

## Manual Test Plan Highlights

From `plans/us-8-pct-fix/manual-test-plan.md` (rolls into the US-8 manual test plan; the percentage-label expectations supersede the original US-8 values where they differ):

- **TC-1 Happy Path — Profitable Close:** With `openPremium = $2.30`, `closePrice = $1.10`, `contracts = 1`, the P&L preview must show `+$120.00 profit · 52.2% of max`. Success card shows `+$120.00`; leg recorded as `CC_CLOSE` at `$1.10`; cost basis `(unchanged)`.
- **TC-2 Loss Close:** With `closePrice = $3.50`, preview must show `−$120.00 loss · 52.2% above open` (loss-branch formula `(3.50 − 2.30) / 2.30 × 100 = 52.2%`, label retained from existing implementation).
- **TC-3 Break-Even:** `closePrice = $2.30` → `$0.00 break-even`.
- **TC-4 50% of Max:** `closePrice = $1.15` → `+$115.00 profit · 50.0% of max` (the midpoint case where both formulas agree).
- **TC-5/TC-6 Validation:** Close price `0` or `-1` → "Close price must be greater than zero".
- **TC-7 Validation:** Fill date before CC open date → "Fill date cannot be before the CC open date".
- **TC-8 Validation:** Fill date after CC expiration → "Fill date cannot be after the CC expiration date".
- **TC-9:** "Close CC Early →" button absent when position is not in `CC_OPEN`.
- **TC-10:** Cancel closes the sheet with no changes to the position.
- **TC-11:** Cost basis per share unchanged after CC close.
- **TC-12/TC-13:** Success screen offers "Sell New Covered Call on <ticker> →" CTA and "View full position history" link; history shows both `CC_OPEN` and `CC_CLOSE` legs.

## Open Questions

None recorded in the plan. The loss-branch "% above open" enhancement remains an intentional deviation from the original US-8 AC and is tracked only implicitly here — no follow-up action item exists in `plans/us-8-pct-fix/`.
