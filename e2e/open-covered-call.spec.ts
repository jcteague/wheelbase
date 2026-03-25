import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function selectDate(page: Page, triggerSelector: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number)
  await page.click(triggerSelector)
  const targetHeading = new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  for (let i = 0; i < 24; i++) {
    const heading = await page.textContent('.rdp-month_caption')
    if (heading?.includes(targetHeading)) break
    const currentDate = heading ? new Date(`${heading} 1`) : new Date()
    const targetDate = new Date(year, month - 1, 1)
    const next = targetDate > currentDate
    await page.click(
      next ? 'button[aria-label*="next month" i]' : 'button[aria-label*="previous month" i]'
    )
  }

  await page.click(`.rdp-day:not(.rdp-outside) .rdp-day_button:has-text("${day}")`)
  await page.waitForSelector(`${triggerSelector}:has-text("${iso}")`)
}

async function openPosition(
  page: Page,
  opts: {
    ticker: string
    strike: string
    contracts: string
    premium: string
    year: number
    month: number
    day: number
  }
): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForFunction(() => location.hash === '#/')
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')
  await page.fill('#ticker', opts.ticker)
  await page.fill('#strike', opts.strike)
  await page.fill('#contracts', opts.contracts)
  await page.fill('#premiumPerContract', opts.premium)
  await selectDate(
    page,
    '#expiration',
    `${opts.year}-${String(opts.month).padStart(2, '0')}-${String(opts.day).padStart(2, '0')}`
  )
  await page.click('button[type="submit"]')
  await page.waitForSelector('#ticker', { state: 'detached' })
}

async function openDetailFor(page: Page, ticker: string): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForSelector(`text=${ticker}`)
  await page.click(`text=${ticker}`)
  await page.waitForSelector('[data-testid="position-detail"]')
}

async function openCcSheet(page: Page): Promise<void> {
  await page.click('[data-testid="open-covered-call-btn"]')
  await page.waitForSelector('text=Open Covered Call')
}

// ---------------------------------------------------------------------------
// US-7: Open a Covered Call
// ---------------------------------------------------------------------------

describe('US-7: Open a Covered Call', () => {
  let app: ElectronApplication
  let dbPath: string

  const EXPIRATION = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-open-cc-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  it('AC1: successfully opens a covered call — phase transitions to CC_OPEN, leg recorded, cost basis updated, total premium increased', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    await page.fill('[data-testid="cc-strike"]', '182')
    await page.fill('[data-testid="cc-premium"]', '2.30')
    await selectDate(page, '[data-testid="cc-expiration"]', EXPIRATION)
    await selectDate(page, '[data-testid="cc-fill-date"]', today)
    await page.click('[data-testid="cc-submit"]')

    await page.waitForSelector('text=AAPL CC Opened')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC OPEN · CALL $182.00')
    expect(bodyText).toContain('174.20')
  })

  it('AC2: strike above cost basis shows profit preview and no warning', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    // Strike 182 > cost basis 176.50 — should show profit preview, no warning
    await page.fill('[data-testid="cc-strike"]', '182')

    const bodyText = await page.textContent('body')
    // Profit preview info note
    expect(bodyText).toContain('profit')
    expect(bodyText).toContain('5.50')
    // No gold warning
    const warningCount = await page.locator('[data-testid="guardrail-warning"]').count()
    expect(warningCount).toBe(0)
  })

  it('AC3: strike below cost basis shows gold guardrail warning with loss amount', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    // Strike 174 < cost basis 176.50 — should show loss warning
    await page.fill('[data-testid="cc-strike"]', '174')

    await page.waitForSelector('[data-testid="guardrail-warning"]')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('below your cost basis')
    expect(bodyText).toContain('loss')

    // Confirm button should still be enabled
    const isEnabled = await page.locator('[data-testid="cc-submit"]').isEnabled()
    expect(isEnabled).toBe(true)
  })

  it('AC4: strike exactly at cost basis shows gold guardrail warning with break-even message', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    // Strike 176.50 === cost basis — break-even warning
    await page.fill('[data-testid="cc-strike"]', '176.50')

    await page.waitForSelector('[data-testid="guardrail-warning"]')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('break even')
  })

  it('AC5: Open Covered Call button is not visible when position is in CC_OPEN phase', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Open a covered call
    await openCcSheet(page)
    await page.fill('[data-testid="cc-strike"]', '182')
    await page.fill('[data-testid="cc-premium"]', '2.30')
    await selectDate(page, '[data-testid="cc-expiration"]', EXPIRATION)
    await selectDate(page, '[data-testid="cc-fill-date"]', today)
    await page.click('[data-testid="cc-submit"]')
    await page.waitForSelector('text=CC OPEN')

    // Close sheet, navigate back to detail
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Button should no longer be visible
    const count = await page.locator('[data-testid="open-covered-call-btn"]').count()
    expect(count).toBe(0)
  })

  it('AC6: rejects open CC with missing strike field', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    // Leave strike empty, fill everything else
    await page.fill('[data-testid="cc-premium"]', '2.30')
    await selectDate(page, '[data-testid="cc-expiration"]', EXPIRATION)
    await page.click('[data-testid="cc-submit"]')

    await page.waitForSelector('text=Strike is required')
  })

  it('AC7: rejects CC with contracts exceeding shares held', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    await page.fill('[data-testid="cc-strike"]', '182')
    await page.fill('[data-testid="cc-premium"]', '2.30')
    // Clear contracts and enter 2 (only 1 contract held)
    await page.fill('[data-testid="cc-contracts"]', '2')
    await selectDate(page, '[data-testid="cc-expiration"]', EXPIRATION)
    await selectDate(page, '[data-testid="cc-fill-date"]', today)
    await page.click('[data-testid="cc-submit"]')

    await page.waitForSelector('text=Contracts cannot exceed shares held')
  })

  it('AC8: rejects fill date before assignment date', async () => {
    const page = await launchFreshApp()
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: 2027,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    await openCcSheet(page)
    await page.fill('[data-testid="cc-strike"]', '182')
    await page.fill('[data-testid="cc-premium"]', '2.30')
    await selectDate(page, '[data-testid="cc-expiration"]', EXPIRATION)
    // Fill date before today (which was the assignment date)
    await selectDate(page, '[data-testid="cc-fill-date"]', yesterday)
    await page.click('[data-testid="cc-submit"]')

    await page.waitForSelector('text=Fill date cannot be before the assignment date')
  })
})
