# US-102: Shared PMCC expiration safety

<!-- generated:from us-102 -->

## Summary

The resulting open PMCC pair must satisfy `longExpiration > shortExpiration`.
Entry and both roll directions share a pure calendar comparator and stable
messages, keeping safety independent of displayed DTE. Both PMCC roll sheets use
the New York calendar day for review figures and default fill dates.

This delivers the shared prerequisite for US-115. Its real subsequent-short
workflow and full cross-story acceptance remain outstanding.

## Acceptance criteria

Requirements live exclusively in [Linear OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
Coverage references **S1–S4 and S7–S9** are verified by nine independently named
Electron cases. **S5/S6** comprise three real subsequent-short integration cases
owned by US-115; they are not verified by this prerequisite.

Recorded verification: 4,633 unit/integration tests passed across 288 files;
all four changed production files have 100% line and branch coverage. Successful
Electron batches and retries cover 42 suites with 479 passing cases and one
pre-existing TODO. Fresh-context review reported zero blocking or advisory findings.

## What was built

`shortExpiresBeforeLeaps` in `pmcc-rules.ts` compares parsed calendar dates using
date-fns. Equality and invalid parsed dates cannot establish coverage. Entry and
both roll directions retain one predicate and the existing error identities.

The roll services remain authoritative: they load the live opposite leg through
`loadPmccRollContext` / `getPosition(...).pmccOpenLegs`, validate before writes,
and use `recordPmccRoll` to persist linked close/open legs and a snapshot atomically.
Regression coverage checks the boundary after an opposite-leg roll, complete
unchanged state on rejection, and real service errors through `handleIpcCall`.
A LEAPS roll without an open short skips the coverage comparison while retaining
other validation. Classic-wheel behavior retains its own rules.

`newYorkToday` supplies `America/New_York` dates to the two PMCC roll sheets using
native Intl. Explicit `today` injection remains available; existing date-fns DTE
calculations, RHF/Zod validation, retained drafts, field errors and visibly disabled
confirmation continue to apply. Entry and classic-wheel date defaults are unchanged.

See [wheel lifecycle](../domain/wheel-lifecycle.md),
[short-call rolls](./us-104-roll-pmcc-short-call.md) and
[LEAPS rolls](./us-105-roll-pmcc-leaps.md) for the consuming workflows.

## Architecture decisions

- **One pure calendar predicate, independent of valuation DTE.** Reusing shared
  rules avoids entry/roll drift; parsed dates prevent invalid dates from supplying
  coverage. This extends the existing
  [PMCC engine/form validation decision](../architecture/02-adrs/pmcc-validation-pure-engine-mirrored-by-form-schema.md).
- **Live service validation before atomic persistence.** Renderer context cannot
  establish the current opposite leg. Existing transaction helpers remain the
  boundary that protects history from partial rejected rolls.
- **New York clock selection at the two roll-sheet boundaries.** The explicit
  valuation basis needs neither another timezone dependency nor a global clock
  change. The same date also supplies those forms' default fill dates.
- **Prerequisite before consumer.** US-115 must reuse the live LEAPS expiration
  and shared short-side rule before persistence, preserve rejected drafts, and
  verify S5/S6 through its real workflow. Comparator tests and test-only state
  arrangement do not substitute for those three cases.

## Contracts touched

| Contract                                                   | Stable behavior                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `shortExpiresBeforeLeaps(shortExpiration, longExpiration)` | Boolean comparison of canonical `YYYY-MM-DD` dates; strict ordering, equality rejected.                                   |
| `SHORT_NOT_BEFORE_LONG`                                    | `short_not_before_long`: `Short call must expire before the LEAPS call.`                                                  |
| `LONG_NOT_AFTER_SHORT`                                     | `long_not_after_short`: `LEAPS call must expire after the short call.`                                                    |
| Entry / roll fields                                        | Entry uses `short.expiration`; both rolls use `newExpiration`.                                                            |
| `positions:roll-pmcc-short`, `positions:roll-pmcc-leaps`   | Existing payloads/results; rejection through `handleIpcCall` remains `{ ok: false, errors: [{ field, code, message }] }`. |
| `newYorkToday(now?)`                                       | New York `YYYY-MM-DD` day; omitted `now` defaults at the call boundary.                                                   |

No persisted schema, phase transition or IPC surface was added. See
[Zod schemas](../contracts/zod-schemas.md) for the consuming validation contracts.

## Source files

- `src/main/core/pmcc-rules.ts` — shared calendar comparison and message identities.
- `src/renderer/src/lib/dates.ts` — `newYorkToday`.
- `src/renderer/src/components/RollPmccShortCallSheet.tsx` — New York review/fill default.
- `src/renderer/src/components/RollPmccLeapsSheet.tsx` — New York review/fill default.
- `e2e/pmcc-expiration-safety.spec.ts` — nine named existing-workflow safety cases.
- `e2e/pmcc-expiration-safety-helpers.ts` — draft, field-error and server-rejection assertions.

Source: [us-102 extract](../.extracts/us-102.md).

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
