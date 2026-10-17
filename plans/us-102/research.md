# US-102 — Research and scope decision

Status: Research complete for the shared-validation prerequisite. Rechecked against
`main` at `c3fc14a` (`Merge branch 'wb-105'`). Planning only; tests have not been rerun.

Requirements authority: [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11/us-102-enforce-long-dte-short-dte-on-pmcc-rolls-and-subsequent-short).

## Dependency direction and delivery boundary

- **Decision:** US-102 supplies the shared invariant that US-115 consumes.
  US-115 is not a prerequisite for US-102. Finish shared validation and regression
  coverage of entry and both existing rolls; record the subsequent-short
  integration scenarios as a named US-115 acceptance handoff.
- **Rationale:** This follows Linear's explicit dependency direction and its
  statement that boundary stories consume the comparator as they land. US-104
  and merged US-105 already implemented the comparator and both messages. US-115
  must reuse them when adding its service and form. The earlier clarification
  gate incorrectly reversed this dependency and is removed.
- **Alternatives considered:** Absorbing US-115's workflow would duplicate its
  scope and dependencies. Waiting for it would create an artificial cycle.
  Pure comparator tests establish the prerequisite but do not substitute for
  future real-workflow E2E coverage; the plan records that distinction. The
  Linear story remains unchanged, and full cross-story acceptance is not claimed.

## Existing comparator and callers

- **Decision:** Reuse `shortExpiresBeforeLeaps` and `SHORT_NOT_BEFORE_LONG` in
  `src/main/core/pmcc-rules.ts`; do not re-extract functionality already shipped.
- **Rationale:** `pmccCrossLegIssues` shares the comparison between entry engine
  and entry renderer validation; `pmccShortRollIssues` shares it between the
  short-roll engine and renderer schema. Equality already fails. The message is
  already `Short call must expire before the LEAPS call.` with stable code
  `short_not_before_long`.
- **Alternatives considered:** Another comparator, inline validation in each
  service or duplicated error text would recreate the drift this story prevents.
  The existing comparator uses lexical ordering of canonical ISO date strings,
  which orders valid calendar dates correctly. US-102 and repository guidance
  favor `date-fns` calendar comparison; any implementation refinement should
  preserve valid-date behavior and entry messages, and test equality, inversion,
  month/year transitions and leap days against an independent oracle.

## Existing short-roll safety and UI

- **Decision:** Treat short-roll behavior as existing functionality to verify and
  extend only where a specific gap is demonstrated.
- **Rationale:** `rollPmccShortCallPosition` reads the current open pair via
  `getPosition`, calls the pure engine before constructing/inserting the roll
  pair, then writes both legs and the snapshot in one transaction. Existing
  service tests cover equal-expiration rejection without writes; existing E2E
  covers client rejection and direct IPC bypass. INFO rejection and DEBUG
  input/transaction logs already exist. The handler uses the established parsed
  handler path and `handleIpcCall` envelope.
- **Alternatives considered:** No new IPC channel, persistence format or wheel
  validation change is needed merely to enforce the existing short-side rule.

`RollPmccShortCallSheet` and `RollPmccShortCallForm` already provide:

- A right-side portal sheet, current short and read-only LEAPS context.
- RHF/Zod validation shared with the engine; replacement date field error.
- Retained form values and mapped server errors on rejection.
- A disabled confirm action, existing close/overlay/Escape behavior and a
  successful-roll callback only on success.
- Replacement DTE, coverage ruler and net debit/credit preview.

`FormButton` already adds `cursor-not-allowed` and `opacity-40` when disabled;
the issue and mockup comments claiming otherwise predate US-104.

## Merged LEAPS-roll implementation and remaining consumer

- **Decision:** Reuse the implemented inverse message identity
  `LONG_NOT_AFTER_SHORT` / `long_not_after_short` / `LEAPS call must expire after
the short call.`. The LEAPS-roll rules already reuse the same comparison with the
  proposed LEAPS as long and the current short as short; a genuinely absent
  short means there is no coverage comparison to perform.
- **Rationale:** `pmccLeapsRollIssues` calls `leapsShapeIssues` only when
  `openShort !== null`. It checks replacement coverage through
  `shortExpiresBeforeLeaps(openShort.expiration, newExpiration)` and reports the
  inverse message on `newExpiration`. `rollPmccLeapsPosition` obtains the live
  pair through `loadPmccRollContext`, invokes `rollPmccLeaps` before writes, and
  persists via shared `recordPmccRoll`. The sheet and renderer schema are present.
  `e2e/pmcc-leaps-roll.spec.ts` includes equality/inversion rejections, direct
  bypass checks, no-short success and wheel regression. These are source/test
  findings, not a claim that the suites were rerun during planning. US-115's
  Linear issue explicitly consumes US-102's comparator/message and additionally
  depends on a LEAPS-only lifecycle state and prior-short retirement information.
