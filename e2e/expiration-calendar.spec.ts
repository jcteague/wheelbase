// [US-60] Display expiration calendar view color-coded by phase
//
// One test per Gherkin scenario in
// docs/epics/07-stories/US-60-expiration-calendar-view.md. Positions are seeded
// directly through the IPC bridge (window.api) rather than the UI forms — the
// calendar itself is pure-renderer, so these tests only need real data in the
// DB, not a walkthrough of every entry-form flow.
import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { format, parseISO } from 'date-fns'
import {
  futureDate,
  goToCalendar,
  hexToRgb,
  navigateToMonthOf,
  seedCcOpenPosition,
  seedCspPosition,
  seedHoldingSharesPosition
} from './calendar-helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

const CSP_GOLD_RGB = hexToRgb('#e6a817')
const CC_VIOLET_RGB = hexToRgb('#d2a8ff')

async function launchAndOpen(dbPath: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: {
      ...process.env,
      WHEELBASE_DB_PATH: dbPath,
      FAKE_MARKET_DATA: 'true',
      FAKE_BROKER: 'true'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('text=Wheelbase')
  return { app, page }
}

/** AAPL CSP_OPEN + MSFT CC_OPEN both expiring on `sharedDate` — the AC-1/AC-2 fixture. */
async function seedSharedDateFixture(page: Page, sharedDate: string): Promise<void> {
  await seedCspPosition(page, { ticker: 'AAPL', strike: 180, premium: 2, expiration: sharedDate })
  await seedCcOpenPosition(page, {
    ticker: 'MSFT',
    cspStrike: 400,
    cspPremium: 4,
    ccStrike: 410,
    ccPremium: 3,
    ccExpiration: sharedDate
  })
}

describe('US-60: Expiration Calendar View', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('calendar shows expirations on the correct dates with phase colors', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us60-ac1-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    const shared = futureDate(20)
    await seedSharedDateFixture(page, shared)
    await seedHoldingSharesPosition(page, { ticker: 'TSLA', strike: 200, premium: 5 })

    await goToCalendar(page)
    await navigateToMonthOf(page, shared)

    const cell = page.locator(`[data-testid="day-cell-${shared}"]`)
    await cell.waitFor({ state: 'visible' })

    const aaplColor = await cell
      .getByText('AAPL', { exact: true })
      .evaluate((el) => getComputedStyle(el).color)
    expect(aaplColor).toBe(CSP_GOLD_RGB)

    const msftColor = await cell
      .getByText('MSFT', { exact: true })
      .evaluate((el) => getComputedStyle(el).color)
    expect(msftColor).toBe(CC_VIOLET_RGB)

    expect(await page.locator('text=TSLA').count()).toBe(0)
  })

  it("selecting a populated date shows that day's positions in a side panel", async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us60-ac2-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    const shared = futureDate(20)
    await seedSharedDateFixture(page, shared)

    await goToCalendar(page)
    await navigateToMonthOf(page, shared)
    await page.click(`[data-testid="day-cell-${shared}"]`)

    const header = `${format(parseISO(shared), 'MMM d')} · 2 expirations`
    await page.waitForSelector(`text=${header}`)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('AAPL')
    expect(bodyText).toContain('Sell Put')
    expect(bodyText).toContain('$180.00')
    expect(bodyText).toContain('MSFT')
    expect(bodyText).toContain('Sell Call')
    expect(bodyText).toContain('$410.00')
  })

  it('overflow indicator appears when a date has more expirations than fit', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us60-ac3-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    const overflow = futureDate(25)
    const tickers = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NFLX']
    for (const ticker of tickers) {
      await seedCspPosition(page, { ticker, strike: 100, premium: 1, expiration: overflow })
    }

    await goToCalendar(page)
    await navigateToMonthOf(page, overflow)

    const cell = page.locator(`[data-testid="day-cell-${overflow}"]`)
    await cell.waitFor({ state: 'visible' })

    for (const ticker of tickers.slice(0, 3)) {
      await cell.getByText(ticker, { exact: true }).waitFor({ state: 'visible' })
    }
    await cell.locator('text=+2 more').waitFor({ state: 'visible' })
  })

  it('empty month state renders cleanly', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us60-ac4-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    await seedCspPosition(page, {
      ticker: 'AAPL',
      strike: 180,
      premium: 2,
      expiration: futureDate(5)
    })

    const emptyTarget = futureDate(65)
    await goToCalendar(page)
    await navigateToMonthOf(page, emptyTarget)

    await page.waitForSelector('text=No expirations this month')
    // Row count varies by month shape (5 or 6 calendar weeks) — assert the grid
    // still renders a full set of weeks, not a specific literal cell count.
    const cellCount = await page.locator('[data-testid^="day-cell-"]').count()
    expect(cellCount % 7).toBe(0)
    expect(cellCount).toBeGreaterThanOrEqual(28)
    expect(await page.locator('text=AAPL').count()).toBe(0)
  })
})
