// [US-46] PollingScheduler service — E2E tests.
//
// These tests boot the real Electron app with FAKE_BROKER=true and exercise the
// PollingScheduler instance wired into the main process. They use dev-only
// `_test:scheduler-*` IPC channels (guarded by NODE_ENV='test') so that tests
// can inspect the job registry, register synthetic test jobs at boot, and drive
// `runNow` against them. Cadence timing is verified against short (10–50ms)
// intervals so e2e runs stay fast.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import {
  cleanupDb,
  getPage,
  getSchedulerRegistry,
  launchApp,
  runNowTestJob,
  simulateSchedulerWake,
  tmpDb,
  tryRegisterTestJob,
  CLOSED_SESSION,
  POST_SESSION,
  REGULAR_SESSION
} from './assignment-helpers'

async function waitForInvocations(
  page: Page,
  jobName: string,
  minCount: number,
  timeoutMs = 5000
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let lastCount = 0
  while (Date.now() < deadline) {
    const registry = await getSchedulerRegistry(page)
    const entry = registry.find((j) => j.name === jobName)
    lastCount = entry?.invocations ?? 0
    if (lastCount >= minCount) return lastCount
    await new Promise((r) => setTimeout(r, 25))
  }
  return lastCount
}

describe('US-46: PollingScheduler — registry and lifecycle', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('registers an interval job', async () => {
    dbPath = tmpDb('wb-e2e-sched-register')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [
        {
          name: 'test-interval',
          cadence: { kind: 'interval', marketOpenMs: 5_000_000, marketClosedMs: null }
        }
      ]
    })
    const page = await getPage(app)

    const registry = await getSchedulerRegistry(page)
    const job = registry.find((j) => j.name === 'test-interval')
    expect(job).toBeDefined()
    expect(job?.cadence.kind).toBe('interval')
  })

  it('start invokes every registered job once and then on cadence', async () => {
    dbPath = tmpDb('wb-e2e-sched-start')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [
        { name: 'job-a', cadence: { kind: 'interval', marketOpenMs: 50 } },
        { name: 'job-b', cadence: { kind: 'interval', marketOpenMs: 50 } }
      ]
    })
    const page = await getPage(app)

    const countA = await waitForInvocations(page, 'job-a', 3)
    const countB = await waitForInvocations(page, 'job-b', 3)
    expect(countA).toBeGreaterThanOrEqual(3)
    expect(countB).toBeGreaterThanOrEqual(3)
  })

  it('market-hours-aware interval respects marketClosedMs of null', async () => {
    dbPath = tmpDb('wb-e2e-sched-closed')
    // Use a future nextOpen so the park-wake timer fires after the 500ms observation
    // window (not the stale-nextOpen fallback, which would re-tick at marketOpenMs).
    const nextOpen = new Date(Date.now() + 60_000).toISOString()
    app = await launchApp(dbPath, {
      marketStatus: { ...CLOSED_SESSION, nextOpen },
      testJobs: [
        {
          name: 'parked-job',
          cadence: { kind: 'interval', marketOpenMs: 50, marketClosedMs: null }
        }
      ]
    })
    const page = await getPage(app)

    // First tick runs (start kicks off all jobs once); then job parks until nextOpen.
    await waitForInvocations(page, 'parked-job', 1)
    await new Promise((r) => setTimeout(r, 500))
    const registry = await getSchedulerRegistry(page)
    const job = registry.find((j) => j.name === 'parked-job')
    expect(job?.invocations).toBe(1)
  })

  it('market-hours-aware interval with extended hours uses different cadence', async () => {
    dbPath = tmpDb('wb-e2e-sched-ext')
    app = await launchApp(dbPath, {
      marketStatus: POST_SESSION,
      testJobs: [
        {
          name: 'ext-job',
          cadence: { kind: 'interval', marketOpenMs: 10, extendedHoursMs: 1_000 }
        }
      ]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'ext-job', 1)
    await new Promise((r) => setTimeout(r, 600))
    const registry = await getSchedulerRegistry(page)
    const job = registry.find((j) => j.name === 'ext-job')
    // At extendedHoursMs=1000, only the initial tick should have fired within 600ms.
    expect(job?.invocations).toBe(1)
    expect((job?.cadence as { extendedHoursMs?: number }).extendedHoursMs).toBe(1_000)
  })

  it('afterClose job fires after market close + offset minutes', async () => {
    // Set nextClose far enough in the future that the scheduler still sees it as
    // pending after the Electron boot (~3–5s); the job must fire once when the
    // wall clock crosses nextClose + offset.
    const nextClose = new Date(Date.now() + 12_000).toISOString()
    dbPath = tmpDb('wb-e2e-sched-afterclose')
    app = await launchApp(dbPath, {
      marketStatus: { ...REGULAR_SESSION, nextClose },
      testJobs: [{ name: 'after-close-job', cadence: { kind: 'afterClose', offsetMinutes: 0 } }]
    })
    const page = await getPage(app)

    const count = await waitForInvocations(page, 'after-close-job', 1, 20_000)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('handler exception does not stop the scheduler', async () => {
    dbPath = tmpDb('wb-e2e-sched-error')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [
        { name: 'throwing-job', cadence: { kind: 'interval', marketOpenMs: 50 }, throws: true },
        { name: 'healthy-job', cadence: { kind: 'interval', marketOpenMs: 50 } }
      ]
    })
    const page = await getPage(app)

    const throwingCount = await waitForInvocations(page, 'throwing-job', 3)
    const healthyCount = await waitForInvocations(page, 'healthy-job', 3)
    expect(throwingCount).toBeGreaterThanOrEqual(3)
    expect(healthyCount).toBeGreaterThanOrEqual(3)
  })

  it('runNow triggers an out-of-band invocation', async () => {
    dbPath = tmpDb('wb-e2e-sched-runnow')
    app = await launchApp(dbPath, {
      marketStatus: CLOSED_SESSION,
      testJobs: [
        {
          name: 'manual-job',
          cadence: { kind: 'interval', marketOpenMs: 5_000_000, marketClosedMs: null }
        }
      ]
    })
    const page = await getPage(app)

    // Wait for the initial tick to settle.
    await waitForInvocations(page, 'manual-job', 1)
    const before = await getSchedulerRegistry(page)
    const beforeCount = before.find((j) => j.name === 'manual-job')?.invocations ?? 0

    await runNowTestJob(page, 'manual-job')

    const after = await waitForInvocations(page, 'manual-job', beforeCount + 1)
    expect(after).toBe(beforeCount + 1)
  })

  it('stop cancels all pending invocations', async () => {
    dbPath = tmpDb('wb-e2e-sched-stop')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [{ name: 'short-job', cadence: { kind: 'interval', marketOpenMs: 50 } }]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'short-job', 2)
    // app.close() triggers before-quit which calls scheduler.stop(); the close
    // must resolve within a reasonable window (no hang from in-flight handlers).
    const closeStarted = Date.now()
    await app.close()
    const closeMs = Date.now() - closeStarted
    expect(closeMs).toBeLessThan(8_000)
  })

  it('system wake from sleep does not fire missed ticks', async () => {
    dbPath = tmpDb('wb-e2e-sched-wake')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [{ name: 'wake-job', cadence: { kind: 'interval', marketOpenMs: 5_000_000 } }]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'wake-job', 1)
    const before = await getSchedulerRegistry(page)
    const beforeCount = before.find((j) => j.name === 'wake-job')?.invocations ?? 0

    // Simulate wake by advancing wall-clock significantly (no missed-tick backfill).
    await simulateSchedulerWake(page, 60 * 60 * 1000)

    await new Promise((r) => setTimeout(r, 500))
    const after = await getSchedulerRegistry(page)
    const afterCount = after.find((j) => j.name === 'wake-job')?.invocations ?? 0
    expect(afterCount).toBe(beforeCount)
  })

  it('concurrent registration of same job name is rejected', async () => {
    dbPath = tmpDb('wb-e2e-sched-dup')
    app = await launchApp(dbPath, {
      marketStatus: REGULAR_SESSION,
      testJobs: [
        {
          name: 'dup-job',
          cadence: { kind: 'interval', marketOpenMs: 5_000_000, marketClosedMs: null }
        }
      ]
    })
    const page = await getPage(app)

    const result = await tryRegisterTestJob(page, {
      name: 'dup-job',
      cadence: { kind: 'interval', marketOpenMs: 1_000 }
    })
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('already_registered')
  })
})

