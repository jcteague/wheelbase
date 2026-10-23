# US-102 — Green phase evidence

Requirements: [OPT-11](https://linear.app/optionswheel/issue/OPT-11).
Plan: [plan.md](./plan.md).

- Area A: 325 tests pass across comparator/lifecycle examples and properties.
  Three fixed seeds each passed 61 properties at 500 runs; temporary overrides removed.
  See [area-a-results.md](./area-a-results.md).
- Area B: `TZ=UTC pnpm test src/renderer/src/lib/dates.test.ts src/renderer/src/lib/format.test.ts`
  passes 52 tests. Output: `/private/tmp/wb-102-dates-green.log`.
  `newYorkToday` uses native Intl with an explicit New York timezone and numeric date parts.
  Existing local-date defaults stay available to other callers.

- Areas C/E: 117 targeted service and IPC tests passed. New registered-handler
  coverage uses real services and `handleIpcCall`; no production edit was needed.
- Area D: 110 sheet/form tests passed under `TZ=UTC` after changing only the
  two sheet defaults/imports to `newYorkToday`.
- Full Node 22 suite: 288 files, 4,633 tests passed, both normally and with
  coverage. All four changed production files have 100% lines and branches.
- Post-format lint and typecheck are clean. See [refactor-phase-results.md](./refactor-phase-results.md).

- Area F: all 76 targeted Electron tests passed, including the nine new safety
  cases plus existing entry, short-roll and LEAPS-roll specs.

- Full Electron verification: **479 passed across 42 suites**, with one
  pre-existing TODO, collected across the completed full run and resumed batches.
  An IV-staleness startup timeout passed its isolated 13-case retry. An existing
  scheduler assertion counted ticks from boot; it now measures the actual
  observation window, and all 13 scheduler cases passed.
- Vitest truncated parameterized scenario names. Registering those cases with
  `it(name, ...)` preserves full distinct names; the nine safety cases passed
  again. Machine-readable evidence: `/private/tmp/wb-102-e2e-named.json`.

Cold review is complete: zero blocking and zero advisory findings. The extra final
Node 22 check also passed all 4,633 tests across 288 files. Under host load it ran
with `--maxWorkers=1 --testTimeout=120000 --hookTimeout=120000`; these are runner
flags only, with no application or repository test-configuration change. Earlier
normal and coverage runs also passed all cases without those larger runner limits.
