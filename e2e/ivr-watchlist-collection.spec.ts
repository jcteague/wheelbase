// [US-97] IVR collection covers watchlist underlyings — E2E tests.
//
// Each `it()` maps to exactly one acceptance criterion from
// docs/epics/08-stories/US-97-collect-ivr-for-watchlist-underlyings.md (one renamed for
// US-121, noted below). The collector half boots the app with a fake IV series
// (WHEELBASE_FAKE_IV_SERIES), seeds the watchlist and positions through production IPC
// only, and drives the real `ivr-collect` job via the manual-trigger channel — so no live
// market-data request ever leaves the process. The screener half proves the payoff: a
// bench name with no position at all has a real IV rank on its card, and the US-67 floor
// can act on it. [US-96] That card lives on the Watchlist page.
//
// [US-121] Seeding a ticker backfills it on the spot (US-100). So each batch scenario
// seeds series that stop at the previous session, lets the backfills land, then extends
// the series through today: what the batch collects is exactly today's session for each
// ticker it targets, and a ticker it does not target makes no bar request at all.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, getPage, tmpDb } from './assignment-helpers'
import {
  FAKE_NOW_DAY,
  collectIvrNow,
  launchIvrApp,
  readIv30History,
  removeFromWatchlist,
  requestedUnderlyings,
  seedActivePosition,
  seedClosedPosition,
  seedWatchlist,
  seriesForRank,
  setIvSeries,
  waitForIvHistory,
  type FakeIvSeries,
  type FakeIvSeriesFixture
} from './ivr-helpers'
import {
  RANKED_PUTS,
  cardReason,
  ivrCell,
  launchScreener,
  listPositions,
  openCriteriaSheet,
  saveCriteria,
  setCriteriaValues,
  waitForBenchCard,
  waitForCriteriaSheetClosed,
  waitForMeetsCardCount
} from './screener-helpers'

/** Just the KO chain, so the screener scenarios have exactly one bench candidate. */
const KO_ONLY = RANKED_PUTS.filter((fixture) => fixture.ticker === 'KO')

const TARGET_RANKS = { KO: 38, AAPL: 44, XYZ: 51, MSFT: 27 }

/** Series for each ticker, complete through the session `endingSessionsAgo` before
 *  FAKE_NOW_DAY. */
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

/** Tickers with a reading for today's session. */
async function collectedToday(page: Page): Promise<string[]> {
  return (await readIv30History(page))
    .filter((row) => row.session === FAKE_NOW_DAY)
    .map((row) => row.underlying)
}

/** Seeds the collection targets shared by several ACs — KO/AAPL/XYZ on the watchlist plus
 *  MSFT held as an active position — with history through the previous session, then
 *  publishes today's bars. Pass `overrides` to swap in a different series for the ticker
 *  under test *after* the backfills have landed. */
async function seedCollectionTargets(
  page: Page,
  overrides: Partial<Record<keyof typeof TARGET_RANKS, FakeIvSeries>> = {}
): Promise<void> {
  await setIvSeries(page, seriesEnding(TARGET_RANKS, 1))
  await seedWatchlist(page, ['KO', 'AAPL', 'XYZ'])
  await seedActivePosition(page, 'MSFT')
  await waitForIvHistory(page, ['AAPL', 'KO', 'MSFT', 'XYZ'])
  await setIvSeries(page, { ...seriesEnding(TARGET_RANKS, 0), ...overrides })
}

/** [US-97] The whole point of the story: these candidates are collected with no
 *  position in the database at all. Asserted rather than assumed, so re-introducing
 *  the old throwaway-position harness workaround cannot make these ACs pass for the
 *  wrong reason. */
async function expectNoPositions(page: Page): Promise<void> {
  expect(await listPositions(page)).toEqual([])
}

