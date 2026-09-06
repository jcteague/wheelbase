// [US-97] IVR collection covers watchlist underlyings — E2E tests.
//
// Each `it()` maps to exactly one acceptance criterion from
// docs/epics/08-stories/US-97-collect-ivr-for-watchlist-underlyings.md. The collector
// half boots the app with the fake-IVR seam (WHEELBASE_FAKE_IVR), seeds the watchlist
// and positions through production IPC only, and drives the real `ivr-collect` job via
// the manual-trigger channel — so no live Barchart request ever leaves the process.
// The screener half proves the payoff: a bench name with no position at all now has a
// real IV rank on the ranked row, and the US-67 floor can act on it.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, getPage, tmpDb } from './assignment-helpers'
import {
  collectIvrNow,
  launchIvrApp,
  notAvailableOutcome,
  okOutcome,
  parseErrorOutcome,
  readIvrSnapshots,
  removeFromWatchlist,
  seedActivePosition,
  seedClosedPosition,
  seedWatchlist,
  setIvrOutcomes,
  type IvrOutcome
} from './ivr-helpers'
import {
  RANKED_PUTS,
  excludedReason,
  launchScreener,
  listPositions,
  openCriteriaSheet,
  rowCells,
  saveCriteria,
  setCriteriaValues,
  waitForCriteriaSheetClosed,
  waitForRankedRowCount
} from './screener-helpers'

const SAME_DAY_AFTERNOON = '2026-05-29T20:55:00Z'
const YESTERDAY_AFTERNOON = '2026-05-28T20:55:00Z'

/** The IV-rank column index in the ranked table — mirrors `const IVR = 9` in
 *  `e2e/screener-results.spec.ts`, which is where the full column map lives. */
const IVR = 9

/** Just the KO chain, so the screener scenarios have exactly one bench candidate. */
const KO_ONLY = RANKED_PUTS.filter((fixture) => fixture.ticker === 'KO')

/** Seeds the collection targets shared by several ACs: KO/AAPL/XYZ on the watchlist
 *  plus MSFT held as an active position, each defaulted to an ok outcome at
 *  `SAME_DAY_AFTERNOON`. Pass `overrides` to swap in a different outcome (e.g.
 *  not_available or parse_error) for the ticker under test. */
