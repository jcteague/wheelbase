// [US-44] IVR snapshot store + scheduler — E2E tests.
//
// Each `it()` maps to exactly one acceptance criterion from
// docs/epics/06-stories/US-44-ivr-snapshot-store-and-scheduler.md. The suite boots
// the real Electron app with the fake-IVR seam enabled (WHEELBASE_FAKE_IVR), drives
// the real `ivr-collect` job through the production manual-trigger IPC, and reads the
// persisted ivr_snapshot rows back through dev-only `_test:ivr-*` channels — so no
// live Barchart request ever leaves the process.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication } from 'playwright'
import {
  CLOSED_SESSION,
  cleanupDb,
  getPage,
  getSchedulerRegistry,
  tmpDb
} from './assignment-helpers'
import {
  collectIvrNow,
  launchIvrApp,
  notAvailableOutcome,
  okOutcome,
  parseErrorOutcome,
  readIvrSnapshots,
  seedActivePosition,
  setIvrOutcomes
} from './ivr-helpers'

// A guaranteed weekend so the trading-day guard treats a closed session as a
// genuine non-trading day regardless of when the suite runs.
const WEEKEND_NOW = '2026-05-23T17:00:00Z'
const SAME_DAY_MORNING = '2026-05-29T14:05:00Z'
const SAME_DAY_AFTERNOON = '2026-05-29T20:55:00Z'

describe('US-44: IVR collector — scheduling and persistence', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('AC: Collector runs once per market day after close', async () => {
    dbPath = tmpDb('wb-e2e-ivr-schedule')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    const registry = await getSchedulerRegistry(page)
    const job = registry.find((entry) => entry.name === 'ivr-collect')

    expect(job).toBeDefined()
    expect(job?.cadence).toEqual({ kind: 'afterClose', offsetMinutes: 60 })
  })

  it('AC: Collector picks up all active-position underlyings', async () => {
    dbPath = tmpDb('wb-e2e-ivr-active')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await seedActivePosition(page, 'AAPL')
    await seedActivePosition(page, 'TSLA')
    // A second open wheel on SPY must not produce a duplicate fetch/row.
    await seedActivePosition(page, 'SPY', 110)

    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 40, observedAt: SAME_DAY_AFTERNOON }),
      AAPL: okOutcome('AAPL', { ivr: 55, observedAt: SAME_DAY_AFTERNOON }),
      TSLA: okOutcome('TSLA', { ivr: 70, observedAt: SAME_DAY_AFTERNOON })
    })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch.successCount).toBe(3)
    expect(rows.map((row) => row.underlying)).toEqual(['AAPL', 'SPY', 'TSLA'])
  })

  it('AC: Successful snapshot is persisted', async () => {
    dbPath = tmpDb('wb-e2e-ivr-persist')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 42.5, ivp: 50, iv30: 0.18, observedAt: SAME_DAY_AFTERNOON })
    })

    await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      underlying: 'SPY',
      observed_at: SAME_DAY_AFTERNOON,
      ivr: '42.5',
      ivp: '50.0',
      iv30: '0.18',
      source: 'barchart'
    })
  })

  it('AC: Re-running on the same calendar day overwrites the existing row', async () => {
    dbPath = tmpDb('wb-e2e-ivr-overwrite')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')

    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 30, observedAt: SAME_DAY_MORNING })
    })
    await collectIvrNow(page)

    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 45, observedAt: SAME_DAY_AFTERNOON })
    })
    await collectIvrNow(page)

    const rows = await readIvrSnapshots(page)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      underlying: 'SPY',
      observed_at: SAME_DAY_AFTERNOON,
      ivr: '45.0'
    })
  })

  it('AC: Not-available ticker is recorded but with no row written', async () => {
    dbPath = tmpDb('wb-e2e-ivr-notavailable')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await setIvrOutcomes(page, { SPY: notAvailableOutcome('SPY') })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch.skippedCount).toBe(1)
    expect(batch.successCount).toBe(0)
    expect(rows).toHaveLength(0)
  })

  it('AC: Parse error is logged and the collector continues to the next ticker', async () => {
    dbPath = tmpDb('wb-e2e-ivr-parseerror')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    // Collector iterates underlyings alphabetically: AAPL (parse_error) then SPY (ok).
    await seedActivePosition(page, 'AAPL')
    await seedActivePosition(page, 'SPY')
    await setIvrOutcomes(page, {
      AAPL: parseErrorOutcome(),
      SPY: okOutcome('SPY', { ivr: 33.3, observedAt: SAME_DAY_AFTERNOON })
    })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch.errorCount).toBe(1)
    expect(batch.successCount).toBe(1)
    expect(rows.map((row) => row.underlying)).toEqual(['SPY'])
  })

  it('AC: Manual trigger from settings', async () => {
    dbPath = tmpDb('wb-e2e-ivr-manual')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 61, observedAt: SAME_DAY_AFTERNOON })
    })

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('button:has-text("Refresh IVR now")')
    await page.click('button:has-text("Refresh IVR now")')

    await page.waitForSelector('text=IVR refresh complete: 1 snapshots saved, 0 errors.')
    expect(await page.isVisible('text=IVR refresh complete: 1 snapshots saved, 0 errors.')).toBe(
      true
    )
  })

  it('AC: Market is closed on a non-trading day', async () => {
    dbPath = tmpDb('wb-e2e-ivr-closed')
    app = await launchIvrApp(dbPath, { marketStatus: CLOSED_SESSION, fakeNow: WEEKEND_NOW })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    // Program a successful outcome: if any fetch happened, a row would persist.
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 99, observedAt: SAME_DAY_AFTERNOON })
    })

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('button:has-text("Refresh IVR now")')
    await page.click('button:has-text("Refresh IVR now")')

    await page.waitForSelector('text=IVR refresh skipped: market closed on a non-trading day.')
    const rows = await readIvrSnapshots(page)
    expect(rows).toHaveLength(0)
  })
})