describe('US-49: parked-job self-resume', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('US-49 AC-1: parked job fires once on start then waits for nextOpen wake', async () => {
    const nextOpen = new Date(Date.now() + 12_000).toISOString()
    dbPath = tmpDb('wb-e2e-park-ac1')
    app = await launchApp(dbPath, {
      marketStatus: { ...CLOSED_SESSION, nextOpen },
      testJobs: [
        { name: 'park-job', cadence: { kind: 'interval', marketOpenMs: 50, marketClosedMs: null } }
      ]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'park-job', 1, 5_000)

    await new Promise((r) => setTimeout(r, 3_000))
    const mid = await getSchedulerRegistry(page)
    expect(mid.find((j) => j.name === 'park-job')?.invocations).toBe(1)

    const finalCount = await waitForInvocations(page, 'park-job', 2, 15_000)
    expect(finalCount).toBeGreaterThanOrEqual(2)
  })

  it('US-49 AC-4: launching after hours parks the job without crashing', async () => {
    const nextOpen = new Date(Date.now() + 30_000).toISOString()
    dbPath = tmpDb('wb-e2e-park-ac4')
    app = await launchApp(dbPath, {
      marketStatus: { ...CLOSED_SESSION, nextOpen },
      testJobs: [
        { name: 'park-job', cadence: { kind: 'interval', marketOpenMs: 50, marketClosedMs: null } }
      ]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'park-job', 1, 5_000)
    await new Promise((r) => setTimeout(r, 2_000))

    const registry = await getSchedulerRegistry(page)
    expect(registry.find((j) => j.name === 'park-job')?.invocations).toBe(1)
  })

  it('US-49 AC-5: app.close() completes within 8s when a park-wake timer is pending', async () => {
    const nextOpen = new Date(Date.now() + 60_000).toISOString()
    dbPath = tmpDb('wb-e2e-park-ac5')
    app = await launchApp(dbPath, {
      marketStatus: { ...CLOSED_SESSION, nextOpen },
      testJobs: [
        { name: 'park-job', cadence: { kind: 'interval', marketOpenMs: 50, marketClosedMs: null } }
      ]
    })
    const page = await getPage(app)

    await waitForInvocations(page, 'park-job', 1, 5_000)

    const closeStart = Date.now()
    await app.close()
    app = null as unknown as ElectronApplication
    expect(Date.now() - closeStart).toBeLessThan(8_000)
  })
})
