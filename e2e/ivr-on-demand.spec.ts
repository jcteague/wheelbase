// [US-100] IV history collected on watchlist add / position open, and outside market hours.
//
// One `it()` per acceptance scenario in Linear OPT-6, names verbatim (one renamed for
// US-121, noted below). The suite boots the real Electron app with a fake IV series
// (WHEELBASE_FAKE_IV_SERIES), drives the production add and create paths, and reads back
// both the persisted `iv30_reading` rows and the fake's bar-request log — the log being
// the only way to assert a fetch did *not* happen, since a ticker with no bar data also
// writes no reading.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, getPage, tmpDb } from './assignment-helpers'
import { ivrCell } from './screener-helpers'
import {
  FAKE_NOW_DAY,
  collectIvrNow,
  collectIvrScheduled,
  launchIvrApp,
  readIv30Gaps,
  readIv30History,
  removeFromWatchlist,
  requestedUnderlyings,
  seedActivePosition,
  seedBenchAndSettle,
  seriesForRank,
  setIvSeries,
  type FakeIvSeries,
  type FakeIvSeriesFixture
} from './ivr-helpers'
import {
  afterCloseOn,
  mostRecent,
  sessionCloseOn,
  sessionsAgo,
  sessionsBefore,
  weekdayCalendar,
  BASE_DAY
} from './trading-day-fixtures'

/** KO's and MSFT's series, complete through the session `endingSessionsAgo` before
 *  FAKE_NOW_DAY. */
function background(endingSessionsAgo = 0): FakeIvSeriesFixture {
  return {
    KO: seriesForRank(38, { endingSessionsAgo }),
    MSFT: seriesForRank(44, { endingSessionsAgo })
  }
}

/**
 * Background for every scenario: an open CSP on MSFT and KO on the watchlist, each with
 * IV history through `endingSessionsAgo` — so "KO already has a reading for the current
 * trading day", which two scenarios turn on, is true rather than assumed.
 *
 * Seeding triggers collection, so this waits for both backfills to land; a scenario that
 * then resets the request log with `setIvSeries` sees only its own work.
 */
async function seedBackground(page: Page, endingSessionsAgo = 0): Promise<void> {
  await setIvSeries(page, background(endingSessionsAgo))
  await seedBenchAndSettle(page, { positions: ['MSFT'], watchlist: ['KO'] })
}

/** Reset the request log with `extra` series added to the background. */
async function programSeries(page: Page, extra: Record<string, FakeIvSeries>): Promise<void> {
  await setIvSeries(page, { ...background(), ...extra })
}

async function readingsFor(page: Page, ticker: string): Promise<string[]> {
  return (await readIv30History(page))
    .filter((row) => row.underlying === ticker)
    .map((row) => `${row.session}=${row.iv30}`)
}

/** Reveal the bench's add form, the way a trader does. */
async function openAddForm(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/watchlist'
  })
  await page.waitForSelector('[data-testid="bench-add-toggle"]')
  if ((await page.getAttribute('[data-testid="bench-add-toggle"]', 'aria-expanded')) !== 'true') {
    await page.click('[data-testid="bench-add-toggle"]')
  }
  await page.waitForSelector('[data-testid="watchlist-add-submit"]')
}

/** Add a ticker through the form and wait for its card. */
async function addTickerViaForm(page: Page, ticker: string): Promise<void> {
  await openAddForm(page)
  await page.fill('#ticker', ticker)
  await page.click('[data-testid="watchlist-add-submit"]')
  await page.waitForSelector(`[data-testid="watchlist-row-${ticker}"]`)
}

