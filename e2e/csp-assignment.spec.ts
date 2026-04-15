import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

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

async function openDetailFor(page: Page, ticker: string): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForSelector(`text=${ticker}`)
  await page.click(`text=${ticker}`)
  await page.waitForSelector('[data-testid="position-detail"]')
}

describe('US-6: CSP assignment flow', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-assignment-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  it('records an assignment: position transitions to HOLDING_SHARES, 100 shares, correct cost basis, leg recorded', async () => {
    const page = await launchFreshApp()
    const todayIso = localToday()
    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: new Date().getFullYear() + 1,
      month: 1,
      day: 17
    })
    await openDetailFor(page, 'AAPL')
    await page.click('[data-testid="record-assignment-btn"]')
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', todayIso)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Holding')
    expect(bodyText).toContain('$176.50')
    expect(bodyText).toContain('assign')
  })

  it('assignment form shows premium waterfall with strike, CSP premium line, and effective cost basis', async () => {
    const page = await launchFreshApp()
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
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Assignment strike')
    expect(bodyText).toContain('$180.00')
    expect(bodyText).toContain('CSP premium')
    expect(bodyText).toContain('$3.50')
    expect(bodyText).toContain('Effective cost basis')
    expect(bodyText).toContain('$176.50')
  })

  it.todo('assignment cost basis includes roll credits in the waterfall')

  it('entering a future date shows warning and keeps Confirm Assignment enabled', async () => {
    const page = await launchFreshApp()
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
    await selectDate(page, '#assignment-date', localDate(365))
    await page.waitForSelector('text=This date is in the future — are you sure?')
    const isEnabled = await page.locator('button:has-text("Confirm Assignment")').isEnabled()
    expect(isEnabled).toBe(true)
  })

  it('submitting without a date shows validation error "Assignment date is required"', async () => {
    const page = await launchFreshApp()
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
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=Assignment date is required')
    expect(await page.textContent('body')).toContain('Sell Put')
  })

  it('submitting with a date before the CSP open date shows error', async () => {
    const page = await launchFreshApp()
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
    await selectDate(page, '#assignment-date', localDate(-365))
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=Assignment date cannot be before the CSP open date')
  })

  it('success state shows strategic nudge and Open Covered Call CTA', async () => {
    const page = await launchFreshApp()
    const today = localToday()
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
    await page.waitForSelector('text=Many traders wait 1–3 days for a bounce')
    await page.waitForSelector('button:has-text("Open Covered Call on AAPL")')
  })

  it('Record Assignment button is not visible when position is in HOLDING_SHARES phase', async () => {
    const page = await launchFreshApp()
    const today = localToday()
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
    const count = await page.locator('[data-testid="record-assignment-btn"]').count()
    expect(count).toBe(0)
  })
})
