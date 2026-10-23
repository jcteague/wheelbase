# Area F — Existing-workflow Electron coverage

Requirements authority: [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
Implementation scope: F-Red/F-Green from [tasks.md](./tasks.md).

## Authored coverage

`e2e/pmcc-expiration-safety.spec.ts` adds nine independently named cases across
S1–S4 and S7–S9. It reuses existing Electron launch/cleanup, XYZ PMCC entry,
sheet/roll helpers, temporary databases and the no-short event fixture. Scenario
names mirror Linear; outline equality and inversion rows are separate cases.

The original entry pair remains the background: $80 LEAPS at +368 days and $110
short at +32 days. Successful replacement expirations are +158 and +494 days.
Both open-short roll fills explicitly use today, rather than existing helpers'
later-cycle defaults. The no-short fixture expires the original short at +32
days and rolls the LEAPS at +33 days. Run with `TZ=America/New_York` so the shared
relative-date helpers and production New York review clock use the same day.

`e2e/pmcc-expiration-safety-helpers.ts` holds repeated draft and rejection
assertions; it keeps both new files under the skill's approximate 200-line limit.
It delegates form input and real IPC to existing `pmcc-roll-helpers.ts` functions.
No existing helper or production file was edited.

Rejection coverage verifies exact red field errors, disabled/dimmed confirm,
retained expiration/strike/contracts/fill/cash values and net debit/credit,
visible sheet, no recorded banner and exact real IPC error envelopes. Entire
`getPosition` results are equal before/after, including persisted position,
all original/open legs, roll history, every snapshot and ledger values.

Success cases submit the real forms, verify recorded replacement expirations,
the unchanged opposite leg, two added legs and one snapshot. The wheel
regression completes a real covered-call roll through its form and checks
persisted classic-wheel state without PMCC errors.

## Verification

Prettier formatting, targeted ESLint and diff whitespace checks passed.
After the full Node suite and explicit Electron ABI switch, the coordinating
agent ran all four suites below: **76 tests passed across four files**, including
all nine new safety cases. Output: `/private/tmp/wb-102-e2e-targeted.log`.

Executed regression command:

```sh
TZ=America/New_York pnpm test:e2e e2e/pmcc-expiration-safety.spec.ts e2e/pmcc-short-call-roll.spec.ts e2e/pmcc-leaps-roll.spec.ts e2e/open-pmcc-position.spec.ts
```

These regressions exercise shipped behavior and were green on their first run;
no Red failure was manufactured.

Final Electron verification covers all **42 suites: 479 passed, one pre-existing
TODO**. The first run completed ten suites before an unrelated IV-staleness
startup timeout; that suite passed all 13 cases on retry. A resumed batch exposed
an existing scheduler test's boot-time counting assumption; measuring its actual
observation window fixed the test, and all 13 scheduler cases passed. The remaining
24 suites passed (177 cases plus the pre-existing TODO).

Vitest's `$name` table interpolation truncated scenario names in JSON. Each table
row now calls `it(name, ...)` directly, retaining the full exact name. The nine
safety cases passed again after this naming-only correction:

```sh
pnpm exec vitest run --config vitest.e2e.config.ts e2e/pmcc-expiration-safety.spec.ts --reporter=json --reporter=verbose --outputFile.json=/private/tmp/wb-102-e2e-named.json
```

Evidence: `/private/tmp/wb-102-e2e-full.log`,
`/private/tmp/wb-102-e2e-staleness-retry.log`,
`/private/tmp/wb-102-e2e-remainder.log`,
`/private/tmp/wb-102-e2e-scheduler.json`,
`/private/tmp/wb-102-e2e-final.json`, and
`/private/tmp/wb-102-e2e-named.json`.

## US-115 handoff

S5/S6 remain three future subsequent-short workflow cases owned by US-115.
No skipped placeholders or test-only short-opening substitutes were added.
Shared comparator verification does not establish that future integration.
