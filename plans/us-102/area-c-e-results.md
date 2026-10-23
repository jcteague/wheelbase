# Areas C and E — Service and IPC Red/Green results

Requirements authority: [OPT-11 / US-102](https://linear.app/optionswheel/issue/OPT-11).
Scope: C-Red, C-Green, E-Red and E-Green from [tasks.md](./tasks.md), following
[Area A](./area-a-results.md). Refactor and full verification remain with the
coordinating implementation agent.

## Changes and interfaces tested

- `src/main/services/roll-pmcc-short-call-position.test.ts`: after a real
  `rollPmccLeapsPosition` call replaces day-368 LEAPS with day-494 LEAPS, reject
  replacement short expirations on day 494 and day 520. Verify exact
  `newExpiration` / `short_not_before_long` / `Short call must expire before the LEAPS call.`
  errors. A day-400 short succeeds against the replacement LEAPS, proving the
  service does not retain the original LEAPS expiration as its coverage boundary.
- `src/main/services/roll-pmcc-leaps-position.test.ts`: after a real
  `rollPmccShortCallPosition` call replaces day-95 short with day-130 short, reject
  replacement LEAPS expirations on day 130 and day 110. Verify exact
  `newExpiration` / `long_not_after_short` / `LEAPS call must expire after the short call.`
  errors. Day 110 is after the old short expiration, so this catches stale lookup.
- Every new service rejection compares the complete raw position row, every leg
  row (including roll links and history), every snapshot row, and inferred open
  legs before and after rejection. The successful short roll also verifies its
  linked pair and resulting live long/short identities and expirations.
- `src/main/ipc/positions-pmcc-expiration.test.ts`: register the actual
  `positions:roll-pmcc-short` and `positions:roll-pmcc-leaps` handlers against
  in-memory SQLite. Both equality and inversion resolve to the exact established
  `{ ok: false, errors: [{ field, code, message }] }` envelope through real services
  and `handleIpcCall`. Only Electron registration is mocked; errors are not
  injected or fabricated. No exception reaches the renderer-facing promise.

The separate IPC test file avoids the globally mocked services in
`src/main/ipc/positions.test.ts`. That existing suite remains unchanged and is
rerun to preserve its valid-result and routing regressions. Existing service
tests retain linked-roll atomicity, no-short LEAPS success, no-short unrelated
validation, and classic-wheel rejection by the PMCC service boundary.

## Red and Green evidence

All nine new cases passed immediately against the existing roll services and
handlers after Area A. No service or routing defect was found; no failures were
manufactured, and no production edit was required. This is regression coverage
for shipped behavior, as the plan explicitly anticipates.

Initial and post-format verification used:

```sh
pnpm test src/main/services/roll-pmcc-short-call-position.test.ts src/main/services/roll-pmcc-leaps-position.test.ts src/main/ipc/positions.test.ts src/main/ipc/positions-pmcc-expiration.test.ts
```

Both runs passed **117 tests in four files**:

```text
PASS src/main/ipc/positions.test.ts (55 tests)
PASS src/main/ipc/positions-pmcc-expiration.test.ts (4 tests)
PASS src/main/services/roll-pmcc-short-call-position.test.ts (27 tests)
PASS src/main/services/roll-pmcc-leaps-position.test.ts (31 tests)
Test Files 4 passed (4)
Tests 117 passed (117)
```

Captured post-format output: `/private/tmp/wb-us102-area-ce-green.log`.
The three changed test files were formatted with `pnpm exec prettier --write`.
The coordinating agent owns the full ordered test/lint/typecheck/format checks.

## Handoff

Public service signatures, transaction helpers, validation order, logging and
IPC channels/envelopes are unchanged. No property file is added here: these are
boundary orchestration/SQLite regressions; Area A owns pure-engine properties.
The subsequent-short workflow remains the named US-115 handoff. These tests do
not establish acceptance for that absent workflow.
