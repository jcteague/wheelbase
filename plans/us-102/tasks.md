# US-102 — Shared PMCC expiration safety — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`.
- Within each area, work sequentially: Red → Green → Refactor.
- Areas in the same layer can run in parallel after their named dependencies reach Green. Coordinate edits to shared files and serialize repository-wide formatting and native ABI rebuilds.
- Cross-area dependencies refer to upstream Green tasks. All Refactor tasks must also finish before completion.
- Requirements remain in [Linear OPT-11](https://linear.app/optionswheel/issue/OPT-11). Scenario references S1–S9 use the index in [plan.md](./plan.md); this checklist does not replace the story.
- Read [research.md](./research.md), [data-model.md](./data-model.md), and [quickstart.md](./quickstart.md) before implementation.
- Existing roll behavior is largely implemented. Red tasks must expose remaining gaps before production edits; record already-green regression cases honestly rather than manufacturing failures.
- Every Refactor task must invoke **`source-command-refactor`**, the migrated `/refactor` command; manual cleanup or only `code-simplifier` is not a substitute. After code changes run `pnpm test`, `pnpm lint`, `pnpm typecheck`, then `pnpm format`, in that order.
- Use `pnpm rebuild:node` before unit/integration tests when switching from Electron; use `pnpm rebuild:electron` before Electron verification. Do not run both ABI-dependent suites concurrently.

## Delivery Boundary

Deliver the shared comparator/calendar refinement and regression coverage for the existing entry and roll consumers. Reuse the shipped messages, services, transaction helper, IPC channels, and sheets. No migration, new domain type, dependency, broker requirement, or subsequent-short workflow is needed.

US-102 supplies a prerequisite for [US-115 / OPT-23](https://linear.app/optionswheel/issue/OPT-23). S5/S6 remain that consumer's integration obligations: three cases across two scenario families. They do not block this prerequisite delivery and must not be marked passed or represented by skipped test stubs. Full cross-story acceptance remains open until the real US-115 workflow is verified.

---

## Layer 1 — Independent foundations

> Areas A and B can start immediately and run in parallel.

### A. Shared calendar comparator and lifecycle consumers

- [x] **A-Red [Red]** Extend `src/main/core/pmcc-rules.test.ts`, `pmcc-rules.property.test.ts`, `lifecycle.test.ts`, and `lifecycle.property.test.ts`.
  - Cover strictly earlier, equality, inversion, one-day gaps, month/year boundaries, leap days, and invalid parsed dates on either side. Invalid dates must not establish coverage.
  - Preserve `SHORT_NOT_BEFORE_LONG` (`short_not_before_long`) and `LONG_NOT_AFTER_SHORT` (`long_not_after_short`), their exact existing messages, entry field routing, and roll field `newExpiration`.
  - Comparator properties: independently generated valid calendar dates agree with an independent UTC chronological oracle; equality always rejects. Reuse constrained shared generators where suitable; do not use the comparator as its own oracle or rely on `fc.pre` filtering.
  - Lifecycle consumer properties: short replacements on/after the live LEAPS reject; LEAPS replacements on/before the live short reject; absent short skips only coverage validation. Keep unrelated lifecycle guards, entry behavior, and classic-wheel expectations covered.
  - Run `pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts`; capture the calendar-gap failure and distinguish already-green regressions.
- [x] **A-Green [Green]** Refine `src/main/core/pmcc-rules.ts` _(depends on: A-Red)_.
  - Implement `shortExpiresBeforeLeaps(shortExpiration: string, longExpiration: string): boolean` with `isBefore(parseISO(shortExpiration), parseISO(longExpiration))` from date-fns.
  - Retain the existing signature, `PmccRule`, message exports, field derivations, and entry/roll call sites. Compare expiration dates, independently of displayed DTE or valuation date.
  - Change lifecycle integration only if tests demonstrate a gap; preserve validation precedence and the no-short exception. Add no logging or I/O to core.
  - Rerun A-Red's command; all tests must pass.
- [x] **A-Refactor [Refactor]** Invoke `source-command-refactor` for the shared rule and consumer tests _(depends on: A-Green)_.
  - Keep one comparator and one copy of each message; avoid a new validation framework.
  - Stress new properties with 500 runs across several fixed seeds in a temporary setup using `endOnFailure: true`; remove seed/run overrides afterward.
  - Run the ordered code-change checks from How to Use.

### B. Explicit New York valuation date

- [x] **B-Red [Red]** Extend `src/renderer/src/lib/dates.test.ts`.
  - Test a fixed instant where the UTC/process date differs from New York, year rollover, and both DST transition days. Run in a non-New-York timezone.
  - Cover explicit `now` and the default clock with deterministic fake time, restoring timers afterward.
  - Add the shared 67-day regression to `src/renderer/src/lib/format.test.ts` using the existing `computeDteFromInput`: `2026-09-14` to `2026-11-20`. This is date arithmetic coverage, not proof of the future US-115 workflow.
  - Run `TZ=UTC pnpm test src/renderer/src/lib/dates.test.ts src/renderer/src/lib/format.test.ts`; new `newYorkToday` cases must fail before implementation.
- [x] **B-Green [Green]** Add `newYorkToday(now = new Date()): string` in `src/renderer/src/lib/dates.ts` _(depends on: B-Red)_.
  - Use native `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` and numeric year/month/day from `formatToParts` to return `YYYY-MM-DD`.
  - Keep the existing local-date and date-fns DTE helpers unchanged. Add no timezone dependency or named type.
  - Rerun B-Red's command; all tests must pass.
- [x] **B-Refactor [Refactor]** Invoke `source-command-refactor` for the date helper/tests _(depends on: B-Green)_.
  - Keep clock selection at the call boundary; avoid timestamp slicing or duplicate DTE arithmetic.
  - Run the ordered code-change checks from How to Use.

---

## Layer 2 — Existing service and renderer consumers

> Areas C and D can run in parallel after their dependencies reach Green.

### C. Roll service validation and transactional regressions

**Requires:** A-Green.

- [x] **C-Red [Red]** Extend `src/main/services/roll-pmcc-short-call-position.test.ts` and `roll-pmcc-leaps-position.test.ts` _(depends on: A-Green)_.
  - After a preceding opposite-leg roll, verify each service uses the currently open opposite expiration, not the original entry date or renderer-supplied context.
  - Exercise equality and inversion for both directions. Assert `newExpiration`, exact rule code/message, and unchanged position, open legs, roll links, history rows, and snapshots after rejection.
  - Preserve successful linked rolls, LEAPS roll without an open short, entry regressions, and classic-wheel behavior. With no short, unrelated validation must still apply.
  - Run `pnpm test src/main/services/roll-pmcc-short-call-position.test.ts src/main/services/roll-pmcc-leaps-position.test.ts`; document any genuine failure and already-green cases separately.
- [x] **C-Green [Green]** Correct only demonstrated integration gaps in the existing roll services or `src/main/services/pmcc-roll-record.ts` _(depends on: C-Red)_.
  - Retain `loadPmccRollContext`/`getPosition(...).pmccOpenLegs` as the live pair source and pure engine validation before `recordPmccRoll` writes.
  - Keep linked close/open legs and snapshot atomic; preserve rule precedence and service-boundary INFO rejections plus DEBUG inputs/transaction checkpoints.
  - No production edit is needed for cases already covered correctly. Rerun C-Red's command; all tests must pass.
- [x] **C-Refactor [Refactor]** Invoke `source-command-refactor` for the service changes/tests _(depends on: C-Green)_.
  - Reuse existing transaction helpers and fixtures; avoid rewriting working services or moving business logic into IPC.
  - Run the ordered code-change checks from How to Use.

### D. Roll sheets, review dates, and retained drafts

**Requires:** A-Green and B-Green.

- [x] **D-Red [Red]** Extend `RollPmccShortCallSheet.test.tsx`, `RollPmccLeapsSheet.test.tsx`, `RollPmccShortCallForm.test.tsx`, and `RollPmccLeapsForm.test.tsx` under `src/renderer/src/components/` _(depends on: A-Green, B-Green)_.
  - With a fixed instant and non-New-York process timezone, verify both sheets default to the New York day and still honor an explicit `today` override. Include the default fill date because both forms share that date.
  - Inject `today='2026-09-14'`: short replacement `2027-02-19` reviews as 158 DTE; LEAPS replacement `2028-01-21` reviews as 494 DTE. Opposite expiration remains read-only; coverage uses dates rather than displayed DTE.
  - For both roll directions, cover equality/inversion, exact red field error, visibly disabled confirm, retained contract/fills/net preview, and no success callback. Server rejection preserves the open draft; a valid correction permits submission.
  - Preserve no-short LEAPS behavior and successful close/recorded feedback.
  - Run `TZ=UTC pnpm test src/renderer/src/components/RollPmccShortCallSheet.test.tsx src/renderer/src/components/RollPmccLeapsSheet.test.tsx src/renderer/src/components/RollPmccShortCallForm.test.tsx src/renderer/src/components/RollPmccLeapsForm.test.tsx`; capture the default-timezone failure and retain already-green UI regressions.
- [x] **D-Green [Green]** Update both roll sheets' default `today` to `newYorkToday()` _(depends on: D-Red)_.
  - Preserve explicit date injection, RHF/Zod validation, server-field mapping, date-fns DTE computations, and existing forms/hooks.
  - Follow existing-roll states in [the mockup](../../mockups/us-102-enforce-long-dte-greater-than-short-dte.mdx). Change form presentation only for a demonstrated gap; reuse `FormButton`'s shipped disabled treatment and `wb-*` Tailwind tokens.
  - Keep existing entry/wheel date defaults, close/success behavior, and financial context. Do not add prototype controls or a Sell Short Call sheet.
  - Rerun D-Red's command; all tests must pass.
- [x] **D-Refactor [Refactor]** Invoke `source-command-refactor` for both roll-sheet changes and tests _(depends on: D-Green)_.
  - Keep the timezone choice at these two boundaries without adding a form abstraction or duplicate date calculation.
  - Run the ordered code-change checks from How to Use, including existing entry and roll schemas/forms in the full suite.

---

## Layer 3 — IPC rejection contract

### E. Real roll error-envelope routing

**Requires:** C-Green.

- [x] **E-Red [Red]** Extend `src/main/ipc/positions.test.ts` _(depends on: C-Green)_.
  - Exercise both roll handlers' actual error routing: `ok: false`, field `newExpiration`, stable short/inverse codes and exact messages, and no thrown exception reaching the renderer.
  - Retain valid-result regressions. Service tests in C and E2E in F establish persisted-state atomicity rather than inferring it from an error envelope.
  - Run `pnpm test src/main/ipc/positions.test.ts`; record already-green behavior and reproduce any uncovered routing defect before changing production code.
- [x] **E-Green [Green]** Fix only demonstrated routing gaps in `src/main/ipc/positions.ts` or the existing service boundary _(depends on: E-Red)_.
  - Keep handlers as Zod parse plus one service call through `handleIpcCall`; no new channel, envelope constructor, or handler business logic.
  - Rerun E-Red's command; all tests must pass. Leave working handlers unchanged when coverage is already green.
- [x] **E-Refactor [Refactor]** Invoke `source-command-refactor` for IPC routing/tests _(depends on: E-Green)_.
  - Reuse existing handler fixtures and error helpers.
  - Run the ordered code-change checks from How to Use.

---

## Layer 4 — Electron acceptance verification

### F. Existing-workflow E2E coverage

**Requires:** A-Green, B-Green, C-Green, D-Green, and E-Green.

- [x] **F-Red [Red]** Add `e2e/pmcc-expiration-safety.spec.ts` _(depends on: all preceding Green tasks)_.
  - Read the current scenarios in Linear. Mirror their scenario language in test names, expanding outlines into independently identifiable cases. Use the plan's S-reference index below to audit coverage without copying acceptance criteria into this document.
  - Reuse fake providers, temporary SQLite DBs, PMCC fixtures, and real forms/IPC. Relative dates preserve expiration ordering and offsets; D's injected component tests establish exact historical DTE review figures.
  - Assert retained inputs, disabled confirm, absence of success feedback, and unchanged original pair/history/snapshots for invalid rolls. Direct IPC bypass must reach real validation, not a mocked success/error result.
  - Use the existing leg-event fixture only to arrange the no-short state. The wheel case must perform a real covered-call roll.
  - Run `pnpm rebuild:electron`, then `TZ=America/New_York pnpm test:e2e e2e/pmcc-expiration-safety.spec.ts`. Record genuine failures and already-green scenarios honestly; do not require failures from behavior already delivered. Where needed, use an isolated baseline check to prove new assertions detect the remaining change.
- [x] **F-Green [Green]** Make the new safety suite and existing PMCC regressions pass _(depends on: F-Red)_.
  - Fix only demonstrated gaps at their existing boundaries. Do not add a production clock API, use expired fixed fixtures, or substitute test-only leg creation for a user workflow.
  - Run `TZ=America/New_York pnpm test:e2e e2e/pmcc-expiration-safety.spec.ts e2e/pmcc-short-call-roll.spec.ts e2e/pmcc-leaps-roll.spec.ts e2e/open-pmcc-position.spec.ts`.
  - Verify nine executable cases across S1–S4 and S7–S9. Report S5/S6 separately as the pending US-115 integration handoff.
- [x] **F-Refactor [Refactor]** Invoke `source-command-refactor` for the E2E spec/fixtures _(depends on: F-Green)_.
  - Keep scenarios isolated, reuse helpers, and clean up Electron processes and temporary databases. Do not add skipped US-115 placeholders.
  - Rerun changed E2E coverage, then `pnpm rebuild:node` and the ordered code-change checks from How to Use.

### Scenario-to-test index

This is a coverage index into the plan and Linear, not a local acceptance-criteria copy. The destination for every executable row is `e2e/pmcc-expiration-safety.spec.ts`; exact fixed-date review assertions also live in D's component tests.

| Plan reference | Test focus                              | Cases | Delivery owner                          |
| -------------- | --------------------------------------- | ----- | --------------------------------------- |
| S1             | Valid short roll                        | 1     | US-102 / F                              |
| S2             | Short-roll equality and inversion       | 2     | US-102 / F                              |
| S3             | Valid LEAPS roll                        | 1     | US-102 / F                              |
| S4             | LEAPS-roll equality and inversion       | 2     | US-102 / F                              |
| S5             | Subsequent-short success                | 1     | US-115 future subsequent-short E2E spec |
| S6             | Subsequent-short equality and inversion | 2     | US-115 future subsequent-short E2E spec |
| S7             | LEAPS-only roll                         | 1     | US-102 / F                              |
| S8             | IPC bypass and atomic rejection         | 1     | US-102 / F                              |
| S9             | Classic-wheel regression                | 1     | US-102 / F                              |

## Completion Checklist

- [x] All six Red tasks have evidence: remaining gaps fail for the expected reason; pre-existing passing cases are explicitly recorded as regressions.
- [x] All six Green tasks pass, and all six Refactor tasks invoked `source-command-refactor`.
- [x] Core comparator and lifecycle consumer properties use independent chronological expectations and have been stressed; temporary overrides are removed.
- [x] All nine executable E2E cases pass, with exact-date review assertions and non-New-York clock tests passing in component/unit coverage.
- [x] S5/S6 are explicitly handed off to US-115, including live-LEAPS comparison, the shared short-side error, retained draft, no writes on rejection, and real form/service/IPC verification. Neither the three cases nor full cross-story acceptance is marked verified.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, then `pnpm format` complete cleanly with the appropriate Node ABI.
- [x] Service INFO rejection and DEBUG input/transaction logs remain adequate; pure core remains free of logging.
- [x] After implementation completes, run `/update-spec us-102`, documenting the delivered prerequisite and pending US-115 consumer integration. Do not change Linear acceptance criteria or status as part of generating this checklist.

**Task totals:** 18 implementation tasks — 6 Red, 6 Green, 6 Refactor — across four layers. Completion checks and the US-115 handoff are tracked separately.

**Status:** Shared-prerequisite implementation complete. The S5/S6 integration handoff remains with US-115.
