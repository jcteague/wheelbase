# Implementation Plan: US-8 Bug Fix — Correct P&L Preview Percentage Formula

## Summary

The `CcPnlPreview` component displays an incorrect "% of max" label when showing a profit close. The current formula (`closePrice / openPremium × 100`) computes the fraction of premium being paid back, not the fraction of max profit captured. The fix corrects it to `(openPremium − closePrice) / openPremium × 100`, matching both the acceptance criteria and the industry-standard "% of max profit captured" framing that wheel traders use for the 50%-of-max close rule.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-8-close-covered-call-early.md`
- **Research & Design Decisions:** `plans/us-8-pct-fix/research.md`

## Prerequisites

US-8 is fully implemented. All tests pass on the `us-8-close-cc_early` branch. This fix touches only the renderer component and its unit test; no DB migrations, IPC changes, or service-layer changes are required.

## Implementation Areas

### 1. Fix Percentage Formula in CcPnlPreview

**Files to create or modify:**

- `src/renderer/src/components/ui/CcPnlPreview.tsx` — correct profit-branch percentage formula
- `src/renderer/src/components/ui/CcPnlPreview.test.tsx` — update expected percentage value

**Red — tests to write:**

- In `CcPnlPreview.test.tsx`, update the existing profit-case test (`'renders profit amount and "% of max" label for profit close'`) to assert `52.2% of max` instead of `47.8% of max`.
  - Inputs: `openPremiumPerContract="2.30"`, `closePricePerContract="1.10"`, `contracts={1}`
  - Corrected formula: `(2.30 − 1.10) / 2.30 × 100 = 52.2%`
  - Assert: `screen.getByText(/52\.2% of max/)` is in the document
  - Assert (negative): `screen.queryByText(/47\.8% of max/)` is NOT in the document

After the test expectation is updated and before the component is fixed, the test must fail (Red).

**Green — implementation:**

- In `CcPnlPreview.tsx` line 34, change the profit-branch percentage calculation:
  - **Remove:** `const pct = closeDecimal.div(open).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP)`
  - **Replace with:** `const pct = open.minus(closeDecimal).div(open).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP)`
- Update the inline comment on line 33 to reflect the corrected formula: `% of max profit captured = (openPremium − closePrice) / openPremium × 100`

**Refactor — cleanup to consider:**

- Verify the loss-branch comment on line 38 is still accurate (`(closePrice - openPremium) / openPremium × 100 = % above open`) — it is unchanged and correct.
- Check naming consistency: `pct` is used in both branches; no renaming needed.

**Acceptance criteria covered:**

- AC3: "P&L preview shown on the form before submission — profit close: shows '+$115.00 profit (50% of max)'"
- The corrected formula produces `(openPremium − closePrice) / openPremium × 100` as specified in the AC technical requirements.

### 2. E2E Test — Update Profit-Preview Scenario

**Files to create or modify:**

- `e2e/close-cc-early.spec.ts` — update close price and assertions in the profit-preview test

**Red — tests to write:**

The existing profit-preview e2e test used `closePrice = $1.15`, which yields 50.0% under both the old and corrected formula — making the test unable to catch a regression. Change the close price to `$1.10`:

- Corrected formula: `(2.30 − 1.10) / 2.30 × 100 = 52.2%`
- Old formula: `1.10 / 2.30 × 100 = 47.8%`

After the test is updated (close price `$1.10`, assertion `toContain('52.2% of max')`) but before the component formula is fixed, the test must fail because the component still produces `47.8%`.

Updated assertions:

- `expect(bodyText).toContain('120')` (pnl = (2.30−1.10)×1×100 = $120.00)
- `expect(bodyText).toMatch(/profit/i)`
- `expect(bodyText).toContain('52.2% of max')` (replaces the loose `/50|% of max/i` regex)

**Green — implementation:**

Fix `CcPnlPreview.tsx` profit-branch formula (see Area 1). No further e2e changes needed.

**Refactor — cleanup to consider:**

The assertion is now a `toContain` string match rather than a regex, which is both readable and unambiguous. No further cleanup needed.

**Acceptance criteria covered:**

- AC3 (e2e): the form displays the correct percentage label before submission.
