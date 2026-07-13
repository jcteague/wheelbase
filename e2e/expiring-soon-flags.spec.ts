// [US-61] Flag positions expiring within 7 days on dashboard and calendar.
//
// One test per Gherkin scenario in
// docs/epics/07-stories/US-61-expiring-soon-flags.md. The flag is a pure display
// rule on server-computed DTE (<= 7), so positions are seeded straight through
// the IPC bridge (window.api) — reusing US-60's calendar helpers — with relative
// expiration offsets so DTE lands deterministically and the suite never rots.
import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Locator, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  futureDate,
  goToCalendar,
  navigateToMonthOf,
  seedCcOpenPosition,
  seedCspPosition,
  seedHoldingSharesPosition
} from './calendar-helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

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

async function goToDashboard(page: Page): Promise<void> {
  // Round-trip through another route so PositionsListPage remounts and refetches
  // positions seeded after the initial load (matches goToPositionsList in
  // assignment-helpers).
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForSelector('[data-testid="position-card"]')
}

/** The active-positions row whose ticker cell contains `ticker`. */
function positionRow(page: Page, ticker: string): Locator {
  return page.locator('[data-testid="position-card"]', { hasText: ticker })
}

describe('US-61: expiring-soon flags', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('Dashboard highlights positions with 7 DTE or less', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us61-ac1-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    // AAPL CSP at exactly 7 DTE. No alert evaluation is run, so AAPL has no
    // management-queue item — the flag must still show purely from DTE.
    await seedCspPosition(page, {
      ticker: 'AAPL',
      strike: 180,
      premium: 2,
      expiration: futureDate(7)
    })

    await goToDashboard(page)

    const aapl = positionRow(page, 'AAPL')
    await aapl.waitFor({ state: 'visible' })
    expect(await aapl.getByTestId('expiring-soon-flag').count()).toBe(1)
  })

  it('Calendar highlights expiring-soon positions', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us61-ac2-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    const msftExp = futureDate(4)
    await seedCcOpenPosition(page, {
      ticker: 'MSFT',
      cspStrike: 400,
      cspPremium: 4,
      ccStrike: 420,
      ccPremium: 3,
      ccExpiration: msftExp
    })

    await goToCalendar(page)
    await navigateToMonthOf(page, msftExp)

    const cell = page.locator(`[data-testid="day-cell-${msftExp}"]`)
    await cell.waitFor({ state: 'visible' })
    // Date cell carries the expiring-soon highlight (SOON marker).
    await cell.getByText('SOON', { exact: true }).waitFor({ state: 'visible' })

    // Day detail panel repeats the "Expiring soon" flag for MSFT.
    await cell.click()
    await page.locator('text=Expiring soon').waitFor({ state: 'visible' })
    expect(await page.locator('text=Expiring soon').count()).toBeGreaterThan(0)
  })

  it('Positions outside the threshold are not flagged', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us61-ac3-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    const nvdaExp = futureDate(8)
    await seedCcOpenPosition(page, {
      ticker: 'NVDA',
      cspStrike: 100,
      cspPremium: 1,
      ccStrike: 120,
      ccPremium: 1,
      ccExpiration: nvdaExp
    })

    // Dashboard: no flag on the NVDA row.
    await goToDashboard(page)
    const nvda = positionRow(page, 'NVDA')
    await nvda.waitFor({ state: 'visible' })
    expect(await nvda.getByTestId('expiring-soon-flag').count()).toBe(0)

    // Calendar: NVDA's date cell has no expiring-soon highlight.
    await goToCalendar(page)
    await navigateToMonthOf(page, nvdaExp)
    const cell = page.locator(`[data-testid="day-cell-${nvdaExp}"]`)
    await cell.waitFor({ state: 'visible' })
    await cell.getByText('NVDA', { exact: true }).waitFor({ state: 'visible' })
    expect(await cell.getByText('SOON', { exact: true }).count()).toBe(0)
  })

  it('Holding-shares positions are not flagged', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us61-ac4-${Date.now()}.db`)
    const launched = await launchAndOpen(dbPath)
    app = launched.app
    const page = launched.page

    await seedHoldingSharesPosition(page, { ticker: 'TSLA', strike: 200, premium: 5 })

    // Dashboard: TSLA (no active option, DTE null) shows no flag.
    await goToDashboard(page)
    const tsla = positionRow(page, 'TSLA')
    await tsla.waitFor({ state: 'visible' })
    expect(await tsla.getByTestId('expiring-soon-flag').count()).toBe(0)

    // Calendar: TSLA has no option expiration, so it never appears.
    await goToCalendar(page)
    expect(await page.locator('text=TSLA').count()).toBe(0)
  })
})
