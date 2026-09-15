// [US-116] Market facts come from the market-data provider, not the broker.
//
// One `it()` per acceptance scenario from Linear OPT-8, named in the scenario's own
// language. The Background is "market-data credentials saved, no broker credentials
// saved", which `marketDataWithoutBroker` expresses: no activated broker rows, but a
// usable env-fallback key pair, so `activeBrokerEnv` reads 'none' while
// `CredentialStatus.marketData` reads 'configured'.
//
// Two scenarios need "the trading calendar has never been fetched" *and* a recorded IV
// reading. Only the collector can write a reading, and it refreshes the calendar on the
// same run — so those specs launch with the calendar seam failing, let the collector
// persist the reading against an empty `trading_session`, then clear the fault and open
// the bench. What the bench does next is exactly what the scenario is about.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import {
  AAPL_PUT_180,
  CLOSED_SESSION,
  REGULAR_SESSION,
  cleanupDb,
  getPage,
  getPendingAssignments,
  goToPositionsList,
  launchApp,
  makeOpasn,
  runDetectionNow,
  seedCsp,
  tmpDb
} from './assignment-helpers'
import { localToday } from './dates'
import { collectIvrNow, marketCalendarFetches, setIvrNow, tradingSessionCount } from './ivr-helpers'
import {
  KO_PUT,
  ivrCell,
  launchScreener,
  meetsTickers,
  reloadBench,
  selectCard,
  setMarketCalendarError,
  waitForBenchCard,
  type PutFixtureSpec,
  type ScreenerLaunchOpts
} from './screener-helpers'
import { afterCloseOn, daysAfterBaseDay, observedSessionsAgo } from './trading-day-fixtures'

/** One stock is enough for every scenario here: the story is about where a market fact
 *  comes from, not about how many rows the bench can rank. */
const BENCH: PutFixtureSpec[] = [KO_PUT]

const KO_THESIS = 'Dividend aristocrat — accumulate under $60'

/** A reading recorded at the previous close, which the freshness engine calls fresh once
 *  it has a calendar to age it against, and cannot judge at all without one. */
const KO_AT_PREVIOUS_CLOSE = { KO: { ivr: 58, observedAt: observedSessionsAgo(1) } }

/** The Background: market-data credentials, no broker. */
function background(overrides: ScreenerLaunchOpts = {}): ScreenerLaunchOpts {
  return {
    fixtures: BENCH,
    marketDataWithoutBroker: true,
    watchlistNotes: { KO: KO_THESIS },
    ivr: KO_AT_PREVIOUS_CLOSE,
    ...overrides
  }
}

/** Wait for the pill to settle on `display`. Auto-retrying rather than a single read: the
 *  header renders immediately with its fallback state, so reading once races the query.
 *  A disabled query never converges on the fixture value, which is the point. */
async function expectPill(
  page: Page,
  display: 'LIVE' | 'EXT' | 'CLOSED' | 'DELAYED'
): Promise<void> {
  await page.waitForSelector(`[data-testid="market-status-pill"]:has-text("${display}")`)
}

