// [US-100] IVR collected on watchlist add / position open, and outside market hours.
//
// One `it()` per acceptance scenario in Linear OPT-6, names verbatim. The suite boots
// the real Electron app with the fake-IVR seam enabled, drives the production add and
// create paths, and reads back both the persisted rows and the fake scraper's fetch log
// — the log being the only way to assert a fetch did *not* happen, since a ticker
// Barchart does not cover also writes no row.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, getPage, tmpDb } from './assignment-helpers'
import { ivrCell } from './screener-helpers'
import {
  collectIvrNow,
  collectIvrScheduled,
  launchIvrApp,
  networkErrorOutcome,
  notAvailableOutcome,
  okOutcome,
  readIvrFetchLog,
  readIvrSnapshots,
  removeFromWatchlist,
  seedActivePosition,
  seedBenchAndSettle,
  setIvrOutcomes,
  fakeNowAt
} from './ivr-helpers'
import {
  afterCloseOn,
  mostRecent,
  sessionCloseOn,
  sessionsBefore,
  weekdayCalendar,
  BASE_DAY
} from './trading-day-fixtures'

/**
 * Background for every scenario: an open CSP on MSFT and KO on the watchlist.
 *
 * Outcomes are programmed *before* seeding on purpose. Seeding now triggers collection,
 * so with nothing programmed the background tickers would come back `not_available` and
 * land no rows — and "KO already has a reading for the current trading day", which two
 * scenarios turn on, would be quietly false.
 */