describe('US-100: IVR on demand and outside market hours', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('Adding a ticker to the watchlist collects its IVR immediately', async () => {
    dbPath = tmpDb('wb-e2e-us100-add')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await programSeries(page, { AAPL: seriesForRank(62) })

    await addTickerViaForm(page, 'AAPL')

    await expect.poll(() => readingsFor(page, 'AAPL')).toHaveLength(253)

    // Without the ivr:snapshot-updated push the cell stays `n/a` until a reload, so
    // this assertion fails if the event is not wired — no reload happens here.
    await expect.poll(async () => (await ivrCell(page, 'AAPL')).state).toBe('fresh')
    expect((await ivrCell(page, 'AAPL')).text).toBe('62')
  })

  it('Adding a ticker collects only that ticker', async () => {
    dbPath = tmpDb('wb-e2e-us100-only')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    // The background stops a session short, so KO and MSFT each still have today's
    // session to read: were the add to collect the whole bench, they would request it.
    await seedBackground(page, 1)
    await setIvSeries(page, { ...background(0), AAPL: seriesForRank(62) })

    await addTickerViaForm(page, 'AAPL')

    await expect.poll(() => readingsFor(page, 'AAPL')).toHaveLength(253)
    expect(await requestedUnderlyings(page)).toEqual(['AAPL'])
  })

  it('Adding a ticker that already has a reading for the day does not refetch', async () => {
    dbPath = tmpDb('wb-e2e-us100-dedupe')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await programSeries(page, { AAPL: seriesForRank(62) })

    await addTickerViaForm(page, 'AAPL')
    await expect.poll(() => readingsFor(page, 'AAPL')).toHaveLength(253)
    const collected = await readingsFor(page, 'AAPL')

    await removeFromWatchlist(page, 'AAPL')
    // A different series, so a refetch would be visible in the rows as well as the log.
    await programSeries(page, { AAPL: seriesForRank(11), NVDA: seriesForRank(21) })

    await addTickerViaForm(page, 'AAPL')

    // Barrier: the assertion below is a negative, and the collect it must outlive is
    // detached. Adding a second, uncollected ticker through the same path and waiting
    // for *it* to reach the log proves the queue has drained — without this the test
    // passes under load whether or not the dedupe works.
    await addTickerViaForm(page, 'NVDA')
    await expect.poll(() => readingsFor(page, 'NVDA')).toHaveLength(253)

    expect(await requestedUnderlyings(page)).toEqual(['NVDA'])
    expect(await readingsFor(page, 'AAPL')).toEqual(collected)
  })

  it('The add succeeds even when the IVR fetch fails', async () => {
    dbPath = tmpDb('wb-e2e-us100-add-fails')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await programSeries(page, { AAPL: { ...seriesForRank(62), failWith: 'network_error' } })

    await addTickerViaForm(page, 'AAPL')

    // The card is on the bench and nothing was surfaced to the trader. The warn-level
    // clause is pinned by src/main/services/ivr-on-demand.test.ts — the e2e suite has
    // no log seam.
    expect(await page.locator('[data-testid="watchlist-row-AAPL"]').isVisible()).toBe(true)
    expect(await page.locator('[role="alert"]').count()).toBe(0)
    await expect.poll(async () => (await ivrCell(page, 'AAPL')).reason).toBe('failed')
    expect(await requestedUnderlyings(page)).toEqual(['AAPL'])
    expect(await readingsFor(page, 'AAPL')).toEqual([])
  })

  it('A ticker with no bar data is added without an IV rank', async () => {
    dbPath = tmpDb('wb-e2e-us100-uncovered')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    // XYZ has no series at all: every bar request for it comes back empty.
    await programSeries(page, {})

    await addTickerViaForm(page, 'XYZ')

    await expect
      .poll(async () => (await readIv30Gaps(page)).some((gap) => gap.underlying === 'XYZ'))
      .toBe(true)
    expect(await requestedUnderlyings(page)).toEqual(['XYZ'])
    expect(await readingsFor(page, 'XYZ')).toEqual([])
    const cell = await ivrCell(page, 'XYZ')
    expect(cell.state).toBe('empty')
    expect(cell.text).toBe('n/a')
  })

  it('Opening a position collects its IVR immediately', async () => {
    dbPath = tmpDb('wb-e2e-us100-position')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await programSeries(page, { TSLA: seriesForRank(71) })

    await seedActivePosition(page, 'TSLA')

    await expect.poll(() => readingsFor(page, 'TSLA')).toHaveLength(253)
    expect(await requestedUnderlyings(page)).toEqual(['TSLA'])
  })

  it('Opening a position for an already-collected ticker does not refetch', async () => {
    dbPath = tmpDb('wb-e2e-us100-position-dedupe')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    const collected = await readingsFor(page, 'KO')
    // KO already has this session's reading. Programming a *different* series resets the
    // log and makes a refetch visible in the rows as well as in the log.
    await programSeries(page, { KO: seriesForRank(99), TSLA: seriesForRank(12) })

    await seedActivePosition(page, 'KO')

    // Let the detached collect finish before asserting it did not fetch: seed another
    // ticker through the same path and wait for *that* one to land.
    await seedActivePosition(page, 'TSLA')
    await expect.poll(() => readingsFor(page, 'TSLA')).toHaveLength(253)

    expect(await requestedUnderlyings(page)).toEqual(['TSLA'])
    expect(await readingsFor(page, 'KO')).toEqual(collected)
  })

  it('The position is created even when the IVR fetch fails', async () => {
    dbPath = tmpDb('wb-e2e-us100-position-fails')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await programSeries(page, { TSLA: { ...seriesForRank(12), failWith: 'network_error' } })

    const positionId = await seedActivePosition(page, 'TSLA')

    expect(positionId).toBeTruthy()
    await expect.poll(() => requestedUnderlyings(page)).toContain('TSLA')
    expect(await readingsFor(page, 'TSLA')).toEqual([])
  })

  // [US-121] Each manual-refresh scenario seeds history that stops a session short of the
  // latest close, then publishes that session's bars: the refresh has exactly one session
  // per ticker to read, and reading it on a closed day is the claim.
  it('Manual refresh works on a weekend', async () => {
    dbPath = tmpDb('wb-e2e-us100-weekend')
    const sunday = mostRecent(0)
    const friday = sessionsBefore(sunday, 1)
    app = await launchIvrApp(dbPath, { fakeNow: afterCloseOn(sunday) })
    const page = await getPage(app)
    await seedBackground(page, sessionsAgo(friday) + 1)
    await setIvSeries(page, background(sessionsAgo(friday)))

    const batch = await collectIvrNow(page)

    expect(batch.skippedReason).toBeNull()
    expect(batch.successCount).toBe(2)
    expect(await requestedUnderlyings(page)).toEqual(['KO', 'MSFT'])
    const fridayRows = (await readIv30History(page)).filter((row) => row.session === friday)
    expect(fridayRows.map((row) => row.underlying)).toEqual(['KO', 'MSFT'])
  })

  it('Manual refresh works on a weekday market holiday', async () => {
    dbPath = tmpDb('wb-e2e-us100-holiday')
    const holiday = sessionsBefore(BASE_DAY, 2)
    const openDay = sessionsBefore(holiday, 1)
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      marketCalendar: weekdayCalendar([holiday])
    })
    const page = await getPage(app)
    await seedBackground(page, sessionsAgo(openDay) + 1)
    await setIvSeries(page, background(sessionsAgo(openDay)))

    const batch = await collectIvrNow(page)

    expect(batch.skippedReason).toBeNull()
    expect(batch.successCount).toBe(2)
    expect(await requestedUnderlyings(page)).toEqual(['KO', 'MSFT'])
    const openDayRows = (await readIv30History(page)).filter((row) => row.session === openDay)
    expect(openDayRows.map((row) => row.underlying)).toEqual(['KO', 'MSFT'])
  })

  it('A weekend reading is stored against the trading day it belongs to', async () => {
    dbPath = tmpDb('wb-e2e-us100-weekend-stamp')
    const sunday = mostRecent(0)
    const friday = sessionsBefore(sunday, 1)
    app = await launchIvrApp(dbPath, { fakeNow: afterCloseOn(sunday) })
    const page = await getPage(app)
    await seedBackground(page, sessionsAgo(friday) + 1)
    await setIvSeries(page, background(sessionsAgo(friday)))

    await collectIvrNow(page)

    const koRows = await readIv30History(page)
    const newest = koRows.filter((row) => row.underlying === 'KO').at(-1)
    expect(newest?.session).toBe(friday)
    expect(newest?.observed_at).toBe(sessionCloseOn(friday))
  })

  it('The scheduled run still fires after hours on a weekday', async () => {
    dbPath = tmpDb('wb-e2e-us100-scheduled-weekday')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page, 1)
    await setIvSeries(page, background(0))

    const batch = await collectIvrScheduled(page)

    expect(batch.successCount).toBe(2)
    expect(await requestedUnderlyings(page)).toEqual(['KO', 'MSFT'])
    const todayRows = (await readIv30History(page)).filter((row) => row.session === FAKE_NOW_DAY)
    expect(todayRows.map((row) => row.underlying)).toEqual(['KO', 'MSFT'])
  })
})
