# Area A — Calendar comparison Red/Green results

Requirements authority: [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
Scope: A-Red and A-Green from [tasks.md](./tasks.md). Refactor and full verification
remain with the coordinating implementation agent.

## Changes

- `src/main/core/pmcc-rules.ts`: replace lexical ordering with
  `isBefore(parseISO(shortExpiration), parseISO(longExpiration))`. The public
  signature, callers, codes, messages, rule order and entry behavior are unchanged.
  Invalid parsed calendar dates cannot establish coverage. The engine remains pure.
- `src/main/core/pmcc-rules.test.ts`: five strict calendar boundary cases,
  including leap day, and five invalid-calendar cases.
- `src/main/core/pmcc-rules.property.test.ts`: explicit equality guard and an
  independent UTC chronology oracle for entry validation instead of calling the
  comparator under test to derive the expected result.
- `src/main/core/lifecycle.property.test.ts`: independent UTC chronology checks
  for both roll consumers, asserting exact field/code/message on rejection;
  no-short LEAPS rolls still reject a replacement on/before its fill date.
- `lifecycle.test.ts` needed no edit: existing examples already cover equality,
  inversion, exact messages, rule precedence, no-short success and unrelated guards.

## Red evidence

Command:

```sh
pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts
```

Before the implementation change: **5 failed, 320 passed**, across four files.
All failures were the new invalid-calendar comparator cases returning `true`
instead of `false` for non-leap February 29, April 31, month 13, empty date and
unparseable date. Existing valid-date behavior and new chronology regressions
already passed; failures were not manufactured for shipped behavior.
Full captured output: `/private/tmp/wb-us102-area-a-red.log`.

## Green evidence

The same targeted command passed **325 tests in four files** after the minimum
comparator change. Captured output: `/private/tmp/wb-us102-area-a-green.log`.

Property stress used a temporary Vitest config/setup that called
`fc.configureGlobal({ numRuns: 500, seed, endOnFailure: true })`. The setup was
attached to projects without changing tracked configuration. Seeds **102, 103,
104** each passed **61 properties in two suites**:

```sh
US102_FC_SEED=102 pnpm exec vitest run --config /private/tmp/wb-us102-property-stress.config.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.property.test.ts
US102_FC_SEED=103 pnpm exec vitest run --config /private/tmp/wb-us102-property-stress.config.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.property.test.ts
US102_FC_SEED=104 pnpm exec vitest run --config /private/tmp/wb-us102-property-stress.config.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.property.test.ts
```

The temporary config/setup were removed. Stress output remains in
`/private/tmp/wb-us102-area-a-stress-{102,103,104}.log`. No seed or run-count
override remains in tracked tests.

`pnpm exec prettier --check` passed for the four changed source/test files.
The coordinating agent owns the full test/lint/typecheck/format checklist.

## Service and IPC investigation

No service or IPC files were edited in Area A. Existing service regressions
assert equal-date rejection and unchanged leg/snapshot counts. LEAPS tests seed
a prior short roll, so they already use a replacement short in the common fixture.
Recommended Area C additions:

- Short-roll suite: precede the short roll with a real LEAPS roll; validate
  equality and inversion against that replacement LEAPS, including exact message
  and complete before/after DB snapshots rather than counts alone. Add a short
  expiration after original LEAPS but before replacement LEAPS to catch stale lookup.
- LEAPS-roll suite: precede it with a real short-roll service call; reject equal
  and earlier expiration against the replacement short, retaining the full DB
  state. Add an expiration after the original short but before the replacement
  short to catch stale lookup.
- Both IPC mock-service tests already cover `newExpiration` and exact error
  envelopes, but these do not establish real engine-to-envelope routing. Add a
  real service-backed handler case (or the matching Electron bypass check).

Subsequent-short integration remains the named US-115 handoff; no acceptance
claim is made for that unimplemented workflow.
