# Bug: Lowercase ticker accepted without validation warning

**Severity:** Low
**Found in:** QA run — US-10 adversarial testing (3c)
**GitHub:** jcteague/wheelbase#1

## Steps to Reproduce

1. Navigate to Open New Wheel form
2. Enter `aapl` (lowercase) in the Ticker field
3. Fill remaining fields with valid values
4. Submit

## Expected

Either:

- Validation error: "Ticker must be 1-5 uppercase letters", OR
- Auto-uppercase the input with visible feedback (e.g. the field visually transforms to `AAPL`)

## Actual

The form accepts the lowercase value silently and stores it as `AAPL`. The user receives no feedback that their input was changed.

## Notes

The validation message ("Ticker must be 1-5 uppercase letters") implies lowercase would be rejected, yet it is not. No data corruption occurs — normalization works correctly — but the UX is misleading.

## Suggested Fix

Either apply `text-transform: uppercase` to the input field so the user sees uppercase as they type, or add explicit uppercase normalization on blur with a visible indicator.
