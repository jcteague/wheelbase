# Bug: Escape key does not dismiss action sheets

**Severity:** Low
**Found in:** QA run — US-10 adversarial testing (3e)
**GitHub:** jcteague/wheelbase#2

## Steps to Reproduce

1. Navigate to any position detail page (e.g. a CSP_OPEN position)
2. Click "Record Assignment →" to open the assignment sheet
3. Press the Escape key

## Expected

The sheet closes without recording any data. Position phase is unchanged.

## Actual

The sheet remains open. Only the × button closes it.

## Notes

Escape-to-dismiss is a standard desktop/web UX convention users will expect. No data is lost or corrupted — the × button works correctly.

## Suggested Fix

Add an `onKeyDown` handler (or use the Radix `Sheet` / `Dialog` built-in escape handling) to close the sheet when Escape is pressed.