- **Alternatives considered:** Rebuilding the LEAPS-roll path or adding another
  inverse comparator would duplicate merged code. Only subsequent-short-call
  production integration remains absent; test-only leg insertion cannot replace
  its real record workflow. Leave US-105's implementation and planning artifacts
  unchanged.

## Calendar and valuation-date handling

- **Decision:** Separate invariant validation from displayed DTE. The invariant
  compares the resulting pair's expiration dates and needs no valuation clock.
  A full plan must explicitly address the story's New York valuation date for
  review figures without changing unrelated wheel date behavior.
- **Rationale:** `RollPmccShortCallSheet` currently defaults `today` through
  renderer `localToday()`. The form computes DTE using
  `computeDteFromInput(date, parseISO(today))`; that is consistent for an injected
  date, but the production default follows the computer's timezone. Existing
  date schemas validate shape with a regex rather than calendar validity.
- **Alternatives considered:** Cached DTE comparison, timestamp slicing and a
  global change to all wheel date semantics are unnecessary. Distinguish any
  required PMCC date-validation refinement from entry behavior that US-101 owns.

## Mockup findings

- **Decision:** Use `mockups/us-102-enforce-long-dte-greater-than-short-dte.mdx`
  for the safety interaction requirements; retain the shipped roll sheets'
  fuller financial context rather than replacing it with the prototype.
- **Rationale:** It depicts Roll Short Call, Roll LEAPS Call and Sell Short Call
  right-hand sheets. Each shows opposite-leg expiration/DTE read-only, proposed
  expiration/DTE and strike, a field-local red blocking error, dimmed confirm,
  retained draft and unchanged-history explanation. No-short LEAPS roll skips
  the comparison. Success closes the sheet and shows a green recorded state.
- **Alternatives considered:** Preset date buttons and the short-open/expired
  toggle are prototype controls, not production features. Entry remains owned
  by US-101. The subsequent-short sheet belongs to US-115.

## Evidence checked

- Linear OPT-11 and OPT-23, including their dependency descriptions.
- Spec orientation: `docs/spec/features/us-104-roll-pmcc-short-call.md`,
  `docs/spec/domain/wheel-lifecycle.md`, `docs/spec/contracts/zod-schemas.md`.
- `src/main/core/pmcc-rules.ts` and its example/property tests.
- `src/main/services/roll-pmcc-short-call-position.ts` and tests.
- `src/main/ipc/positions.ts`, `src/main/ipc/utils.ts`, `src/main/schemas.ts`.
- `src/renderer/src/schemas/roll-pmcc-short-call.ts`, entry schema and shared schemas.
- Short-roll sheet, form, fields, hook, coverage ruler and existing tests.
- `src/renderer/src/lib/dates.ts`, `src/main/core/dte.ts`, and `FormButton.tsx`.
- `e2e/pmcc-short-call-roll.spec.ts`.
- Merged US-105 source: `src/main/core/pmcc-rules.ts`,
  `src/main/services/roll-pmcc-leaps-position.ts`,
  `src/main/services/pmcc-roll-record.ts`, LEAPS-roll renderer components,
  `e2e/pmcc-leaps-roll.spec.ts`, and
  `docs/spec/features/us-105-roll-pmcc-leaps.md`.
- A research agent independently traced comparator reuse, UI and transactional
  rejection before the US-105 merge. Its LEAPS-roll absence finding is superseded
  by the subsequent main-branch inspection; subsequent-short-call absence remains.

## Remaining implementation choices

- **Decision:** Keep the comparator signature and both message exports stable.
  Use `isBefore(parseISO(shortExpiration), parseISO(longExpiration))` for the
  shared calendar comparison; preserve canonical valid-date behavior and reject
  unparseable dates rather than accepting them lexically. Add independent
  boundary/property coverage and preserve existing caller contracts.
- **Rationale:** Existing valid-date behavior is already correct; this is a small
  standards-alignment and regression task, not a replacement lifecycle engine.
- **Alternatives considered:** No new validation framework, schema migration,
  workflow, configurable threshold or error vocabulary.

- **Decision:** Add a small renderer `newYorkToday(now = new Date())` date helper
  using `Intl.DateTimeFormat(..., { timeZone: 'America/New_York' }).formatToParts`.
  Use it only as the default `today` for the two PMCC roll sheets. Existing
  date-fns DTE calculations consume that calendar date; explicit test injection
  remains supported. Existing wheel and entry defaults remain unchanged.
- **Rationale:** This satisfies the review's explicit New York valuation basis
  without adding a timezone library or changing the invariant to compare DTE.
- **Alternatives considered:** Changing all app clocks or adding a production
  clock-control IPC API is outside the scope. Document that this also makes the
  two roll forms' default fill date use New York, since they share `today`.
