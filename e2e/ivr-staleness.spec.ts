// [US-98] IV-rank staleness tiers — E2E tests.
//
// Each `it()` maps to exactly one acceptance criterion from
// docs/epics/08-stories/US-98-ivr-staleness-tiers.md, named verbatim. The suite boots
// the real Electron app, seeds IV ranks through the production collector over the
// US-44 fake-scraper seam, and reads the rendered screener — so every verdict on
// screen is one the real freshness engine produced from a real persisted row.
//
// Ages come from moving the *observation* back through sessions, not from moving the
// clock forward: advancing `now` would also shift every fixture's DTE, which is how a
// staleness spec quietly becomes a DTE-window spec. The two specs that must move the
// clock (AC2's morning, AC3's holiday) keep the fixture day fixed so DTE stays inside
// the default 30–45 window either way.
//
// AC5 ("A stale reading is muted and cannot satisfy an IV condition") and AC13
// ("Signal refuses to claim entry readiness on an unusable reading") are absent, not
// skipped: both assert on the watchlist Signal, which is US-96, and US-96 is not in
// this checkout. They are the story's remaining coverage, not coverage this file
// silently claims.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import { setIvrNow } from './ivr-helpers'
import {
  KO_PUT,
  excludedReason,
  launchScreener,
  openCriteriaSheet,
  rankedTickers,
  reloadScreener,
  rowScore,
  saveCriteria,
  screenerDate,
  setCriteriaValues,
  waitForCriteriaSheetClosed,
  type PutFixtureSpec
} from './screener-helpers'
import {
  BASE_DAY,
  afterCloseOn,
  morningOf,
  mostRecent,
  observedSessionsAgo,
  sessionsBefore,
  weekdayCalendar
} from './trading-day-fixtures'

const KO_ONLY = [KO_PUT]

/** The rendered IV-rank cell of a ranked row: what a trader sees, plus the state the
 *  engine assigned and the accessible age text. */
async function ivrCell(
  page: Page,
  ticker: string
): Promise<{ text: string; state: string | null; title: string | null }> {
  const row = `[data-testid="screener-row-${ticker}"]`
  const cell = page.locator(`${row} [data-testid="ivr-cell"]`)
  if ((await cell.count()) === 0) {
    const empty = page.locator(`${row} [data-ivr-state="empty"]`)
    return { text: (await empty.textContent())?.trim() ?? '', state: 'empty', title: null }
  }
  return {
    text: (await cell.textContent())?.trim() ?? '',
    state: await cell.getAttribute('data-ivr-state'),
    title: await cell.getAttribute('title')
  }
}

/** A clear next-earnings date — past every fixture's expiry, inside the screener's
 *  horizon — so an earnings-focused spec controls `last` without US-70's next-print
 *  rules also moving. */
const CLEAR_NEXT = screenerDate(60)

