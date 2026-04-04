# Bug: Annualized return uses ASCII hyphen instead of unicode minus for negative values

**Severity:** Low
**Found in:** QA run — US-10 Scenario 2 (Loss Call-Away) success screen
**GitHub:** jcteague/wheelbase#3

## Steps to Reproduce

1. Record a call-away that results in a loss (CC strike below effective cost basis)
2. Observe the annualized return on the Cycle Summary screen

## Expected

`~−25.1%` — unicode minus sign (U+2212), consistent with how dollar P&L values are rendered

## Actual

`~-25.1%` — ASCII hyphen-minus (U+002D)

## Notes

The dollar P&L values (`−$200.00`) correctly use U+2212. The annualized return formatter appears to use a different code path that produces a plain hyphen for negative percentages. Purely cosmetic — no calculation is wrong.

## Suggested Fix

Ensure the annualized return formatting utility uses the same unicode minus character as the P&L formatter when the value is negative.
