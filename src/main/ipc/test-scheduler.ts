// Dev-only IPC channels for inspecting and driving the PollingScheduler in e2e tests.
// Registered only when NODE_ENV === 'test'. Backed by the existing scheduler
// singleton — no separate state.
import { ipcMain } from 'electron'
import {
  SchedulerError,
  type CadencePolicy,
  type PollingScheduler
} from '../services/polling-scheduler'
import { logger } from '../logger'

type TestJobFixture = {
  name: string
  cadence: CadencePolicy
  throws?: boolean
}

function createTestJobHandler(name: string, throws: boolean | undefined): () => Promise<void> {
  return async () => {
    if (throws) {
      throw new Error(`Test job '${name}' configured to throw`)
    }
  }
}

export function seedTestJobsFromEnv(scheduler: PollingScheduler): void {
  const raw = process.env.WHEELBASE_TEST_JOBS
  if (!raw) return
  let fixtures: TestJobFixture[]
  try {
    fixtures = JSON.parse(raw) as TestJobFixture[]
  } catch (err) {
    logger.warn({ err }, 'Failed to parse WHEELBASE_TEST_JOBS')
    return
  }
  for (const fixture of fixtures) {
    scheduler.register({
      name: fixture.name,
      cadence: fixture.cadence,
      handler: createTestJobHandler(fixture.name, fixture.throws)
    })
  }
}

export function registerTestSchedulerIpc(scheduler: PollingScheduler): void {
  ipcMain.handle('_test:scheduler-registry', () => scheduler.getRegistry())

  ipcMain.handle('_test:scheduler-run-now', async (_, jobName: string) => {
    await scheduler.runNow(jobName)
  })

  ipcMain.handle('_test:scheduler-register', (_, fixture: TestJobFixture) => {
    try {
      scheduler.register({
        name: fixture.name,
        cadence: fixture.cadence,
        handler: createTestJobHandler(fixture.name, fixture.throws)
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof SchedulerError) {
        return { ok: false, errorCode: err.code }
      }
      return { ok: false, errorCode: 'unknown' }
    }
  })

  // System-wake simulation is a no-op for setTimeout-chain schedulers: each tick
  // schedules only the next tick, so OS sleep cannot accumulate missed ticks.
  // The handler exists so the test can prove the property by observing that no
  // extra invocations occur.
  ipcMain.handle('_test:scheduler-simulate-wake', () => {
    return { ok: true }
  })
}
