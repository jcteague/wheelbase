// [US-44] IV collector scheduling and persistence — E2E tests.
//
// Each `it()` maps to one surviving acceptance criterion from
// docs/epics/06-stories/US-44-ivr-snapshot-store-and-scheduler.md. [US-121] The collector
// now builds each ticker's IV30 series from daily bars: the suite boots the real Electron
// app with a fake IV series (WHEELBASE_FAKE_IV_SERIES), drives the real `ivr-collect` job
// through the production manual-trigger IPC, and reads the persisted `iv30_reading` rows
// and the fake's bar-request log back through dev-only `_test:*` channels — so no live
// market-data request ever leaves the process.
//
// Seeding a ticker backfills it on the spot (US-100), so a scenario about *the batch*
// seeds a series that stops at the previous session, lets the backfill land, then extends
// the series through today: the only session left for the batch to read is today's.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
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
  launchIvrApp,
  readDailyBarRequests,
  readIv30History,
  seedActivePosition,
  seriesForRank,
  setIvSeries,
  waitForIvHistory,
  type FakeIvSeriesFixture
} from './ivr-helpers'
import {
  BASE_DAY,
  afterCloseOn,
  mostRecent,
  sessionCloseOn,
  sessionsAgo,
  sessionsBefore,
  weekdayCalendar
} from './trading-day-fixtures'

// A guaranteed weekend so the collector's "latest completed session" is the Friday before
// regardless of when the suite runs.
const SATURDAY = mostRecent(6)
const WEEKEND_NOW = afterCloseOn(SATURDAY)
/** Where a reading taken on the fixture day's session is stored. */
const SAME_DAY_STAMP = sessionCloseOn(FAKE_NOW_DAY)

/** Series for each ticker stopping `endingSessionsAgo` sessions before FAKE_NOW_DAY. */
function seriesEnding(
  ranks: Record<string, number>,
  endingSessionsAgo: number
): FakeIvSeriesFixture {
  return Object.fromEntries(
    Object.entries(ranks).map(([ticker, rank]) => [
      ticker,
      seriesForRank(rank, { endingSessionsAgo })
    ])
  )
}

