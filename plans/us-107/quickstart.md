# US-107 — Implementation verification

Planning only; nothing below exists yet. Prerequisite: **US-106 merged to `main`**, then
branch `wb-107` from it.

## Setup

No migration, credentials or network. Temporary SQLite databases and the fake market-data
provider only; never the user's journal DB.

## Focused Red / Green checks (Vitest, Node ABI)

```bash
pnpm rebuild:node
TZ=America/New_York pnpm exec vitest run \
  src/main/core/alerts.test.ts \
  src/main/core/alerts.property.test.ts \
  src/main/services/evaluate-alerts.test.ts \
  src/main/services/evaluate-alerts-pmcc.test.ts \
  src/main/services/alerts.test.ts \
  src/main/ipc/alerts.test.ts \
  src/renderer/src/components/ManagementQueueRow.test.tsx
```

Service fixtures (issue calendar): LEAPS `$80.0000` exp `2027-09-17` bought `25.0000`,
short `$112.0000` exp `2027-08-20` sold `2.1000`, 1 contract. `now` values at 16:00Z on
2027-07-09, -07-18, -07-19, -07-20, -08-18, -08-19, -09-15. Use US-106's
`evaluate-alerts-pmcc.test.ts` helpers plus `makePmccLeg`/`insertLegRow`,
`stubProvider`, `stubEarnings` and a spy logger; the LEAPS roll uses the real
`rollPmccLeapsPosition` service.

Property stress (then remove the setup file; leave normal runs unseeded):

```ts
// scratch vitest setup, not committed
fc.configureGlobal({ numRuns: 500, seed: <n>, endOnFailure: true })
```

Run across ~5 seeds for the new `PMCC_LEAPS_ROLL_WINDOW` properties.

## Post-change gates, in order

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Logging review: no new log calls are expected. The service's generic
`alert_rule_skipped` (DEBUG) must carry `ruleCode: 'PMCC_LEAPS_ROLL_WINDOW'`,
`reason: 'missing_leaps_dte'` for S7; nothing is logged from `src/main/core/`.

## Electron acceptance (Electron ABI)

```bash
pnpm rebuild:electron
TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-leaps-roll-window-alert.spec.ts
```

- Launch with `buildLaunchEnv` / `launchElectron`, `NODE_ENV=test`, inherited `VITEST`
  cleared (so pino emits DEBUG), and a closed fake market session so the interval job
  doesn't race `runAlertEvaluation`.
- Seed XYZ with `window.api.createPmccPosition`: LEAPS $80 @ 25.00, short $112 @ 2.10,
  1 contract, 0 fees, at run-day-relative expirations chosen per scenario (e.g. LEAPS
  `localDate(59)`, short `localDate(31)`). The alert job uses the real clock; exact
  calendar dates are covered by the service tests.
- Short expired (S4): `testPmccRecordLegEvent` with `SHORT_CALL_EXPIRED`.
- LEAPS roll (S5): `window.api.rollPmccLeaps` to $85 at `localDate(185)`.
- Unreadable expiration (S7): new `setLegExpiration(dbPath, leapsLegId, 'unreadable')`.
  Never `setActiveLegExpiration`, which rewrites every leg.
- Read stored alerts with `readAlertRows`; read the queue with `listManagementQueueItems`
  and the `[data-testid="management-queue-row"]` locator; correlate rows by `ruleCode`
  or exact summary, not ticker alone (XYZ can have two rows).

Regressions to rerun:

```bash
TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e \
  e2e/pmcc-assignment-risk-alert.spec.ts e2e/expiration-imminent-alert.spec.ts \
  e2e/dismiss-alert.spec.ts e2e/management-queue.spec.ts
pnpm rebuild:node
```

**Passing:** all 8 scenario families, which expand to 12 named e2e cases, pass, plus the
unit, service and property suites and the four gates. Then run `/update-spec us-107`.
