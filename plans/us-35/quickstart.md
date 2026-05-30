# Quickstart: US-46 + US-35

## Prerequisites

1. **`plans/us-39/` is implemented.** Provider split, `BrokerProvider`, `AlpacaBrokerProvider`. This plan assumes those interfaces exist.
2. **Alpaca paper credentials configured.** The detection job calls `broker:activities` against the active broker environment.
3. **`assignCspPosition` service exists** at `src/main/services/assign-csp-position.ts`. No change to that file is required.
4. **better-sqlite3 rebuilt for both runtimes:**
   ```bash
   npx electron-rebuild -f -w better-sqlite3
   pnpm rebuild better-sqlite3
   ```

## Apply migrations

```bash
# Migrations run automatically on app boot via src/main/db/migrate.ts.
# To verify locally:
pnpm dev   # boot the app; migrations apply; check sqlite for pending_assignments table
```

If you want to inspect manually:

```bash
sqlite3 ~/Library/Application\ Support/wheelbase/wheelbase.db ".schema pending_assignments"
```

## Seed paper assignment activity for testing

Alpaca paper does not generate OPASN events for assignment-eligible positions on its own. Two options:

1. **Mocked unit/integration path (default):** all tests use the `FakeBrokerProvider` with `FAKE_BROKER_ACTIVITIES` injected.

   ```bash
   export FAKE_BROKER_ACTIVITIES='[{"activityId":"act_test_1","activityType":"OPASN","symbol":"AAPL250620P00180000","qty":1,"price":"180.00","transactionTime":"2026-05-29T12:00:00Z"}]'
   ```

2. **Live Alpaca paper integration:** open a CSP in paper, hold to expiration ITM, wait until next-morning OPASN posts. Slow, but the only end-to-end real-broker path.

## Run the test suites

```bash
pnpm test                                              # all unit + integration
pnpm test src/main/services/polling-scheduler.test.ts  # US-46 unit tests
pnpm test src/main/services/detect-assignments.test.ts # US-35 unit tests
pnpm test src/main/ipc/assignments.test.ts             # IPC layer
pnpm test:e2e                                          # GUI terminal only
pnpm typecheck
pnpm lint
```

## Manual smoke test

1. `pnpm dev`
2. Configure Alpaca paper credentials in Settings (US-37 if landed; otherwise via existing flow).
3. Seed a CSP_OPEN position for `AAPL` at strike 180 expiring 2026-05-15 (any past date works for replay).
4. Open the developer console and execute:
   ```js
   await window.api.assignments.runDetectionNow()
   ```
5. Refresh the position list. Confirm the assignment banner appears with the correct ticker, strike, and date.
6. Click "Confirm". Verify the position transitions to `HOLDING_SHARES` and the success toast shows.

## Adding a new scheduled job (US-44 and beyond)

All periodic background jobs must use the shared `PollingScheduler` singleton — do not introduce another scheduling primitive.

**Step 1 — Import the singleton**

```typescript
import { scheduler } from '../services/scheduler-instance'
```

**Step 2 — Register your job before `scheduler.start()` is called**

Registration happens in `src/main/index.ts` alongside the existing `detect-assignments` registration. Add your `register()` call in the same bootstrap block, before `scheduler.start()`:

```typescript
// US-44: IVR collection — once per market day, 60 minutes after close (17:00 ET)
scheduler.register({
  name: 'ivr-collect',
  cadence: { kind: 'afterClose', offsetMinutes: 60 },
  handler: () => collectIVRSnapshots({ db, brokerProvider, logger })
})
```

**Step 3 — Wire a manual-trigger IPC handler (if needed)**

If your story needs a "run now" affordance (like US-44's "Refresh IVR now"):

```typescript
ipcMain.handle('ivr:collect-now', async () => {
  await scheduler.runNow('ivr-collect')
  return { ok: true }
})
```

**Cadence reference**

| Use case                                                         | Policy                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Poll broker data every 60s during market hours, parked overnight | `{ kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null }`                           |
| Poll every 60s regular hours, 5m extended hours                  | `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` |
| Run once per trading day, 60 min after close (17:00 ET)          | `{ kind: 'afterClose', offsetMinutes: 60 }`                                                  |

**What the scheduler guarantees you don't need to re-implement**

- No missed-tick burst on OS wake-from-sleep
- No overlapping runs (handler must settle before next tick is scheduled)
- WARN log + reschedule on handler error (no crash, no pile-up)
- Clean drain on app quit (5-second timeout, then force-exit)
- Market-session awareness via `BrokerProvider.getMarketStatus()`

---

## What "done" looks like

- `pnpm test` green
- `pnpm typecheck` + `pnpm lint` green
- `PollingScheduler` registered jobs run on cadence and are cancelled cleanly on app quit
- Assignment banner appears for matched OPASN activities and persists across app restarts
- Confirming a banner transitions the position and triggers the success toast with the covered-call shortcut
- Dismissing a banner removes it permanently (does not reappear on next poll)
- Network errors during polling are logged at WARN and the next interval still runs