async function seedBackground(page: Page, observedAt = afterCloseOn(BASE_DAY)): Promise<void> {
  await setIvrOutcomes(page, {
    KO: okOutcome('KO', { ivr: 38, observedAt }),
    MSFT: okOutcome('MSFT', { ivr: 44, observedAt })
  })
  await seedBenchAndSettle(page, { positions: ['MSFT'], watchlist: ['KO'] })
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
    await setIvrOutcomes(page, {
      AAPL: okOutcome('AAPL', { ivr: 62.5, observedAt: fakeNowAt('20:55:00.000Z') })
    })

    await addTickerViaForm(page, 'AAPL')

    await expect
      .poll(async () => (await readIvrSnapshots(page)).map((row) => row.underlying))
      .toContain('AAPL')

    // Without the ivr:snapshot-updated push the cell stays `n/a` until a reload, so
    // this assertion fails if the event is not wired — no reload happens here.
    await expect.poll(async () => (await ivrCell(page, 'AAPL')).state).not.toBe('empty')
    expect((await ivrCell(page, 'AAPL')).text).toContain('62.5')
  })

  it('Adding a ticker collects only that ticker', async () => {
    dbPath = tmpDb('wb-e2e-us100-only')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, {
      AAPL: okOutcome('AAPL', { ivr: 62.5, observedAt: fakeNowAt('20:55:00.000Z') })
    })

    await addTickerViaForm(page, 'AAPL')

    await expect.poll(() => readIvrFetchLog(page)).toEqual(['AAPL'])
  })

  it('Adding a ticker that already has a reading for the day does not refetch', async () => {
    dbPath = tmpDb('wb-e2e-us100-dedupe')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, {
      AAPL: okOutcome('AAPL', { ivr: 62.5, observedAt: fakeNowAt('20:55:00.000Z') })
    })

    await addTickerViaForm(page, 'AAPL')
    await expect
      .poll(async () => (await readIvrSnapshots(page)).map((row) => row.underlying))
      .toContain('AAPL')

    await removeFromWatchlist(page, 'AAPL')
    // A different value, so a refetch would be visible in the row as well as the log.
    await setIvrOutcomes(page, {
      AAPL: okOutcome('AAPL', { ivr: 11.1, observedAt: fakeNowAt('20:56:00.000Z') }),
      NVDA: okOutcome('NVDA', { ivr: 21, observedAt: fakeNowAt('20:56:00.000Z') })
    })

    await addTickerViaForm(page, 'AAPL')

    // Barrier: the assertion below is a negative, and the collect it must outlive is
    // detached. Adding a second, uncollected ticker through the same path and waiting
    // for *it* to reach the log proves the queue has drained — without this the test
    // passes under load whether or not the dedupe works.
    await addTickerViaForm(page, 'NVDA')
    await expect.poll(() => readIvrFetchLog(page)).toContain('NVDA')

    expect(await readIvrFetchLog(page)).not.toContain('AAPL')
    const aapl = (await readIvrSnapshots(page)).filter((row) => row.underlying === 'AAPL')
    expect(aapl).toHaveLength(1)
    expect(aapl[0].ivr).toBe('62.5')
  })

  it('The add succeeds even when the IVR fetch fails', async () => {
    dbPath = tmpDb('wb-e2e-us100-add-fails')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, { AAPL: networkErrorOutcome('AAPL') })

    await addTickerViaForm(page, 'AAPL')

    // The card is on the bench and nothing was surfaced to the trader. The warn-level
    // clause is pinned by src/main/services/ivr-on-demand.test.ts — the e2e suite has
    // no log seam.
    expect(await page.locator('[data-testid="watchlist-row-AAPL"]').isVisible()).toBe(true)
    expect(await page.locator('[role="alert"]').count()).toBe(0)
    await expect.poll(() => readIvrFetchLog(page)).toContain('AAPL')
    expect((await readIvrSnapshots(page)).map((row) => row.underlying)).not.toContain('AAPL')
  })

  it('A ticker Barchart does not cover is added without an IV rank', async () => {
    dbPath = tmpDb('wb-e2e-us100-uncovered')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, { XYZ: notAvailableOutcome('XYZ') })

    await addTickerViaForm(page, 'XYZ')

    await expect.poll(() => readIvrFetchLog(page)).toContain('XYZ')
    const cell = await ivrCell(page, 'XYZ')
    expect(cell.state).toBe('empty')
    expect(cell.text).toBe('n/a')
  })

  it('Opening a position collects its IVR immediately', async () => {
    dbPath = tmpDb('wb-e2e-us100-position')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, {
      TSLA: okOutcome('TSLA', { ivr: 71.2, observedAt: fakeNowAt('20:55:00.000Z') })
    })

    await seedActivePosition(page, 'TSLA')

    await expect
      .poll(async () => (await readIvrSnapshots(page)).map((row) => row.underlying))
      .toContain('TSLA')
    expect(await readIvrFetchLog(page)).toEqual(['TSLA'])
  })

  it('Opening a position for an already-collected ticker does not refetch', async () => {
    dbPath = tmpDb('wb-e2e-us100-position-dedupe')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    // KO already has this session's reading. Programming a *different* value resets the
    // log and makes a refetch visible in the row as well as in the log.
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 99, observedAt: afterCloseOn(BASE_DAY) })
    })

    await seedActivePosition(page, 'KO')

    // Let the detached collect finish before asserting it did not fetch: seed another
    // ticker through the same path and wait for *that* one to appear in the log.
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 99, observedAt: afterCloseOn(BASE_DAY) }),
      TSLA: okOutcome('TSLA', { ivr: 12, observedAt: afterCloseOn(BASE_DAY) })
    })
    await seedActivePosition(page, 'TSLA')
    await expect.poll(() => readIvrFetchLog(page)).toContain('TSLA')

    expect(await readIvrFetchLog(page)).not.toContain('KO')
    const ko = (await readIvrSnapshots(page)).filter((row) => row.underlying === 'KO')
    expect(ko).toHaveLength(1)
    expect(ko[0].ivr).toBe('38.0')
  })

  it('The position is created even when the IVR fetch fails', async () => {
    dbPath = tmpDb('wb-e2e-us100-position-fails')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, { TSLA: networkErrorOutcome('TSLA') })

    const positionId = await seedActivePosition(page, 'TSLA')

    expect(positionId).toBeTruthy()
    await expect.poll(() => readIvrFetchLog(page)).toContain('TSLA')
    expect((await readIvrSnapshots(page)).map((row) => row.underlying)).not.toContain('TSLA')
  })

  it('Manual refresh works on a weekend', async () => {
    dbPath = tmpDb('wb-e2e-us100-weekend')
    const sunday = mostRecent(0)
    app = await launchIvrApp(dbPath, { fakeNow: afterCloseOn(sunday) })
    const page = await getPage(app)
    await seedBackground(page, afterCloseOn(sunday))
    // Re-programming resets the fetch log, so what follows is only this refresh's work.
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: afterCloseOn(sunday) }),
      MSFT: okOutcome('MSFT', { ivr: 44, observedAt: afterCloseOn(sunday) })
    })

    const batch = await collectIvrNow(page)

    expect(batch.skippedReason).toBeNull()
    expect(batch.successCount).toBe(2)
    const log = await readIvrFetchLog(page)
    expect(log).toContain('KO')
    expect(log).toContain('MSFT')
  })

  it('Manual refresh works on a weekday market holiday', async () => {
    dbPath = tmpDb('wb-e2e-us100-holiday')
    const holiday = sessionsBefore(BASE_DAY, 2)
    app = await launchIvrApp(dbPath, {
      fakeNow: afterCloseOn(holiday),
      marketCalendar: weekdayCalendar([holiday])
    })
    const page = await getPage(app)
    await seedBackground(page, afterCloseOn(holiday))
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: afterCloseOn(holiday) }),
      MSFT: okOutcome('MSFT', { ivr: 44, observedAt: afterCloseOn(holiday) })
    })

    const batch = await collectIvrNow(page)

    expect(batch.skippedReason).toBeNull()
    const log = await readIvrFetchLog(page)
    expect(log).toContain('KO')
    expect(log).toContain('MSFT')
  })

  it('A weekend reading is stored against the trading day it belongs to', async () => {
    dbPath = tmpDb('wb-e2e-us100-weekend-stamp')
    const sunday = mostRecent(0)
    const friday = sessionsBefore(sunday, 1)
    app = await launchIvrApp(dbPath, { fakeNow: afterCloseOn(sunday) })
    const page = await getPage(app)
    await seedBackground(page, afterCloseOn(sunday))
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: afterCloseOn(sunday) }),
      MSFT: okOutcome('MSFT', { ivr: 44, observedAt: afterCloseOn(sunday) })
    })

    await collectIvrNow(page)

    const koRows = (await readIvrSnapshots(page)).filter((row) => row.underlying === 'KO')
    expect(koRows).toHaveLength(1)
    expect(koRows[0].observed_at).toBe(sessionCloseOn(friday))
  })

  it('The scheduled run still skips a weekend', async () => {
    dbPath = tmpDb('wb-e2e-us100-scheduled-weekend')
    const saturday = mostRecent(6)
    app = await launchIvrApp(dbPath, { fakeNow: afterCloseOn(saturday) })
    const page = await getPage(app)
    await seedBackground(page, afterCloseOn(saturday))
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: afterCloseOn(saturday) }),
      MSFT: okOutcome('MSFT', { ivr: 44, observedAt: afterCloseOn(saturday) })
    })

    const batch = await collectIvrScheduled(page)

    expect(batch.skippedReason).toBe('market_closed')
    expect(await readIvrFetchLog(page)).toEqual([])
  })

  it('The scheduled run still fires after hours on a weekday', async () => {
    dbPath = tmpDb('wb-e2e-us100-scheduled-weekday')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)
    await seedBackground(page)
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: fakeNowAt('20:55:00.000Z') }),
      MSFT: okOutcome('MSFT', { ivr: 44, observedAt: fakeNowAt('20:55:00.000Z') })
    })

    const batch = await collectIvrScheduled(page)

    expect(batch.successCount).toBe(2)
    const log = await readIvrFetchLog(page)
    expect(log).toContain('KO')
    expect(log).toContain('MSFT')
  })
})
