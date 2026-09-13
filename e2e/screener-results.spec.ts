// [US-66] Display ranked screener results with key metrics — E2E tests.
//
// Exactly one `it()` per acceptance-criteria bullet in
// docs/epics/08-stories/US-66-display-ranked-results.md; the names mirror the
// Gherkin scenarios. Every assertion runs against the real app: the fake market-data
// provider serves the put chains, the US-65 engine scores them, and the renderer
// formats what it emits — nothing between the two is stubbed.
//
// [US-96] The ranked table is gone. The same results are now the Meets-criteria half of
// the bench on the Watchlist page: rank, ticker and price on the card, and the strike's
// full metric set in the detail panel beside it. The scenarios below are unchanged —
// only where each number is read from has moved.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { format, parseISO } from 'date-fns'
import { CLOSED_SESSION, cleanupDb, tmpDb } from './assignment-helpers'
import {
  PUT_CONTRACT,
  PUT_EXPIRATION,
  QUOTE_TIMESTAMP,
  RANKED_IVR,
  RANKED_PUTS,
  TSLA_PUT,
  cardRank,
  cardReason,
  cardScore,
  detailPutMetrics,
  ivrCell,
  launchScreener,
  meetsTickers,
  selectCard,
  waitForBenchCard,
  waitingTickers,
  type ScreenerLaunchOpts
} from './screener-helpers'

describe('US-66: display ranked screener results', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, opts: ScreenerLaunchOpts = {}): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, opts)
    app = launched.app
    return launched.page
  }

  it('results are ranked by yield-per-delta', async () => {
    const page = await launch('wb-e2e-us66-rank', { ivr: RANKED_IVR })

    // Background: the market status pill reads LIVE.
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("LIVE")')
    await waitForBenchCard(page, 'KO', 'meets')

    expect(await meetsTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])
    expect(await cardScore(page, 'KO')).toBe('0.71')
    expect(await cardScore(page, 'AAPL')).toBe('0.53')
    expect(await cardScore(page, 'MSFT')).toBe('0.50')

    // The rank each card shows is the standing the score bought it.
    expect(await cardRank(page, 'KO')).toBe('#1')
    expect(await cardRank(page, 'AAPL')).toBe('#2')
    expect(await cardRank(page, 'MSFT')).toBe('#3')

    // Every card states the contract it is ranked on, so no card ranks on nothing.
    for (const ticker of ['KO', 'AAPL', 'MSFT']) {
      const contract = await page.textContent(
        `[data-testid="watchlist-row-${ticker}"] [data-testid="watchlist-contract"]`
      )
      expect(contract?.trim().length).toBeGreaterThan(0)
    }
  })

  it('a row shows the metrics for its recommended strike', async () => {
    const page = await launch('wb-e2e-us66-metrics', { ivr: RANKED_IVR })

    await waitForBenchCard(page, 'AAPL', 'meets')
    await selectCard(page, 'AAPL')

    // The strings the AC pins for AAPL's recommended strike; the fixture math that
    // produces them is documented on AAPL_PUT in screener-helpers.ts.
    const metrics = await detailPutMetrics(page)
    expect(metrics.get(PUT_CONTRACT)).toBe('$180.00 PUT')
    expect(metrics.get(PUT_EXPIRATION)).toContain('37 DTE')
    expect(metrics.get('Mark / share')).toBe('$2.70')
    expect(metrics.get('Period yield')).toBe('1.5%')
    expect(metrics.get('Annualized')).toBe('14.8%/yr')
    expect(metrics.get('Delta')).toBe('0.28')
    expect(metrics.get('Open interest')).toBe('4,200')
    expect(metrics.get('Spread')).toBe('$0.06 (2%)')

    // IV rank stays on the card, beside the ticker it belongs to.
    expect((await ivrCell(page, 'AAPL')).text).toBe('44')
    expect(await cardScore(page, 'AAPL')).toBe('0.53')
  })

  it('IV rank unavailable is shown, not blank', async () => {
    // MSFT is deliberately absent from the seeded IV ranks.
    const page = await launch('wb-e2e-us66-no-ivr', { ivr: RANKED_IVR })

    await waitForBenchCard(page, 'MSFT', 'meets')

    const cell = await ivrCell(page, 'MSFT')
    expect(cell.text).toBe('n/a')
    // [US-98] Nothing was ever read, so there is no freshness tier to draw.
    expect(cell.ring).toBeNull()
    // Still ranked, third by yield-per-delta.
    expect(await cardRank(page, 'MSFT')).toBe('#3')
  })

  it('excluded candidates are listed with a reason', async () => {
    const page = await launch('wb-e2e-us66-excluded', {
      fixtures: [...RANKED_PUTS, TSLA_PUT],
      ivr: RANKED_IVR
    })

    await waitForBenchCard(page, 'TSLA', 'waiting')

    // The engine's own wording reaches the card verbatim.
    expect(await cardReason(page, 'TSLA')).toBe('spread 22% exceeds 10%')
    expect(await waitingTickers(page)).toContain('TSLA')
    // No yield-per-delta rank is shown for an excluded ticker.
    expect(await meetsTickers(page)).not.toContain('TSLA')
    expect(await cardRank(page, 'TSLA')).toBeNull()
  })

  it('provider outage is distinguished from no results', async () => {
    const page = await launch('wb-e2e-us66-outage', { marketDataError: 'network_error' })

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    expect(await card.textContent()).toContain('Market data unavailable')
    expect(await card.locator('button:has-text("Retry refresh")').count()).toBe(1)

    // Distinct from "no candidates match your criteria": nothing was judged, and every
    // card says so rather than claiming its criteria were checked and missed.
    await waitForBenchCard(page, 'KO', 'waiting')
    expect(await meetsTickers(page)).toEqual([])
    expect(await cardReason(page, 'KO')).toBe('Data unavailable · not evaluated')
  })

  // [US-99 AC9] With credentials saved, a failed refresh is a genuine outage and the card
  // names the vendor that failed.
  it('Screener outage card names Alpaca', async () => {
    // The launch harness preseeds an active paper environment, so credentials are present
    // and a failed refresh is a genuine outage.
    const page = await launch('wb-e2e-us99-outage-copy', { marketDataError: 'auth_failed' })

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    expect(await card.textContent()).toContain(
      "Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available."
    )
  })

  // [US-99] Without credentials Alpaca was never contacted, so the card must send the
  // trader to Settings rather than report an outage.
  it('Screener names the missing connection when Alpaca is not configured', async () => {
    const page = await launch('wb-e2e-us99-not-connected', {
      marketDataError: 'auth_failed',
      withoutBrokerCredentials: true
    })

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    const text = await card.textContent()
    expect(text).toContain('Market data not connected')
    expect(text).toContain(
      'Connect Alpaca in Settings to score candidates — no market-data credentials are saved yet.'
    )
    expect(text).not.toContain("couldn't be reached")
  })

  it('stale marks are flagged', async () => {
    const page = await launch('wb-e2e-us66-stale', { marketStatus: CLOSED_SESSION })

    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("CLOSED")')
    await waitForBenchCard(page, 'KO', 'meets')

    await page.waitForSelector('[data-testid="screener-stale-badge"]')
    const quoteTime = format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')
    // [US-96] The caption sits beside the criteria strip now, so the warning sentence it
    // used to carry moved into the header's own `Stale snapshot` badge; the caption states
    // only the mark's age.
    expect(await page.textContent('[data-testid="screener-stale-caption"]')).toContain(
      `quoted ${quoteTime}`
    )
  })
})
