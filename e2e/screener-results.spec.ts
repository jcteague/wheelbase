// [US-66] Display ranked screener results with key metrics — E2E tests.
//
// Exactly one `it()` per acceptance-criteria bullet in
// docs/epics/08-stories/US-66-display-ranked-results.md; the names mirror the
// Gherkin scenarios. Every assertion runs against the real app: the fake market-data
// provider serves the put chains, the US-65 engine scores them, and the renderer
// formats what it emits — nothing between the two is stubbed.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { format, parseISO } from 'date-fns'
import { CLOSED_SESSION, cleanupDb, tmpDb } from './assignment-helpers'
import {
  QUOTE_TIMESTAMP,
  RANKED_IVR,
  RANKED_PUTS,
  TSLA_PUT,
  launchScreener,
  rankedTickers,
  rowCells,
  rowScore,
  type ScreenerLaunchOpts
} from './screener-helpers'

// Column order of the ranked table: #, Ticker, Strike, Exp, DTE, Mark, Yield, Ann.,
// Δ, IVR, OI, Spread.
const RANK = 0
const IVR = 9
const COLUMN_COUNT = 12

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
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])
    expect(await rowScore(page, 'KO')).toBe('0.71')
    expect(await rowScore(page, 'AAPL')).toBe('0.53')
    expect(await rowScore(page, 'MSFT')).toBe('0.50')

    // Every decision column carries a value — strike, exp, DTE, mark, period yield,
    // annualized yield, delta, IV rank, open interest, spread.
    const cells = await rowCells(page, 'KO')
    expect(cells).toHaveLength(COLUMN_COUNT)
    expect(cells.every((cell) => cell.trim().length > 0)).toBe(true)
  })

  it('a row shows the metrics for its recommended strike', async () => {
    const page = await launch('wb-e2e-us66-metrics', { ivr: RANKED_IVR })

    await page.waitForSelector('[data-testid="screener-row-AAPL"]')

    // The strings the AC pins for AAPL's recommended strike; the fixture math that
    // produces them is documented on AAPL_PUT in screener-helpers.ts.
    const cells = await rowCells(page, 'AAPL')
    expect(cells).toEqual(
      expect.arrayContaining([
        '$180.00', // strike
        '37d', // DTE
        '$2.70', // mark
        '1.5%', // period yield
        '14.8%/yr', // annualized yield
        '0.28', // delta, unsigned
        '44', // IV rank, seeded
        '4,200', // open interest
        '$0.06 (2%)' // bid/ask spread
      ])
    )
    expect(await rowScore(page, 'AAPL')).toBe('0.53')
  })

  it('IV rank unavailable is shown, not blank', async () => {
    // MSFT is deliberately absent from the seeded IV ranks.
    const page = await launch('wb-e2e-us66-no-ivr', { ivr: RANKED_IVR })

    await page.waitForSelector('[data-testid="screener-row-MSFT"]')

    const cells = await rowCells(page, 'MSFT')
    expect(cells[IVR].trim()).toBe('n/a')
    // Still ranked, third by yield-per-delta.
    expect(cells[RANK].trim()).toBe('3')
  })

  it('excluded candidates are listed with a reason', async () => {
    const page = await launch('wb-e2e-us66-excluded', {
      fixtures: [...RANKED_PUTS, TSLA_PUT],
      ivr: RANKED_IVR
    })

    await page.waitForSelector('[data-testid="screener-excluded-toggle"]:has-text("Excluded (1)")')
    await page.click('[data-testid="screener-excluded-toggle"]')

    const row = page.locator('[data-testid="screener-excluded-row-TSLA"]')
    await row.waitFor()
    // Ticker cell followed by the reason cell, as textContent() concatenates them.
    expect(await row.textContent()).toBe('TSLAspread 22% exceeds 10%')
    // No yield-per-delta rank is shown for an excluded ticker.
    expect(await page.locator('[data-testid="screener-row-TSLA"]').count()).toBe(0)
  })

  it('provider outage is distinguished from no results', async () => {
    const page = await launch('wb-e2e-us66-outage', { marketDataError: 'network_error' })

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    expect(await card.textContent()).toContain('Market data unavailable')
    expect(await card.locator('button:has-text("Retry refresh")').count()).toBe(1)

    // Distinct from the "no candidates match your criteria" state, and no table.
    expect(await page.locator('[data-testid="screener-empty"]').count()).toBe(0)
    expect(await page.locator('[data-testid^="screener-row-"]').count()).toBe(0)
  })

  it('stale marks are flagged', async () => {
    const page = await launch('wb-e2e-us66-stale', { marketStatus: CLOSED_SESSION })

    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("CLOSED")')
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await page.waitForSelector('[data-testid="screener-stale-badge"]')
    const quoteTime = format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')
    expect(await page.textContent('[data-testid="screener-stale-caption"]')).toContain(
      `Quoted ${quoteTime}`
    )
  })
})
