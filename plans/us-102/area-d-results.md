# US-102 — Area D Red / Green results

Story authority: [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
Implementation context: [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), and the
[expiration-safety mockup](../../mockups/us-102-enforce-long-dte-greater-than-short-dte.mdx).

## Scope

- `src/renderer/src/components/RollPmccShortCallSheet.tsx`
- `src/renderer/src/components/RollPmccLeapsSheet.tsx`
- Both corresponding `Sheet.test.tsx` and `Form.test.tsx` files.

The two sheets now default `today` through `newYorkToday()` instead of
`localToday()`. Explicit `today` injection remains supported. The shared date
feeds the existing date-fns review calculations and default fill date.
No production form, schema, hook, submission, or presentation change was needed.

## Test coverage

- Fixed instant `2026-09-15T01:00:00Z` under `TZ=UTC` proves both sheets use the
  New York calendar day `2026-09-14` for review and default fill date.
- Both sheets honor an explicit `today='2026-09-14'`.
- Valid short-roll review displays `2027-02-19` as 158 DTE, retaining read-only
  LEAPS context and 210 days of remaining coverage.
- Valid LEAPS-roll review displays `2028-01-21` as 494 DTE, with read-only
  short-call expiration context.
- Expanded existing form rejections to equality and inverted expiration order
  for both directions. Assertions cover the deterministic red field error,
  disabled/dimmed confirm, retained strike, fills, expiration, fill date and net
  preview, blocked submission, and valid correction restoring confirmation.
- Strengthened existing server-expiration coverage to verify retained draft,
  no close or success callback, and a corrected subsequent submission.
- Existing no-short LEAPS behavior, valid mutation payloads, success callbacks,
  pending state and close interactions remain covered by the same suite.

The inversion LEAPS fixture uses `2027-07-15`, after its fill date and before
the open short expiration `2027-07-16`, to isolate coverage rejection from the
independent expiration-after-fill rule. Review fixtures adapt existing open
legs to the story's valuation day without changing shared fixtures.
No property tests apply to these React sheet boundaries; pure calendar
invariants are covered in areas A/B.

## Red evidence

```bash
TZ=UTC pnpm test src/renderer/src/components/RollPmccShortCallSheet.test.tsx src/renderer/src/components/RollPmccLeapsSheet.test.tsx src/renderer/src/components/RollPmccShortCallForm.test.tsx src/renderer/src/components/RollPmccLeapsForm.test.tsx
```

Result before production changes: **2 failed, 108 passed (4 files)**.
Only the two default-timezone tests failed: expected fill date `2026-09-14`,
received `2026-09-15`. Both failures demonstrated the production local-timezone
default. The remaining regressions were already implemented and passed; they
were retained without manufacturing red behavior.

Full output: `/private/tmp/wb-102-area-d-red.log`.

## Green evidence

After changing only the imports and default `today` in both sheets, the same
command passed: **110 passed (4 files)**, duration 26.47 seconds.

Full output: `/private/tmp/wb-102-area-d-green.log`.

Area D Red/Green is complete. The parent implementation owns D-Refactor,
formatting, ordered full-suite checks, app verification and spec refresh.
