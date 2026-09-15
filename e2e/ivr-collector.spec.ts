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
  FAKE_NOW_DAY,
  collectIvrNow,
  collectIvrScheduled,
  fakeNowAt,
  launchIvrApp,
  notAvailableOutcome,
  okOutcome,
  parseErrorOutcome,
  readIvrSnapshots,
  seedActivePosition,
  setIvrOutcomes
} from './ivr-helpers'
import {
  BASE_DAY,
  afterCloseOn,
  mostRecent,
  sessionCloseOn,
  sessionsBefore,
  weekdayCalendar
} from './trading-day-fixtures'

// A guaranteed weekend so the trading-day guard treats a closed session as a
// genuine non-trading day regardless of when the suite runs.
const WEEKEND_NOW = afterCloseOn(mostRecent(6))
// [US-100] Anchored to the fixture day rather than pinned: a reading dated outside the
// store's 45-day read window has no session to be placed against, so it would silently
// take the unstamped fallback and this suite would stop testing the stamp at all.
//
// Both instants sit after the fixture day's close and before the next one, so they
// belong to the *same* observation window — which is what makes the overwrite case a
// re-collection rather than two different sessions. 21:00Z is the close in EST and an
// hour past it in EDT, so neither drifts across the boundary with the derived BASE_DAY.
const SAME_SESSION_EARLY = afterCloseOn(FAKE_NOW_DAY)
const SAME_SESSION_LATE = fakeNowAt('22:30:00.000Z')
/** Where a reading taken on the fixture day's session is now stored. */
const SAME_DAY_STAMP = sessionCloseOn(FAKE_NOW_DAY)

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
      SPY: okOutcome('SPY', { ivr: 40, observedAt: SAME_SESSION_LATE }),
      AAPL: okOutcome('AAPL', { ivr: 55, observedAt: SAME_SESSION_LATE }),
      TSLA: okOutcome('TSLA', { ivr: 70, observedAt: SAME_SESSION_LATE })
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
      SPY: okOutcome('SPY', { ivr: 42.5, ivp: 50, iv30: 0.18, observedAt: SAME_SESSION_LATE })
    })

    await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      underlying: 'SPY',
      observed_at: SAME_DAY_STAMP,
      ivr: '42.5',
      ivp: '50.0',
      iv30: '0.18',
      source: 'barchart'
    })
  })

  it('AC: Re-running within the same session overwrites the existing row', async () => {
    dbPath = tmpDb('wb-e2e-ivr-overwrite')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')

    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 30, observedAt: SAME_SESSION_EARLY })
    })
    await collectIvrNow(page)

    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 45, observedAt: SAME_SESSION_LATE })
    })
    await collectIvrNow(page)

    const rows = await readIvrSnapshots(page)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      underlying: 'SPY',
      observed_at: SAME_DAY_STAMP,
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
      SPY: okOutcome('SPY', { ivr: 33.3, observedAt: SAME_SESSION_LATE })
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
      SPY: okOutcome('SPY', { ivr: 61, observedAt: SAME_SESSION_LATE })
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
      SPY: okOutcome('SPY', { ivr: 99, observedAt: SAME_SESSION_LATE })
    })

    // [US-100] The guard is now scoped to the *scheduled* trigger, so this drives the
    // job as the after-close timer would. Driving `collectIvrNow` here would exercise
    // the explicit path, which deliberately no longer skips.
    const batch = await collectIvrScheduled(page)

    expect(batch.skippedReason).toBe('market_closed')
    const rows = await readIvrSnapshots(page)
    expect(rows).toHaveLength(0)
  })

  // [US-98] The guard now reads the cached exchange calendar instead of the broker's
  // clock. A weekday holiday is the case the old heuristic got wrong: a missing or
  // failing broker meant "assume trading day", so the run fetched anyway and its empty
  // holiday reading overwrote the previous good one.
  it('AC: A recognised weekday holiday skips collection with no fetch', async () => {
    dbPath = tmpDb('wb-e2e-ivr-holiday')
    const holiday = BASE_DAY
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      marketCalendar: weekdayCalendar([holiday])
    })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    // A successful outcome is programmed on purpose: any fetch at all would persist.
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 99, observedAt: afterCloseOn(holiday) })
    })

    const batch = await collectIvrScheduled(page)

    expect(batch.skippedReason).toBe('market_closed')
    expect(batch.successCount).toBe(0)
    expect(await readIvrSnapshots(page)).toHaveLength(0)
  })

  it('AC: The holiday guard still holds with no broker configured', async () => {
    dbPath = tmpDb('wb-e2e-ivr-holiday-brokerless')
    const holiday = BASE_DAY
    const openDay = sessionsBefore(holiday, 1)
    const calendar = weekdayCalendar([holiday])

    // Run once with a broker, on an open day, purely to populate the calendar cache —
    // the collector is the only thing that refreshes it.
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(openDay),
      marketCalendar: calendar
    })
    let page = await getPage(app)
    await seedActivePosition(page, 'SPY')
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 55, observedAt: afterCloseOn(openDay) })
    })
    expect((await collectIvrNow(page)).successCount).toBe(1)

    // Now the same database with no credentials at all: nothing can refresh the
    // calendar, but what is already cached is enough to recognise the closure.
    await app.close()
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      withoutBrokerCredentials: true
    })
    page = await getPage(app)
    await setIvrOutcomes(page, {
      SPY: okOutcome('SPY', { ivr: 99, observedAt: afterCloseOn(holiday) })
    })

    const batch = await collectIvrScheduled(page)

    expect(batch.skippedReason).toBe('market_closed')
    expect(batch.successCount).toBe(0)
    // The open day's reading survives — the holiday run never overwrote it.
    const rows = await readIvrSnapshots(page)
    expect(rows.map((row) => row.ivr)).toEqual(['55.0'])
  })
})
