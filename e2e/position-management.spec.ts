import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// Near expiration: today — ensures DTE=0 (shorter than FAR) and allows same-day expiration in tests
const _near = new Date()
const NEAR_YEAR = _near.getFullYear()
const NEAR_MONTH = _near.getMonth() + 1
const NEAR_DAY = _near.getDate()
const NEAR_ISO = `${NEAR_YEAR}-${String(NEAR_MONTH).padStart(2, '0')}-${String(NEAR_DAY).padStart(2, '0')}`

// Far expiration: June 2026
const FAR_YEAR = 2026
const FAR_MONTH = 6
const FAR_DAY = 20

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
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')

  await page.fill('#ticker', opts.ticker)
  await page.fill('#strike', opts.strike)
  await page.fill('#contracts', opts.contracts)
  await page.fill('#premiumPerContract', opts.premium)

  await page.click('#expiration')
  const targetHeading = new Date(opts.year, opts.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric'
  })
  for (let i = 0; i < 12; i++) {
    const heading = await page.textContent('.rdp-month_caption')
    if (heading?.includes(targetHeading)) break
    await page.click('.rdp-button_next')
  }
  await page.click(`.rdp-day_button:not(.rdp-outside):has-text("${opts.day}")`)
  const iso = `${opts.year}-${String(opts.month).padStart(2, '0')}-${String(opts.day).padStart(2, '0')}`
  await page.waitForSelector(`text=${iso}`)

  await page.click('button[type="submit"]')
  // Wait for the form to be removed from the DOM (navigate('/') unmounts it)
  await page.waitForSelector('#ticker', { state: 'detached' })
}

// --- US-2 ---

describe('US-2: positions sorted by DTE ascending', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows the position with shorter DTE before the one with longer DTE', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-sort-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Create AAPL with far expiration (longer DTE)
    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '2.50',
      year: FAR_YEAR,
      month: FAR_MONTH,
      day: FAR_DAY
    })

    // Create MSFT with near expiration (shorter DTE)
    await openPosition(page, {
      ticker: 'MSFT',
      strike: '400',
      contracts: '1',
      premium: '5.00',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    // Navigate to positions list
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('[data-testid="position-card"]')

    // Extract tickers from active position rows in DOM order
    const tickers = await page.$$eval(
      '[data-testid="position-card"] td:first-child span:first-child',
      (cells) => cells.map((c) => c.textContent?.trim())
    )

    expect(tickers[0]).toBe('MSFT') // shorter DTE appears first
    expect(tickers[1]).toBe('AAPL')
  })
})

describe('US-2: closed position appears in closed section', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('moves to the closed section with CSP profit badge after buy-to-close', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-closed-section-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await openPosition(page, {
      ticker: 'TSLA',
      strike: '220',
      contracts: '1',
      premium: '4.00',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    // Go to positions list and open detail
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=TSLA')
    await page.click('text=TSLA')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Close the position at a profit
    await page.fill('[data-testid="close-price-input"]', '1.50')
    await page.click('[data-testid="close-csp-submit"]')
    await page.waitForURL(/#\/$/)

    // TSLA should now appear in the closed section
    await page.waitForSelector('[data-testid="position-card-closed"]')
    const closedText = await page.textContent('[data-testid="position-card-closed"]')
    expect(closedText).toContain('TSLA')
    expect(closedText).toContain('CSP ✓')

    // No active position rows remain
    const activeCards = await page.$$('[data-testid="position-card"]')
    expect(activeCards).toHaveLength(0)
  })
})

// --- US-3 ---

describe('US-3: position detail shows correct field values', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('displays strike, expiration, contracts, premium and cost basis for an open CSP', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-detail-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '2.50',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    // Navigate to positions list then to detail
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=AAPL')
    await page.click('text=AAPL')
    await page.waitForSelector('[data-testid="position-detail"]')

    const bodyText = await page.textContent('[data-testid="position-detail"]')

    // Open Leg fields
    expect(bodyText).toContain('$180.00') // strike
    expect(bodyText).toContain(NEAR_ISO) // expiration
    expect(bodyText).toContain('$2.50') // premium per contract

    // Cost Basis fields
    expect(bodyText).toContain('$250.00') // premium collected = 2.50 × 1 × 100
    expect(bodyText).toContain('$177.50') // effective basis per share = 180 − 2.50
  })

  it('shows "Position not found" message for an unknown ID', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-notfound-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => {
      location.hash = '#/positions/00000000-0000-0000-0000-000000000000'
    })

    // Detail page should show an error state
    await page.waitForSelector('text=Failed to load position.')
  })
})

