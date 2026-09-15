// [US-98] IV-rank staleness tiers — E2E tests.
//
// Each `it()` maps to exactly one acceptance criterion from
// docs/epics/08-stories/US-98-ivr-staleness-tiers.md, named verbatim. The suite boots
// the real Electron app, seeds IV ranks through the production collector over the
// US-44 fake-scraper seam, and reads the rendered bench — so every verdict on
// screen is one the real freshness engine produced from a real persisted row.
//
// [US-96] The readings moved onto the Watchlist page's cards, where each one draws its
// tier as a ring beside the numeral. The tier is read off `freshness-ring[data-state]`
// and the age off the cell's accessible label, which is where the retired `title`
// attribute's wording went when the hover tooltip replaced it.
//
// Ages come from moving the *observation* back through sessions, not from moving the
// clock forward: advancing `now` would also shift every fixture's DTE, which is how a
// staleness spec quietly becomes a DTE-window spec. The two specs that must move the
// clock (AC2's morning, AC3's holiday) keep the fixture day fixed so DTE stays inside
// the default 30–45 window either way.
//
// AC5 and AC13 assert on the bench's own verdicts, which had no surface until US-96
// folded the screener into the Watchlist page. Both are covered here now. US-98 wrote
// them against a "Signal" that reported "Entry ready"; that concept shipped as the
// per-gate verdict and the "Meets criteria" section, so the tests read the vocabulary
// that exists while asserting exactly what the scenarios describe.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import { setIvrNow } from './ivr-helpers'
import {
  KO_PUT,
  cardReason,
  cardScore,
  hoverIvrRing,
  ivrCell,
  launchScreener,
  meetsTickers,
  openCriteriaSheet,
  reloadBench,
  saveCriteria,
  screenerDate,
  setCriteriaValues,
  waitForBenchCard,
  waitForCriteriaSheetClosed,
  waitingTickers,
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
    await waitForBenchCard(page, 'KO', 'meets')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
    expect(cell.text).toBe('38')
    // No age and no observation date on the face of a current reading.
    expect(cell.text).not.toMatch(/d$/)
    expect(cell.label).toContain('0 trading days old')
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
    await waitForBenchCard(page, 'KO', 'meets')

    // Monday's session has not closed, so Friday's close is still the last one.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
    expect(cell.label).toContain('0 trading days old')
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
      marketCalendar: weekdayCalendar([holiday]),
      ivr: { KO: { ivr: 38, observedAt: afterCloseOn(priorSession) } }
    })
    app = launched.app
    const { page } = launched

    await setIvrNow(page, afterCloseOn(holiday))
    await reloadBench(page)
    await waitForBenchCard(page, 'KO', 'meets')

    // A day the exchange never opened closes no session, so nothing has aged.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
    expect(cell.label).toContain('0 trading days old')
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
    await waitForBenchCard(page, 'KO', 'meets')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('aging')
    expect(cell.ring).toBe('aging')
    expect(cell.text).toBe('38 · 2d')
    expect(cell.label).toContain('2 trading days old')
  })

  // [US-96] The bench is where an IV condition is judged, so this is the first release
  // in which the scenario has a surface at all.
  it('A stale reading is muted and cannot satisfy an IV condition', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac5')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      conditions: { KO: { ivrTrigger: 50 } },
      ivr: { KO: { ivr: 58, observedAt: observedSessionsAgo(6) } }
    })
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO', 'waiting')

    // Muted, with its age on the face and a half-full ring.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('stale')
    expect(cell.ring).toBe('stale')
    expect(cell.text).toBe('58 · 6d')

    // 58 clears 50 on the arithmetic alone. The reading is simply not fit to decide it,
    // so the condition reads unknown rather than met — and KO is held back.
    expect(await meetsTickers(page)).toEqual([])
    expect(await cardReason(page, 'KO')).toBe('IV too old to judge')

    await hoverIvrRing(page, 'KO')
    const tooltip = await page.locator('[data-testid="ivr-tooltip"]').textContent()
    expect(tooltip).toContain('6 trading days old')
    expect(tooltip).toContain('cannot satisfy an IV condition')
  })

  it('An expired reading shows exp and behaves as no reading', async () => {
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
    await waitForBenchCard(page, 'KO', 'meets')

    const twelveSessionsOld = await ivrCell(page, 'KO')
    const neverCollected = await ivrCell(page, 'MSFT')

    // [US-96] The reading exists but has aged out of use, which `n/a` — never collected
    // at all — cannot say. It still *decides* nothing, which is the AC's real claim.
    expect(twelveSessionsOld.text).toBe('exp')
    expect(twelveSessionsOld.state).toBe('expired')
    expect(twelveSessionsOld.ring).toBe('expired')
    expect(neverCollected.text).toBe('n/a')
    expect(neverCollected.ring).toBeNull()
    // Neither reading blocks its candidate, and neither satisfies anything.
    expect(await meetsTickers(page)).toEqual(['KO', 'MSFT'])
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
    await waitForBenchCard(page, 'KO', 'meets')

    // Two sessions old is `aging` on time alone; the print outranks that.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('predates_earnings')
    // [US-96] The verdict is the gold ring now, not a caption beside the number.
    expect(cell.ring).toBe('predates_earnings')
    expect(cell.text).toContain('62')
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
    await waitForBenchCard(page, 'KO', 'meets')

    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
    expect(cell.text).toBe('62')
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
    await waitForBenchCard(page, 'KO', 'meets')

    // An unreadable calendar is not evidence of a print, so the time tier stands —
    // and nothing on the card claims the reading survived one.
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
    expect(cell.text).toBe('62')
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
    await waitForBenchCard(page, 'KO', 'meets')

    expect(await meetsTickers(page)).toEqual(['AAPL', 'KO', 'MSFT'])
    const scores = await Promise.all(
      ['KO', 'AAPL', 'MSFT'].map((ticker) => cardScore(page, ticker))
    )
    expect(new Set(scores).size).toBe(1)
    expect(await cardReason(page, 'KO')).toBeNull()
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
    await waitForBenchCard(page, 'KO', 'meets')

    await setIvRankFloor(page, '50')

    // A *fresh* 22 would be excluded by this floor; a stale one is not measured
    // against it at all — but the trader still sees the number, muted, with its age.
    expect(await meetsTickers(page)).toEqual(['KO'])
    expect(await cardReason(page, 'KO')).toBeNull()
    const cell = await ivrCell(page, 'KO')
    expect(cell.state).toBe('stale')
    expect(cell.ring).toBe('stale')
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
    await waitForBenchCard(page, 'KO', 'meets')

    await setIvRankFloor(page, '50')

    expect(await meetsTickers(page)).toEqual(['KO'])
    expect(await cardReason(page, 'KO')).toBeNull()
    expect((await ivrCell(page, 'KO')).text).toBe('exp')
  })

  // [US-96] "Signal" and "Entry ready" shipped as the per-gate verdict and the "Meets
  // criteria" section. The scenario's claim is unchanged: a stock whose only obstacle is
  // an IV condition no usable reading can judge must not be presented as ready to sell.
  it('Signal refuses to claim entry readiness on an unusable reading', async () => {
    dbPath = tmpDb('wb-e2e-us98-ac13')
    const launched = await launchScreener(dbPath, {
      fixtures: KO_ONLY,
      fakeNow: afterCloseOn(BASE_DAY),
      // The IV condition is KO's only gate: no price target, no earnings gate.
      conditions: { KO: { ivrTrigger: 40 } },
      ivr: { KO: { ivr: 58, observedAt: observedSessionsAgo(6) } }
    })
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO', 'waiting')

    // A qualifying put exists and every other gate passes, so only the unusable reading
    // is keeping KO out. It must keep it out.
    expect(await meetsTickers(page)).toEqual([])
    expect(await waitingTickers(page)).toEqual(['KO'])
    expect(await cardReason(page, 'KO')).toBe('IV too old to judge')
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