describe('US-98: IV-rank staleness tiers', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('A reading from the last close shows without an age qualifier', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac1')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 38, observedAt: observedSessionsAgo(0) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.text).toBe('38')
    // No age and no observation date on the face of a current reading.
    expect(cell.text).not.toMatch(/d$/)
    expect(cell.title).toContain('0 trading days old')
  })

  it("Friday's close is still fresh on Monday morning", async () => {
    dbPath = tmpDb('wb-e2e-us98-ac2')
    const monday = mostRecent(1)
    const priorSession = sessionsBefore(monday, 1) // the Friday before

    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: morningOf(monday),
      ivr: { KO: { ivr: 38, observedAt: afterCloseOn(priorSession) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    // Monday's session has not closed, so Friday's close is still the last one.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.title).toContain('0 trading days old')
    expect(cell.text).toBe('38')
  })

  it('An exchange holiday does not age a reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac3')
    const holiday = BASE_DAY
    const priorSession = sessionsBefore(holiday, 1)

    // Collect on the open day before the closure, then view on the closure itself —
    // seeding *on* the holiday would be a collection the guard must refuse.
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(priorSession),
      brokerCalendar: weekdayCalendar([holiday]),
      ivr: { KO: { ivr: 38, observedAt: afterCloseOn(priorSession) } }
    })
    app = launched.app
    const { page } = launched

    await setIvrNow(page, afterCloseOn(holiday))
    await reloadScreener(page)
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    // A day the exchange never opened closes no session, so nothing has aged.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.title).toContain('0 trading days old')
    expect(cell.text).toBe('38')
  })

  it('An aging reading shows its age but stays usable', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac4')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 38, observedAt: observedSessionsAgo(2) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('aging')
    expect(cell.text).toBe('38 · 2d')
    expect(cell.title).toContain('2 trading days old')
  })

  it('An expired reading is indistinguishable from no reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac6')
    const expired: PutFixtureSpec = { ...KO_PUT, ticker: 'KO' }
    const never: PutFixtureSpec = { ...KO_PUT, ticker: 'MSFT' }

    const launched = await launchScreener(dbPath, {
      fixtures: [expired, never],
      fakeNow: afterCloseOn(BASE_DAY),
      // MSFT is deliberately never collected.
      ivr: { KO: { ivr: 38, observedAt: observedSessionsAgo(12) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    const twelveSessionsOld = await ivrCell(page, 'KO')
    const neverCollected = await ivrCell(page, 'MSFT')

    expect(twelveSessionsOld.text).toBe('n/a')
    expect(twelveSessionsOld).toEqual(neverCollected)
  })

  it('An earnings print invalidates a reading regardless of age', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac7')
    const observationSession = sessionsBefore(BASE_DAY, 2)
    const printAfterIt = sessionsBefore(BASE_DAY, 1)

    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 62, observedAt: afterCloseOn(observationSession) } },
      earnings: { KO: { next: CLEAR_NEXT, last: printAfterIt } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    // Two sessions old is `aging` on time alone; the print outranks that.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('predates_earnings')
    expect(cell.text).toContain('62')
    expect(cell.text).toContain('predates earnings')
  })

  it('A print before the observation does not invalidate the reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac8')
    const observationSession = sessionsBefore(BASE_DAY, 1)
    const printBeforeIt = sessionsBefore(BASE_DAY, 6)

    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 62, observedAt: afterCloseOn(observationSession) } },
      earnings: { KO: { next: CLEAR_NEXT, last: printBeforeIt } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.text).toBe('62')
    expect(cell.text).not.toContain('predates earnings')
  })

  it('Missing earnings knowledge falls back to the time tiers alone', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac9')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 62, observedAt: observedSessionsAgo(1) } },
      earningsUnreachable: true
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    // An unreadable calendar is not evidence of a print, so the time tier stands —
    // and nothing on the row claims the reading survived one.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.text).toBe('62')
    expect(cell.text).not.toContain('predates earnings')
  })

  it('A stale IV rank never blocks a candidate from ranking', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac10')
    // One chain, three tickers: identical economics, three freshness states. Any
    // difference in rank or score would have to come from the IV rank.
    const fixtures: PutFixtureSpec[] = [
      { ...KO_PUT, ticker: 'KO' },
      { ...KO_PUT, ticker: 'AAPL' },
      { ...KO_PUT, ticker: 'MSFT' }
    ]

    const launched = await launchScreener(dbPath, {
      fixtures,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: {
        KO: { ivr: 38, observedAt: observedSessionsAgo(12) }, // expired
        AAPL: { ivr: 38, observedAt: observedSessionsAgo(0) } // usable
        // MSFT: never collected
      }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    expect(await rankedTickers(page)).toEqual(['AAPL', 'KO', 'MSFT'])
    const scores = await Promise.all(['KO', 'AAPL', 'MSFT'].map((ticker) => rowScore(page, ticker)))
    expect(new Set(scores).size).toBe(1)
    expect(await excludedReason(page, 'KO')).toBeNull()
  })

  it('The IV-rank floor is not applied to a stale reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac11')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 22, observedAt: observedSessionsAgo(6) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await setIvRankFloor(page, '50')

    // A *fresh* 22 would be excluded by this floor; a stale one is not measured
    // against it at all — but the trader still sees the number, muted, with its age.
    expect(await rankedTickers(page)).toEqual(['KO'])
    expect(await excludedReason(page, 'KO')).toBeNull()
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('stale')
    expect(cell.text).toBe('22 · 6d')
  })

  it('The IV-rank floor is not applied to an expired reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac12')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      ivr: { KO: { ivr: 22, observedAt: observedSessionsAgo(12) } }
    })
    app = launched.app
    const { page } = launched
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await setIvRankFloor(page, '50')

    expect(await rankedTickers(page)).toEqual(['KO'])
    expect(await excludedReason(page, 'KO')).toBeNull()
    expect((await ivrCell(page, 'KO')).text).toBe('n/a')
  })
})

/**
 * Turn the IV-rank floor on at `value` through the criteria sheet, as a trader would.
 *
 * Waits on the criteria chip rather than a row count: these specs assert that the row
 * count does *not* change, so waiting for it would resolve before the re-screen and
 * pass vacuously.
 */
async function setIvRankFloor(page: Page, value: string): Promise<void> {
  await openCriteriaSheet(page, 'header')
  await page.click('[data-testid="iv-rank-floor-on"]')
  await setCriteriaValues(page, { minIvRank: value })
  await saveCriteria(page)
  await waitForCriteriaSheetClosed(page)
  await page.waitForFunction((expected) => {
    const strip = document.querySelector('[data-testid="screener-criteria-strip"]')
    return strip?.textContent?.includes(expected) ?? false
  }, `IVR ≥ ${value}`)
}