describe('US-97: IVR collection covers watchlist underlyings', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('AC: Watchlist underlyings are collected alongside held positions', async () => {
    dbPath = tmpDb('wb-e2e-us97-union')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedCollectionTargets(page)

    const batch = await collectIvrNow(page)

    expect(batch).toEqual({
      successCount: 4,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: null
    })
    expect(await collectedToday(page)).toEqual(['AAPL', 'KO', 'MSFT', 'XYZ'])
  })

  it('AC: A watchlisted ticker with only a closed position is still collected', async () => {
    dbPath = tmpDb('wb-e2e-us97-closed')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await setIvSeries(page, seriesEnding({ KO: 38, TSLA: 55 }, 1))
    await seedClosedPosition(page, 'KO')
    await seedWatchlist(page, ['KO'])
    // The discriminating seed: TSLA is CLOSED and NOT watchlisted, and has bars for today
    // — if the status filter were ever dropped from the union query, TSLA would be
    // requested and persist today's reading, failing all three assertions below.
    await seedClosedPosition(page, 'TSLA')
    await waitForIvHistory(page, ['KO', 'TSLA'])
    await setIvSeries(page, seriesEnding({ KO: 38, TSLA: 55 }, 0))

    const batch = await collectIvrNow(page)

    expect(batch.successCount).toBe(1)
    expect(await collectedToday(page)).toEqual(['KO'])
    expect(await requestedUnderlyings(page)).toEqual(['KO'])
  })

  it('AC: A ticker that is both held and watchlisted is collected once', async () => {
    dbPath = tmpDb('wb-e2e-us97-once')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await setIvSeries(page, seriesEnding({ AAPL: 44 }, 1))
    await seedActivePosition(page, 'AAPL')
    await seedWatchlist(page, ['AAPL'])
    await waitForIvHistory(page, ['AAPL'])
    await setIvSeries(page, seriesEnding({ AAPL: 44 }, 0))

    const batch = await collectIvrNow(page)

    // The summary counts tickers, not rows — a second visit would read 2 here, and would
    // show up as a second stock-bar request.
    expect(batch.successCount).toBe(1)
    expect(await collectedToday(page)).toEqual(['AAPL'])
    expect(await requestedUnderlyings(page)).toEqual(['AAPL'])
  })

  // [US-121] Renamed from "…with no IVR coverage is skipped, not failed": a ticker is no
  // longer "covered" by a vendor. One with no bar data simply gathers no readings.
  it('AC: A watchlist ticker with no bar data → n/a, others unaffected', async () => {
    dbPath = tmpDb('wb-e2e-us97-skipped')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await setIvSeries(page, seriesEnding({ KO: 38, AAPL: 44, MSFT: 27 }, 1))
    await seedWatchlist(page, ['KO', 'AAPL', 'XYZ'])
    await seedActivePosition(page, 'MSFT')
    await waitForIvHistory(page, ['AAPL', 'KO', 'MSFT', 'XYZ'])
    await setIvSeries(page, seriesEnding({ KO: 38, AAPL: 44, MSFT: 27 }, 0))

    const batch = await collectIvrNow(page)

    // XYZ is visited and finds nothing to read — not a failure.
    expect(batch.errorCount).toBe(0)
    expect(batch.skippedReason).toBeNull()
    expect(await collectedToday(page)).toEqual(['AAPL', 'KO', 'MSFT'])
    expect((await readIv30History(page)).some((row) => row.underlying === 'XYZ')).toBe(false)

    await page.evaluate(() => {
      location.hash = '#/watchlist'
    })
    await page.waitForSelector('[data-testid="watchlist-row-XYZ"]')
    const xyz = await ivrCell(page, 'XYZ')
    expect(xyz).toMatchObject({ text: 'n/a', state: 'empty' })
    expect((await ivrCell(page, 'KO')).text).toBe('38')
  })

  it('AC: One ticker failing does not suppress the others', async () => {
    dbPath = tmpDb('wb-e2e-us97-isolated')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedCollectionTargets(page, {
      KO: { ...seriesForRank(38), failWith: 'network_error' }
    })

    const batch = await collectIvrNow(page)

    expect(batch).toEqual({
      successCount: 3,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
    expect(await collectedToday(page)).toEqual(['AAPL', 'MSFT', 'XYZ'])
  })

  it('AC: Removing a ticker from the watchlist stops future collection', async () => {
    dbPath = tmpDb('wb-e2e-us97-removed')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await setIvSeries(page, seriesEnding({ KO: 38 }, 1))
    await seedWatchlist(page, ['KO'])
    await waitForIvHistory(page, ['KO'])
    const before = (await readIv30History(page)).length

    await removeFromWatchlist(page, 'KO')
    // Today's bars are published: if KO were still a target, today's reading would land.
    await setIvSeries(page, seriesEnding({ KO: 38 }, 0))
    const second = await collectIvrNow(page)

    expect(second.successCount).toBe(0)
    expect(await requestedUnderlyings(page)).toEqual([])
    expect(await collectedToday(page)).toEqual([])
    expect(await readIv30History(page)).toHaveLength(before)
  })

  it('AC: The manual collect-now trigger covers the watchlist too', async () => {
    dbPath = tmpDb('wb-e2e-us97-manual')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await setIvSeries(page, seriesEnding({ TSLA: 70 }, 1))
    await seedWatchlist(page, ['TSLA'])
    await waitForIvHistory(page, ['TSLA'])
    await setIvSeries(page, seriesEnding({ TSLA: 70 }, 0))

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('button:has-text("Refresh IVR now")')
    await page.click('button:has-text("Refresh IVR now")')
    await page.waitForSelector('text=IV history refresh complete: 1 tickers updated, 0 errors.')

    expect(await collectedToday(page)).toEqual(['TSLA'])
  })

  it('AC: A screened candidate shows a real IV rank instead of n/a', async () => {
    dbPath = tmpDb('wb-e2e-us97-screener-ivr')
    const launched = await launchScreener(dbPath, { fixtures: KO_ONLY, ivr: { KO: 38 } })
    app = launched.app
    const page = launched.page

    await waitForBenchCard(page, 'KO', 'meets')
    await expectNoPositions(page)

    // A fresh IVR cell reads as the bare rank; observation metadata stays in its tooltip.
    expect((await ivrCell(page, 'KO')).text).toBe('38')
  })

  it("AC: A populated IV rank lets the screener's IV floor apply to a bench name", async () => {
    dbPath = tmpDb('wb-e2e-us97-screener-floor')
    const launched = await launchScreener(dbPath, { fixtures: KO_ONLY, ivr: { KO: 22 } })
    app = launched.app
    const page = launched.page

    await waitForBenchCard(page, 'KO', 'meets')
    await expectNoPositions(page)

    await openCriteriaSheet(page, 'header')
    await page.click('[data-testid="iv-rank-floor-on"]')
    await setCriteriaValues(page, { minIvRank: '30' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    await waitForMeetsCardCount(page, 0)
    const reason = await cardReason(page, 'KO')
    // The reason embeds the observation date between the two halves
    // (`IV rank 22 (May 29) below 30`), so each half is matched separately.
    expect(reason).toMatch(/^IV rank 22 \(/)
    expect(reason).toContain('below 30')
  })
})