// --- US-4 ---

describe('US-4: close CSP early — P&L preview', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows net P&L, total P&L and percentage when a close price is entered', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-preview-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Open premium $5.00, close at $2.00 → net $3.00, total $300.00, 60%
    await openPosition(page, {
      ticker: 'AAPL',
      strike: '200',
      contracts: '1',
      premium: '5.00',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=AAPL')
    await page.click('text=AAPL')
    await page.waitForSelector('[data-testid="position-detail"]')

    await page.fill('[data-testid="close-price-input"]', '2.00')

    // Preview panel should appear with correct values
    await page.waitForSelector('text=Net P&L')
    const detailText = await page.textContent('[data-testid="position-detail"]')
    expect(detailText).toContain('Net P&L: $3.00')
    expect(detailText).toContain('Total P&L: $300.00')
    expect(detailText).toContain('60%')
  })
})

describe('US-4: close CSP at a loss', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('transitions to CSP_CLOSED_LOSS and shows CSP ✗ badge in the closed section', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-loss-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Open premium $2.50; close at $3.50 → loss
    await openPosition(page, {
      ticker: 'SPY',
      strike: '500',
      contracts: '1',
      premium: '2.50',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=SPY')
    await page.click('text=SPY')
    await page.waitForSelector('[data-testid="position-detail"]')

    await page.fill('[data-testid="close-price-input"]', '3.50')
    await page.click('[data-testid="close-csp-submit"]')
    await page.waitForURL(/#\/$/)

    await page.waitForSelector('[data-testid="position-card-closed"]')
    const closedText = await page.textContent('[data-testid="position-card-closed"]')
    expect(closedText).toContain('SPY')
    expect(closedText).toContain('CSP ✗')
  })
})

describe('US-4: close CSP — validation', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows a validation error when close price is zero', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-validate-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '2.50',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=AAPL')
    await page.click('text=AAPL')
    await page.waitForSelector('[data-testid="position-detail"]')

    await page.fill('[data-testid="close-price-input"]', '0')
    await page.click('[data-testid="close-csp-submit"]')

    await page.waitForSelector('[role="alert"]')
    const alertText = await page.textContent('[role="alert"]')
    expect(alertText).toContain('Close price must be positive')
  })
})

// --- US-5 ---

describe('US-5: WHEEL_COMPLETE badge in positions list after expiration', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows the expired position in the closed section with Complete badge', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-complete-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await openPosition(page, {
      ticker: 'SPY',
      strike: '500',
      contracts: '1',
      premium: '3.00',
      year: NEAR_YEAR,
      month: NEAR_MONTH,
      day: NEAR_DAY
    })

    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=SPY')
    await page.click('text=SPY')
    await page.waitForSelector('[data-testid="position-detail"]')

    await page.click('[data-testid="record-expiration-btn"]')
    await page.waitForSelector('text=Expire CSP Worthless')
    await page.click('button:has-text("Confirm Expiration")')
    await page.waitForSelector('text=SPY Expired Worthless')

    // Close the sheet and navigate back to list
    await page.click('button:has-text("View full position history")')
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('[data-testid="position-card-closed"]')

    const closedText = await page.textContent('[data-testid="position-card-closed"]')
    expect(closedText).toContain('SPY')
    expect(closedText).toContain('Complete')

    const activeCards = await page.$$('[data-testid="position-card"]')
    expect(activeCards).toHaveLength(0)
  })
})
