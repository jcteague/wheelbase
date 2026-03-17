import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// April 2026 — one month ahead so only one calendar nav click needed (used for close-early test)
const EXPIRATION_YEAR = 2026
const EXPIRATION_MONTH = 4 // April
const EXPIRATION_DAY = 17
const EXPIRATION_ISO = `${EXPIRATION_YEAR}-04-${String(EXPIRATION_DAY).padStart(2, '0')}`

// Expire test: use today in UTC — must match the service's fillDate default (toISOString().slice(0,10))
const _expireToday = new Date()
const EXPIRE_YEAR = _expireToday.getUTCFullYear()
const EXPIRE_MONTH = _expireToday.getUTCMonth() + 1
const EXPIRE_DAY = _expireToday.getUTCDate()
const EXPIRE_ISO = `${EXPIRE_YEAR}-${String(EXPIRE_MONTH).padStart(2, '0')}-${String(EXPIRE_DAY).padStart(2, '0')}`

describe('close CSP early flow', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('opens a position then closes it early and removes it from the active list', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-close-${Date.now()}.db`)

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Navigate to new wheel form and open a position
    await page.evaluate(() => {
      location.hash = '#/new'
    })
    await page.waitForSelector('label:has-text("Ticker")')

    await page.fill('#ticker', 'TSLA')
    await page.fill('#strike', '200')
    await page.fill('#contracts', '1')
    await page.fill('#premiumPerContract', '5.00')

    // Open expiration date picker and select April 17
    await page.click('#expiration')
    const targetHeading = new Date(EXPIRATION_YEAR, EXPIRATION_MONTH - 1, 1).toLocaleString(
      'en-US',
      { month: 'long', year: 'numeric' }
    )
    for (let i = 0; i < 12; i++) {
      const heading = await page.textContent('.rdp-month_caption')
      if (heading?.includes(targetHeading)) break
      await page.click('.rdp-button_next')
    }
    await page.click(`.rdp-day_button:not(.rdp-outside):has-text("${EXPIRATION_DAY}")`)
    await page.waitForSelector(`text=${EXPIRATION_ISO}`)

    await page.click('button[type="submit"]')
    await page.waitForSelector('#ticker', { state: 'detached' })

    // Navigate to positions list — should see TSLA card
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=TSLA')

    // Click on the TSLA position card to open detail page
    await page.click('text=TSLA')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Fill in close price and submit
    await page.fill('[data-testid="close-price-input"]', '2.00')
    await page.click('[data-testid="close-csp-submit"]')

    // Should redirect back to positions list
    await page.waitForURL(/#\/$/)

    // TSLA should no longer show as CSP Open (it's now closed)
    const bodyText = await page.textContent('body')
    expect(bodyText).not.toContain('CSP Open')
  })
})

describe('expire CSP worthless flow', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('opens a position, expires it worthless, and shows success state', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-expire-${Date.now()}.db`)

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Open a new wheel
    await page.evaluate(() => {
      location.hash = '#/new'
    })
    await page.waitForSelector('label:has-text("Ticker")')

    await page.fill('#ticker', 'SPY')
    await page.fill('#strike', '500')
    await page.fill('#contracts', '1')
    await page.fill('#premiumPerContract', '3.00')

    await page.click('#expiration')
    const targetHeading = new Date(EXPIRE_YEAR, EXPIRE_MONTH - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric'
    })
    for (let i = 0; i < 12; i++) {
      const heading = await page.textContent('.rdp-month_caption')
      if (heading?.includes(targetHeading)) break
      await page.click('.rdp-button_next')
    }
    await page.click(`.rdp-day_button:not(.rdp-outside):has-text("${EXPIRE_DAY}")`)
    await page.waitForSelector(`text=${EXPIRE_ISO}`)

    await page.click('button[type="submit"]')
    await page.waitForSelector('#ticker', { state: 'detached' })

    // Navigate to detail page
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=SPY')
    await page.click('text=SPY')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Open expiration sheet
    await page.click('[data-testid="record-expiration-btn"]')
    await page.waitForSelector('text=Expire CSP Worthless')

    // Confirm expiration
    await page.click('button:has-text("Confirm Expiration")')

    // Success state should appear
    await page.waitForSelector('text=SPY Expired Worthless')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('SPY Expired Worthless')
    expect(bodyText).toContain('Open new wheel on SPY')
    expect(bodyText).toContain('View full position history')
  })
})

describe('create → list flow', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows empty state then a position card after opening a wheel', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-${Date.now()}.db`)

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Positions list loads at root — verify empty state
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=No positions yet')
    expect(await page.isVisible('text=No positions yet')).toBe(true)

    // Navigate to new wheel form
    await page.evaluate(() => {
      location.hash = '#/new'
    })
    await page.waitForSelector('label:has-text("Ticker")')

    // Fill in text fields
    await page.fill('#ticker', 'AAPL')
    await page.fill('#strike', '150')
    await page.fill('#contracts', '1')
    await page.fill('#premiumPerContract', '3.50')

    // Open expiration date picker and select a date
    await page.click('#expiration')

    // Navigate calendar forward until we reach the target month/year
    // The calendar opens on the current month; advance until we see the target month heading
    const targetHeading = new Date(EXPIRATION_YEAR, EXPIRATION_MONTH - 1, 1).toLocaleString(
      'en-US',
      { month: 'long', year: 'numeric' }
    ) // e.g. "April 2026"

    for (let i = 0; i < 12; i++) {
      const heading = await page.textContent('.rdp-month_caption')
      if (heading?.includes(targetHeading)) break
      await page.click('.rdp-button_next')
    }

    // Click the target day (exact match inside the calendar)
    await page.click(`.rdp-day_button:not(.rdp-outside):has-text("${EXPIRATION_DAY}")`)

    // Confirm picker closed and shows the selected date
    await page.waitForSelector(`text=${EXPIRATION_ISO}`)

    // Submit
    await page.click('button[type="submit"]')

    // Wait for success panel
    await page.waitForSelector('[role="status"]')
    const successText = await page.textContent('[role="status"]')
    expect(successText).toContain('AAPL')

    // Navigate to positions list
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('text=AAPL')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('AAPL')
    expect(bodyText).toContain('CSP Open')
  })
})
