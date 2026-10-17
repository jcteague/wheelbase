# Implementation Plan: US-102 — Shared PMCC expiration safety

## Summary

Complete and verify the shared expiration invariant that US-115 depends on.
US-104 and merged US-105 already supply the comparator, both messages, transactional
roll validation and corresponding sheets. This plan tightens calendar handling
and regression coverage; the subsequent-short workflow remains owned by US-115.

## Supporting Documents

- **Requirements:** [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
- **Research:** [research.md](./research.md).
- **Data model and Type Design:** [data-model.md](./data-model.md).
- **Verification:** [quickstart.md](./quickstart.md).
- **Mockup:** [Expiration safety](../../mockups/us-102-enforce-long-dte-greater-than-short-dte.mdx).
- **Future consumer:** [OPT-23 / US-115](https://linear.app/optionswheel/issue/OPT-23).

No new IPC surface or `contracts/` artifact. Linear remains the story authority.

## Prerequisites and completion boundary

US-101, US-104 and US-105 are present on `main` (`c3fc14a`). Existing
`shortExpiresBeforeLeaps`, `SHORT_NOT_BEFORE_LONG`, `LONG_NOT_AFTER_SHORT`,
`pmccShortRollIssues`, `pmccLeapsRollIssues` and `recordPmccRoll` are reused.

Dependency direction is **US-102 → US-115**. Delivering this prerequisite does not
require implementing or waiting for US-115. The Linear story describes the full
invariant across workflows: the two subsequent-short scenarios remain integration
acceptance obligations for that consumer. This document names those tests and
their owner; it does not claim full-story acceptance is already achievable or
verified. No Linear status or acceptance text is changed by this plan.

## Acceptance coverage audit

Scenario references below are a test index, not a duplicate requirements document.
Every scenario has a named E2E destination. Seven families / nine cases run now;
two families / three cases require the US-115 workflow and remain explicitly open.

| Ref | Named test                                                                    | Owner / availability              |
| --- | ----------------------------------------------------------------------------- | --------------------------------- |
| S1  | Roll the short call to an expiration before the open LEAPS call               | US-102, existing path             |
| S2  | Reject a short-call roll that would outlast or equal the LEAPS call           | US-102, equal/later cases         |
| S3  | Roll the LEAPS to an expiration after the open short call                     | US-102, existing path             |
| S4  | Reject a LEAPS roll that would no longer cover the open short call            | US-102, equal/earlier cases       |
| S5  | Sell a new short call against the open LEAPS after the previous short expires | US-115 handoff, success           |
| S6  | Reject a new short call that would outlast or equal the open LEAPS            | US-115 handoff, equal/later cases |
| S7  | Roll the LEAPS while no short call is open                                    | US-102, existing path             |
| S8  | Reject a bypassed invalid PMCC roll without a partial history                 | US-102, existing path             |
| S9  | Leave a classic wheel unaffected                                              | US-102, existing path             |

## Implementation Areas

### 1. Shared calendar comparison and consumer regressions

**Files to create or modify:**

- `src/main/core/pmcc-rules.ts`, `pmcc-rules.test.ts`, `pmcc-rules.property.test.ts`.
- `src/main/core/lifecycle.test.ts`, `lifecycle.property.test.ts` if missing consumer cases require additions.
- `src/main/services/roll-pmcc-short-call-position.test.ts`, `roll-pmcc-leaps-position.test.ts`.
- `src/main/ipc/positions.test.ts` for real error-envelope routing coverage.

**Red — tests to write:**

- Comparator tests: strictly earlier succeeds; equality/later fail; one-day,
  month/year and leap-day boundaries. Invalid parsed dates cannot establish
  coverage. Preserve both exact codes/messages and existing entry behavior.
- Property **oracle/guard** in `pmcc-rules.property.test.ts`: for independently
  generated valid calendar dates, compare with independent UTC chronology;
  equality always rejects. Use constrained generators, not `fc.pre`.
- Consumer properties in `lifecycle.property.test.ts`: proposed short on/after
  current LEAPS rejects; proposed LEAPS on/before current short rejects; absent
  short skips only the coverage comparison. Compare with independent chronology,
  not the comparator under test. Preserve unrelated lifecycle guard expectations.
- Both service suites: use the live opposite leg after a preceding roll; equality
  and inversion reject with correct field/message and no row/snapshot changes.
  Successful linked rolls and no-short LEAPS roll remain valid. Preserve entry
  and classic-wheel regressions. Existing cases already passing remain regressions.
- IPC tests: field `newExpiration`, stable code/message, `ok:false`; no leaked
  exception. The service tests and E2E must prove unchanged transactional state.

**Green — implementation:**

- Refine `shortExpiresBeforeLeaps` with date-fns `isBefore(parseISO(short),
parseISO(long))` per data-model contract. Keep signature and both constant
  exports unchanged. Do not compare DTE or duplicate predicates in consumers.
- Keep existing entry/roll call sites and `recordPmccRoll` transaction. Correct
  any demonstrated integration gap at its existing boundary, preserving rule
  precedence, current-leg lookup and `handleIpcCall` envelope.
- No new types; reuse `PmccRule` and field derivations in Type Design. US-115
  consumes this exact predicate and short-side message when its engine lands.

**Refactor — cleanup to consider:**

- Preserve one comparator and one copy of each message. Do not rewrite existing
  working services or introduce a generic validation framework. Core has no logs.
- Retain INFO rejections and DEBUG input/transaction logging at service boundaries.

**Acceptance criteria covered:** invariant foundation for S1–S8; existing-path
atomicity and wheel regression S9. S5/S6 workflow integration remains with US-115.

### 2. Explicit New York review date and existing sheet behavior

**Files to create or modify:**

- `src/renderer/src/lib/dates.ts`, `dates.test.ts`.
- `src/renderer/src/components/RollPmccShortCallSheet.tsx`, `RollPmccLeapsSheet.tsx` and their tests.
- Both roll form test files for exact injected-date review assertions.

**Red — tests to write:**

- `dates.test.ts`: fixed instants whose local/UTC day differs from New York,
  year boundary and DST transition days yield the expected New York ISO day.
- Both sheet tests: default valuation date uses New York; explicit `today` still
  overrides it. Test in a non-New-York process timezone to expose current behavior.
- Form tests with `today='2026-09-14'`: replacement short 2027-02-19 displays
  158 DTE; replacement LEAPS 2028-01-21 displays 494 DTE. Keep opposite expiration
  read-only and derive coverage from dates, not the review's DTE.
- Both sheets: invalid expiration shows correct red field error, visibly disabled
  confirm, retained contract/fill/net values and no success callback. Server-side
  rejection retains the open draft. Valid corrections restore submission.

**Green — implementation:**

- Add plain `newYorkToday(now = new Date()): string` in `lib/dates.ts`, using
  `Intl.DateTimeFormat` with explicit New York timezone and `formatToParts`.
  Use as default `today` for both sheets; preserve injected dates and existing
  date-fns DTE calculations. No new named type or dependency.
- Follow the US-102 mockup's `short-roll-valid/invalid`, `leaps-roll-valid/invalid`
  and `leaps-roll-no-short` interactions while retaining shipped
  `RollPmccShortCallForm` / `RollPmccLeapsForm`: right-side sheet, opposite-leg
  context, replacement expiration, strike, fills and net preview; red blocking
  field error and dimmed confirm. Existing dialogs close on successful record;
  their existing recorded banners remain. Do not add prototype date presets or
  a Sell Short Call sheet. Its `new-short-valid/invalid` states belong to US-115.
- Reuse existing disabled `FormButton`, RHF/Zod rules and server-field mapping;
  modify presentation only where a regression test demonstrates a missing behavior.

**Refactor — cleanup to consider:**

- Keep timezone choice at the two PMCC sheet boundaries; leave wheel/entry dates
  alone. No duplicate DTE formula, inline style changes or new form abstraction.

**Acceptance criteria covered:** S1–S4, S7 review/error behavior; the shared date
contract is available to S5/S6 when US-115 implements its form.

### 3. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-expiration-safety.spec.ts` — existing-path US-102 scenarios.
- Existing PMCC entry and both roll specs remain regression coverage.
- US-115's future subsequent-short spec owns S5/S6; name and scope are handed
  off below, without creating skipped test stubs now.

**Red — tests to write:**

- S1: `Roll the short call to an expiration before the open LEAPS call` — use real
  form, assert successful replacement and earlier-expiration/DTE review.
- S2: `Reject a short-call roll that would outlast or equal the LEAPS call` —
  independently named equal/later cases, exact error, retained draft and unchanged
  original short expiration.
- S3: `Roll the LEAPS to an expiration after the open short call` — real form,
  successful replacement, later-expiration/DTE review.
- S4: `Reject a LEAPS roll that would no longer cover the open short call` —
  equal/earlier cases, exact inverse error, retained draft and unchanged long.
- S5, **US-115 integration handoff**: `Sell a new short call against the open LEAPS
after the previous short expires` — real sell-short form, live covering LEAPS,
  successful short recording and 67-DTE fixed-date review counterpart. Cannot be
  satisfied by directly seeding a leg or calling the comparator in Electron.
- S6, **US-115 integration handoff**: `Reject a new short call that would outlast
or equal the open LEAPS` — equal/later cases, exact short-side error, entered
  contract/fill retained, and no newly open short or snapshot.
- S7: `Roll the LEAPS while no short call is open` — successful roll and no
  coverage error. Use existing leg-event fixture to arrange the no-short state.
- S8: `Reject a bypassed invalid PMCC roll without a partial history` — invoke
  real short-roll IPC with invalid replacement; exact rejection, no close/open
  pair or snapshot and unchanged original legs.
- S9: `Leave a classic wheel unaffected` — record a real covered-call roll and
  assert wheel validation applies without a PMCC error.

**Green — implementation:**

- Use existing fake providers, temporary DB, PMCC fixture helpers and real form/
  IPC paths as documented in quickstart. Relative-date Electron fixtures preserve
  date ordering; injected component tests pin exact historical DTE figures.
- Match the mockup's existing roll interactions and unchanged-state feedback.
  Most business behavior already works: record already-green cases honestly;
  do not manufacture failure. Use isolated baseline checks when needed to prove
  new assertions detect the remaining changes.
- Deliver existing-path tests now. Keep S5/S6 visibly pending with US-115; do not
  add its workflow, reverse the dependency, or mark those cases passed. Full
  cross-story acceptance closes only after the real US-115 integration runs.

**Refactor — cleanup to consider:**

- Reuse helpers without changing unrelated fixtures; isolate each scenario and
  clean up Electron/temp DBs. Check every outline case and exact error message.
- Run required checks and `/update-spec us-102` after implementation, documenting
  the shared prerequisite delivered and the subsequent-short consumer still pending.

**Acceptance criteria covered:** S1–S4 and S7–S9 now; named S5/S6 handoff to US-115.