describe('US-116: market facts come from the market-data provider, not the broker', () => {
  let app: ElectronApplication
  let dbPath = ''

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  /** Launch into the Background with the calendar unreachable, so the reading lands
   *  against an empty `trading_session`; then clear the fault. The bench has not been
   *  re-opened yet, so nothing has had a chance to fetch a calendar. */
  async function launchWithNoCalendarYet(prefix: string): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(
      dbPath,
      background({ marketCalendarError: 'network_error' })
    )
    app = launched.app
    expect(await tradingSessionCount(launched.page)).toBe(0)
    await setMarketCalendarError(app, null)
    return launched.page
  }

  it('IV rank is judged without a broker', async () => {
    const page = await launchWithNoCalendarYet('wb-e2e-us116-ac1')

    await reloadBench(page)
    await waitForBenchCard(page, 'KO')

    // The ring is the whole claim: it can only render from a calendar the bench fetched
    // itself, through the market-data provider, with no broker attached.
    expect(await ivrCell(page, 'KO')).toMatchObject({ text: '58', ring: 'fresh' })
  })

  it('The market-status pill resolves without a broker', async () => {
    // Two opposite fixtures, because a *disabled* status query is not visibly unresolved:
    // `deriveMarketStatusDisplay` falls back to the renderer's own NYSE calendar, which
    // would read LIVE all by itself during market hours. The wall clock cannot be both
    // regular and closed, so the pair fails whenever the query is not actually running —
    // whatever time the suite runs at.
    dbPath = tmpDb('wb-e2e-us116-ac2-regular')
    const regular = await launchScreener(dbPath, background())
    app = regular.app
    await expectPill(regular.page, 'LIVE')

    await app.close()
    cleanupDb(dbPath)

    dbPath = tmpDb('wb-e2e-us116-ac2-closed')
    const closed = await launchScreener(dbPath, background({ marketStatus: CLOSED_SESSION }))
    app = closed.app
    await expectPill(closed.page, 'CLOSED')
  })

  it('A fresh install does not wait for the nightly collection', async () => {
    const page = await launchWithNoCalendarYet('wb-e2e-us116-ac3')

    await reloadBench(page)
    await waitForBenchCard(page, 'KO')

    // No collection ran between clearing the fault and this assertion — opening the
    // bench is the only thing that could have filled the calendar. Exactly one fetch,
    // not two: the snapshot and the screen race for it on an empty calendar, and the
    // store's in-flight promise is what collapses them.
    expect(await tradingSessionCount(page)).toBeGreaterThan(0)
    expect(await marketCalendarFetches(page)).toBe(1)
    expect(await ivrCell(page, 'KO')).toMatchObject({ text: '58', ring: 'fresh' })
  })

  it('The calendar is not refetched on every render', async () => {
    dbPath = tmpDb('wb-e2e-us116-ac4')
    // Seeding runs the collector, which fetches the calendar for today.
    const launched = await launchScreener(dbPath, background())
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO')
    const afterFirstOpen = await marketCalendarFetches(page)

    await reloadBench(page)
    await waitForBenchCard(page, 'KO')
    await reloadBench(page)
    await waitForBenchCard(page, 'KO')

    // Coverage already reaches 400 days out, so the throttle should skip every one of
    // these opens — not merely most of them.
    expect(await marketCalendarFetches(page)).toBe(afterFirstOpen)
  })

  it('A calendar failure degrades IV freshness only', async () => {
    dbPath = tmpDb('wb-e2e-us116-ac5')
    const launched = await launchScreener(
      dbPath,
      background({ marketCalendarError: 'network_error' })
    )
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO')

    // The trader's own work and the live quote both survive: only the reading's age is
    // unknowable without a calendar.
    const card = page.locator('[data-testid="watchlist-row-KO"]')
    expect(await card.locator('[data-testid="watchlist-ticker"]').innerText()).toContain('KO')
    expect(await card.locator('[data-testid="watchlist-price"]').innerText()).not.toBe('—')
    expect(await ivrCell(page, 'KO')).toMatchObject({ text: 'n/a' })

    // KO still meets its criteria here, and a meets-card spends that line on the condition
    // it met (US-96) — so the thesis is read where such a card shows it, on the detail
    // panel. Either way the trader's own words outlive the failure.
    await selectCard(page, 'KO')
    expect(await page.locator('[data-testid="bench-detail-thesis"]').innerText()).toBe(KO_THESIS)

    // Nothing is surfaced to the trader — the failure is a warn in the main-process log,
    // which `trading-calendar-store.test.ts` pins.
    expect(await page.locator('[data-testid="screener-unavailable"]').count()).toBe(0)
    expect(await page.locator('[role="alert"]').count()).toBe(0)
  })

  it('A calendar failure is not reported as a market-data outage', async () => {
    dbPath = tmpDb('wb-e2e-us116-ac6')
    const launched = await launchScreener(
      dbPath,
      background({ marketCalendarError: 'network_error' })
    )
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO', 'meets')

    // Quotes and chains served normally, so the screen is `ok` and KO is still judged —
    // `provider_unavailable` stays reserved for a real outage.
    expect(await page.locator('[data-testid="screener-unavailable"]').count()).toBe(0)
    expect(await page.textContent('body')).not.toContain('Market data unavailable')
    expect(await meetsTickers(page)).toContain('KO')
  })

  it('Assignment detection still requires a broker', async () => {
    dbPath = tmpDb('wb-e2e-us116-ac7')
    // The exact fixture that DOES raise an assignment banner when a broker is attached —
    // `assignment-detection.spec.ts` pins that. Here the only difference is the missing
    // broker, so an empty result is the guard working rather than a fixture that could
    // never have detected anything.
    app = await launchApp(dbPath, {
      activities: [makeOpasn(AAPL_PUT_180, { transactionTime: `${localToday()}T08:00:00Z` })],
      marketStatus: REGULAR_SESSION,
      marketDataWithoutBroker: true
    })
    const page = await getPage(app)
    await seedCsp(page, AAPL_PUT_180)

    // Runs the registered detect-assignments job, guard and all.
    await runDetectionNow(page)
    await goToPositionsList(page)
    await page.waitForSelector(`text=${AAPL_PUT_180.ticker}`)

    expect(await getPendingAssignments(page)).toEqual([])
    expect(await page.locator('[data-testid^="pending-assignment-indicator-"]').count()).toBe(0)
    expect(await page.textContent('body')).not.toContain('Assignment detected')

    // And the absence is not dressed up as a market-data problem: the session still
    // resolves, and nothing asks the trader to go and check their Alpaca key.
    await expectPill(page, 'LIVE')
    expect(await page.textContent('body')).not.toContain('Alpaca authentication failed')
    expect(await page.textContent('body')).not.toContain('Market data unavailable')
  })

  it('Collection still refreshes the calendar on its own schedule', async () => {
    dbPath = tmpDb('wb-e2e-us116-ac8')
    // Seeding runs the collector, which fetches the calendar covering 400 days ahead.
    const launched = await launchScreener(dbPath, background())
    app = launched.app
    const { page } = launched
    await waitForBenchCard(page, 'KO')
    const beforeCollection = await marketCalendarFetches(page)

    // Eight days on, that coverage has decayed past the seven-day refresh interval —
    // "the trading calendar was last fetched eight days ago", expressed the only way the
    // store can express it, since every refresh writes the same 400-day window.
    await setIvrNow(page, afterCloseOn(daysAfterBaseDay(8)))
    await collectIvrNow(page)

    expect(await marketCalendarFetches(page)).toBeGreaterThan(beforeCollection)
  })
})