/** Rows persisted for one session, by underlying. */
async function rowsOn(page: Page, session: string): Promise<string[]> {
  return (await readIv30History(page))
    .filter((row) => row.session === session)
    .map((row) => row.underlying)
}

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
    const ranks = { SPY: 40, AAPL: 55, TSLA: 70 }
    app = await launchIvrApp(dbPath, { ivSeries: seriesEnding(ranks, 1) })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await seedActivePosition(page, 'AAPL')
    await seedActivePosition(page, 'TSLA')
    // A second open wheel on SPY must not produce a duplicate fetch/row.
    await seedActivePosition(page, 'SPY', 110)
    await waitForIvHistory(page, ['AAPL', 'SPY', 'TSLA'])
    expect(await rowsOn(page, FAKE_NOW_DAY)).toEqual([])

    await setIvSeries(page, seriesEnding(ranks, 0))
    const batch = await collectIvrNow(page)

    expect(batch.successCount).toBe(3)
    expect(await rowsOn(page, FAKE_NOW_DAY)).toEqual(['AAPL', 'SPY', 'TSLA'])
    const stockRequests = (await readDailyBarRequests(page))
      .filter((request) => request.kind === 'stock')
      .map((request) => request.underlying)
    expect(stockRequests.sort()).toEqual(['AAPL', 'SPY', 'TSLA'])
  })

  it('AC: Successful snapshot is persisted', async () => {
    dbPath = tmpDb('wb-e2e-ivr-persist')
    app = await launchIvrApp(dbPath, { ivSeries: seriesEnding({ SPY: 40 }, 1) })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    await setIvSeries(page, seriesEnding({ SPY: 40 }, 0))

    const batch = await collectIvrNow(page)
    const rows = await readIv30History(page)

    expect(batch.successCount).toBe(1)
    // The full window plus today's anchor.
    expect(rows).toHaveLength(253)
    expect(rows.at(-1)).toMatchObject({
      underlying: 'SPY',
      session: FAKE_NOW_DAY,
      observed_at: SAME_DAY_STAMP,
      // seriesForRank(40) programs today at 0.2 + 0.004 × 40.
      iv30: '0.3600',
      method: 'daily_vwap'
    })
  })

  it('AC: Re-running within the same session is up to date and leaves the row unchanged (US-121 supersedes the overwrite)', async () => {
    dbPath = tmpDb('wb-e2e-ivr-overwrite')
    app = await launchIvrApp(dbPath, { ivSeries: seriesEnding({ SPY: 30 }, 1) })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    await setIvSeries(page, seriesEnding({ SPY: 30 }, 0))
    expect((await collectIvrNow(page)).successCount).toBe(1)

    // [US-121] A session's reading is computed once from its settled bars, so a rerun has
    // nothing left to read: a different value is programmed, and neither the request log
    // nor the stored row may show it.
    await setIvSeries(page, seriesEnding({ SPY: 45 }, 0))
    const rerun = await collectIvrNow(page)

    expect(rerun).toMatchObject({ successCount: 0, skippedCount: 1, errorCount: 0 })
    expect(await readDailyBarRequests(page)).toEqual([])
    const today = (await readIv30History(page)).filter((row) => row.session === FAKE_NOW_DAY)
    expect(today).toHaveLength(1)
    expect(today[0]).toMatchObject({
      underlying: 'SPY',
      observed_at: SAME_DAY_STAMP,
      iv30: '0.3200'
    })
  })

  it('AC: Manual trigger from settings', async () => {
    dbPath = tmpDb('wb-e2e-ivr-manual')
    app = await launchIvrApp(dbPath, { ivSeries: seriesEnding({ SPY: 61 }, 1) })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    await setIvSeries(page, seriesEnding({ SPY: 61 }, 0))

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('button:has-text("Refresh IVR now")')
    await page.click('button:has-text("Refresh IVR now")')

    const done = 'text=IV history refresh complete: 1 tickers updated, 0 errors.'
    await page.waitForSelector(done)
    expect(await page.isVisible(done)).toBe(true)
    expect(await rowsOn(page, FAKE_NOW_DAY)).toEqual(['SPY'])
  })

  it('AC: A scheduled weekend run makes no bar requests', async () => {
    dbPath = tmpDb('wb-e2e-ivr-closed')
    const friday = sessionsBefore(SATURDAY, 1)
    const complete = seriesEnding({ SPY: 50 }, sessionsAgo(friday))
    app = await launchIvrApp(dbPath, {
      marketStatus: CLOSED_SESSION,
      fakeNow: WEEKEND_NOW,
      ivSeries: complete
    })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    expect(await rowsOn(page, friday)).toEqual(['SPY'])
    // The series is complete through Friday. Resetting the log leaves only the scheduled
    // run's own requests — and a Saturday closes no session, so there must be none.
    await setIvSeries(page, complete)

    const batch = await collectIvrScheduled(page)

    expect(batch).toMatchObject({ successCount: 0, errorCount: 0, skippedCount: 1 })
    expect(await readDailyBarRequests(page)).toEqual([])
  })

  // [US-98/US-121] The calendar decides which sessions exist. A weekday holiday is the case
  // a weekday heuristic would get wrong: it would look for the holiday's bars.
  it('AC: A recognised weekday holiday skips collection with no fetch', async () => {
    dbPath = tmpDb('wb-e2e-ivr-holiday')
    const holiday = BASE_DAY
    const complete = seriesEnding({ SPY: 50 }, 1)
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      marketCalendar: weekdayCalendar([holiday]),
      ivSeries: complete
    })
    const page = await getPage(app)

    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    await setIvSeries(page, complete)

    const batch = await collectIvrScheduled(page)

    expect(batch).toMatchObject({ successCount: 0, errorCount: 0, skippedCount: 1 })
    expect(await readDailyBarRequests(page)).toEqual([])
    expect(await rowsOn(page, holiday)).toEqual([])
  })

  it('AC: The holiday guard still holds with no broker configured', async () => {
    dbPath = tmpDb('wb-e2e-ivr-holiday-brokerless')
    const holiday = BASE_DAY
    const openDay = sessionsBefore(holiday, 1)
    const calendar = weekdayCalendar([holiday])
    const complete = seriesEnding({ SPY: 55 }, 1)

    // Run once with a broker, on an open day, purely to populate the calendar cache and
    // the series through that day.
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(openDay),
      marketCalendar: calendar,
      ivSeries: complete
    })
    let page = await getPage(app)
    await seedActivePosition(page, 'SPY')
    await waitForIvHistory(page, ['SPY'])
    expect(await rowsOn(page, openDay)).toEqual(['SPY'])

    // Now the same database with no credentials at all: nothing refreshes the calendar,
    // but what is already cached is enough to recognise the closure.
    await app.close()
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      withoutBrokerCredentials: true,
      ivSeries: complete
    })
    page = await getPage(app)

    const batch = await collectIvrScheduled(page)

    expect(batch).toMatchObject({ successCount: 0, errorCount: 0, skippedCount: 1 })
    expect(await readDailyBarRequests(page)).toEqual([])
    expect(await rowsOn(page, holiday)).toEqual([])
  })
})