async function seedCollectionTargets(
  page: Page,
  overrides: Partial<Record<'KO' | 'AAPL' | 'XYZ' | 'MSFT', IvrOutcome>> = {}
): Promise<void> {
  await seedWatchlist(page, ['KO', 'AAPL', 'XYZ'])
  await seedActivePosition(page, 'MSFT')
  await setIvrOutcomes(page, {
    KO: okOutcome('KO', { ivr: 38, observedAt: SAME_DAY_AFTERNOON }),
    AAPL: okOutcome('AAPL', { ivr: 44, observedAt: SAME_DAY_AFTERNOON }),
    XYZ: okOutcome('XYZ', { ivr: 51, observedAt: SAME_DAY_AFTERNOON }),
    MSFT: okOutcome('MSFT', { ivr: 27, observedAt: SAME_DAY_AFTERNOON }),
    ...overrides
  })
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
    const rows = await readIvrSnapshots(page)

    expect(batch).toEqual({
      successCount: 4,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: null
    })
    expect(rows.map((row) => row.underlying)).toEqual(['AAPL', 'KO', 'MSFT', 'XYZ'])
  })

  it('AC: A watchlisted ticker with only a closed position is still collected', async () => {
    dbPath = tmpDb('wb-e2e-us97-closed')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedClosedPosition(page, 'KO')
    await seedWatchlist(page, ['KO'])
    // The discriminating seed: TSLA is CLOSED and NOT watchlisted, and is programmed
    // to succeed — if the status filter were ever dropped from the union query, TSLA
    // would be fetched and persist a row, failing both assertions below.
    await seedClosedPosition(page, 'TSLA')
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: SAME_DAY_AFTERNOON }),
      TSLA: okOutcome('TSLA', { ivr: 55, observedAt: SAME_DAY_AFTERNOON })
    })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch.successCount).toBe(1)
    expect(rows.map((row) => row.underlying)).toEqual(['KO'])
  })

  it('AC: A ticker that is both held and watchlisted is collected once', async () => {
    dbPath = tmpDb('wb-e2e-us97-once')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedActivePosition(page, 'AAPL')
    await seedWatchlist(page, ['AAPL'])
    await setIvrOutcomes(page, {
      AAPL: okOutcome('AAPL', { ivr: 44, observedAt: SAME_DAY_AFTERNOON })
    })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    // The summary counts fetches, not rows — a second fetch would read 2 here even
    // though `persistSnapshot` overwrites the same-UTC-day row.
    expect(batch.successCount).toBe(1)
    expect(rows.map((row) => row.underlying)).toEqual(['AAPL'])
  })

  it('AC: A watchlist ticker with no IVR coverage is skipped, not failed', async () => {
    dbPath = tmpDb('wb-e2e-us97-skipped')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedCollectionTargets(page, { XYZ: notAvailableOutcome('XYZ') })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch).toEqual({
      successCount: 3,
      errorCount: 0,
      skippedCount: 1,
      skippedReason: null
    })
    expect(rows.map((row) => row.underlying)).toEqual(['AAPL', 'KO', 'MSFT'])
  })

  it('AC: One ticker failing does not suppress the others', async () => {
    dbPath = tmpDb('wb-e2e-us97-isolated')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    // The e2e `IvrOutcome` union has no network_error variant; parse_error drives the
    // same `errorCount` + WARN branch of the collector, which is what the AC pins.
    await seedCollectionTargets(page, { KO: parseErrorOutcome() })

    const batch = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(batch).toEqual({
      successCount: 3,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
    expect(rows.map((row) => row.underlying)).toEqual(['AAPL', 'MSFT', 'XYZ'])
  })

  it('AC: Removing a ticker from the watchlist stops future collection', async () => {
    dbPath = tmpDb('wb-e2e-us97-removed')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedWatchlist(page, ['KO'])
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 38, observedAt: YESTERDAY_AFTERNOON })
    })
    await collectIvrNow(page)

    await removeFromWatchlist(page, 'KO')
    // Programmed to succeed: if KO were still a target, a fresh row would land.
    await setIvrOutcomes(page, {
      KO: okOutcome('KO', { ivr: 99, observedAt: SAME_DAY_AFTERNOON })
    })
    const second = await collectIvrNow(page)
    const rows = await readIvrSnapshots(page)

    expect(second.successCount).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      underlying: 'KO',
      observed_at: YESTERDAY_AFTERNOON,
      ivr: '38.0'
    })
  })

  it('AC: The manual collect-now trigger covers the watchlist too', async () => {
    dbPath = tmpDb('wb-e2e-us97-manual')
    app = await launchIvrApp(dbPath)
    const page = await getPage(app)

    await seedWatchlist(page, ['TSLA'])
    await setIvrOutcomes(page, {
      TSLA: okOutcome('TSLA', { ivr: 70, observedAt: SAME_DAY_AFTERNOON })
    })

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('button:has-text("Refresh IVR now")')
    await page.click('button:has-text("Refresh IVR now")')
    await page.waitForSelector('text=IVR refresh complete: 1 snapshots saved, 0 errors.')

    const rows = await readIvrSnapshots(page)
    expect(rows.map((row) => row.underlying)).toEqual(['TSLA'])
  })

  it('AC: A screened candidate shows a real IV rank instead of n/a', async () => {
    dbPath = tmpDb('wb-e2e-us97-screener-ivr')
    const launched = await launchScreener(dbPath, { fixtures: KO_ONLY, ivr: { KO: 38 } })
    app = launched.app
    const page = launched.page

    await page.waitForSelector('[data-testid="screener-row-KO"]')
    await expectNoPositions(page)
    const cells = await rowCells(page, 'KO')

    // The cell reads `38 (MMM d)` — the observation date follows the rank.
    expect(cells[IVR].trim()).toMatch(/^38\b/)
  })

  it("AC: A populated IV rank lets the screener's IV floor apply to a bench name", async () => {
    dbPath = tmpDb('wb-e2e-us97-screener-floor')
    const launched = await launchScreener(dbPath, { fixtures: KO_ONLY, ivr: { KO: 22 } })
    app = launched.app
    const page = launched.page

    await page.waitForSelector('[data-testid="screener-row-KO"]')
    await expectNoPositions(page)

    await openCriteriaSheet(page, 'header')
    await page.click('[data-testid="iv-rank-floor-on"]')
    await setCriteriaValues(page, { minIvRank: '30' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    await waitForRankedRowCount(page, 0)
    const reason = await excludedReason(page, 'KO')
    // The reason embeds the observation date between the two halves
    // (`IV rank 22.0 (May 29) below 30`), so each half is matched separately.
    expect(reason).toContain('IV rank 22.0')
    expect(reason).toContain('below 30')
  })
})
