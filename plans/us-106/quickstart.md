# US-106 — Implementation verification

This plan adds no code yet. Commands and test files below are the verification
targets for implementation. Run from the repository root.

## Setup

Use installed dependencies. No migration, credentials or network-backed provider
is required for these tests. Use temporary migrated SQLite databases and the
existing fake market-data provider. Never use the user's journal database.

## Focused Red / Green checks

Switch the SQLite native module to Node before Vitest unit/integration tests:

```bash
pnpm rebuild:node
TZ=America/New_York pnpm exec vitest run src/main/core/alerts.test.ts src/main/core/alerts.property.test.ts src/main/services/evaluate-alerts.test.ts src/main/services/evaluate-alerts-pmcc.test.ts src/renderer/src/components/ManagementQueueRow.test.tsx
```

Write the focused tests before their implementation and record the expected Red
failure. Then implement and rerun that area. `alerts.property.test.ts` and
`evaluate-alerts-pmcc.test.ts` are planned new files. Check the new properties with
500 runs over several fixed seeds using a temporary setup file, then remove that
setup; leave normal tests unseeded. Properties compare against multiplication-based
threshold and monotonicity oracles, not another call to the same predicate.

Service fixtures use `now = 2026-09-28T16:00:00.000Z`, the short expiry 2026-10-16
and LEAPS expiry 2027-09-17. The co-fire fixture advances `now` to
2026-10-12T16:00:00.000Z`. Explicit New York TZ preserves the issue's calendar basis.
Use `makePmccLeg`, `insertLegRow`, `stubProvider`, `stubEarnings` and an injected
spy logger. Include the real PMCC roll service in the replacement-leg test.

## Required implementation checks, in order

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Review service logging: generic INFO evaluation counts and DEBUG rule skips remain;
PMCC selection exceptions carry a position id. No logging enters the pure engine.

## Electron acceptance checks

```bash
pnpm rebuild:electron
TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts
```

The new spec must clear inherited `VITEST` from its Electron launch environment so
pino emits DEBUG lines; collect the child process stdout from before evaluation.
`MAIN_VITE_LOG_LEVEL=debug` is needed at build time for the missing-quote reason check.

Use `buildLaunchEnv` / `launchElectron`, `NODE_ENV=test`, and a closed fake market
session to keep automatic interval runs from racing explicit scheduler runs.
`runAlertEvaluation` drives the real registered job. Program
`WHEELBASE_MOCK_STOCK_QUOTES` and `WHEELBASE_MOCK_OPTION_SNAPSHOTS`; change quote
JSON through `app.evaluate` for retreat/missing-quote cases. The provider reads it
per request. Do not hand-insert alert rows to make the feature appear to work.

Seed an XYZ PMCC through `window.api.createPmccPosition`: one $80 LEAPS bought for
$25, one $110 short sold for $2, zero fees. Use run-day-relative dates preserving
the issue's 18-DTE baseline and distant LEAPS. For the 4-DTE test, seed that short
expiration directly; if modifying a fixture, update only the short's id, never
all position legs. Exact fixed dates are covered in service tests; the alert job
does not consume the existing IVR fake clock.

For the roll case, call the existing `window.api.rollPmccShortCall` with replacement
$115, expiration 35 days after the old short expiry, valid positive fill amounts
and a fill date on/after the current short fill. For no-short setup, use the
existing `testPmccRecordLegEvent` channel with `SHORT_CALL_EXPIRED` after first
opening the alert. This story does not implement the expiration recording UI.

Read stored alert states with `readAlertRows`, identify the rule by `rule_code`,
and correlate queue rows by alert id from `alerts.list` or by their unique summary.
There may also be a MANAGEMENT_WINDOW row for XYZ at 18 DTE. A resolved assignment
alert does not imply that all XYZ rows disappear. Refresh the dashboard queries
after explicit evaluation and use locator assertions, not fixed sleeps.

Passing means all nine scenario families in the plan pass (15 independently named
cases after expanding the outlines), including exact summaries, queue navigation,
stored resolution and the missing-quote DEBUG skip reason. Also rerun existing
management-queue, expiration-imminent and dismissal specs:

```bash
TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e e2e/management-queue.spec.ts e2e/expiration-imminent-alert.spec.ts e2e/dismiss-alert.spec.ts
```

Return to Node ABI before running unit tests again:

```bash
pnpm rebuild:node
```

After implementation is complete, run `/update-spec us-106`. Planning alone must
not publish proposed behavior as shipped spec content.
