## P&L Preview Percentage Formula

- **Decision:** Use `(openPremium − closePrice) / openPremium × 100` for the "% of max" label in the profit branch of `CcPnlPreview`.
- **Rationale:** This is the industry-standard "% of max profit captured" framing popularised by tastytrade and widely used by wheel traders. Traders use this number to apply the 50%-of-max close rule. The current implementation computes `closePrice / openPremium × 100` ("% of max you're paying back"), which is a valid complementary metric but is not the number traders are trained to act on, and produces incorrect values for all close prices except the exact 50% breakeven point.
- **Alternatives considered:** Keep the current formula and update the label to "% of premium returned" — rejected because it does not match trader mental models or the acceptance criteria.

## E2E Test Impact

- **Decision:** Change the e2e profit-preview close price from `$1.15` to `$1.10` and tighten the assertion to `toContain('52.2% of max')`.
- **Rationale:** `$1.15` is the exact 50% midpoint where both the old and corrected formulas produce the same result, making the test unable to catch a regression. `$1.10` yields 52.2% under the correct formula and 47.8% under the old one — the test now falsifies the wrong implementation.

## Loss Branch

- **Decision:** Leave the loss branch ("% above open") unchanged.
- **Rationale:** The options expert confirmed there is no industry-standard equivalent metric for the loss side; "% above open" is a reasonable descriptive label. The AC originally said to omit the percentage on the loss side, but the current label is a valid enhancement. This is out of scope for this fix.

## Unit Test Impact

- **Decision:** Update the profit-case unit test expectation from `47.8%` to `52.2%`.
- **Rationale:** For `openPremium = $2.30`, `closePrice = $1.10`: corrected formula = `(2.30 − 1.10) / 2.30 × 100 = 52.2%`.
