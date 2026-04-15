import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localToday } from './dates'

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

/**
 * Seeds a position all the way to CC_OPEN state.
 * Uses a PAST expiration for the CC so that "Record Expiration →" button appears (DTE ≤ 0).
 */
async function reachCcOpenStateWithExpiredCc(
  page: Page
): Promise<{ today: string; ccExpiration: string }> {
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
  await page.waitForSelector('text=Assign CSP to Shares')
  await selectDate(page, '#assignment-date', today)
  await page.click('button:has-text("Confirm Assignment")')
  await page.waitForSelector('text=HOLDING 100 SHARES')
  await page.click('text=View full position history')
  await page.waitForSelector('[data-testid="position-detail"]')

  // Open a CC with today as expiration (DTE = 0 ≤ 0) so "Record Expiration →" button appears
  await page.click('[data-testid="open-covered-call-btn"]')
  await page.waitForSelector('text=Open Covered Call')
  await page.fill('[data-testid="cc-strike"]', '182')
  await page.fill('[data-testid="cc-premium"]', '2.30')
  await selectDate(page, '[data-testid="cc-expiration"]', today)
  await selectDate(page, '[data-testid="cc-fill-date"]', today)
  await page.click('[data-testid="cc-submit"]')
  await page.waitForSelector('text=CC OPEN')
  // Navigate away and back to dismiss the success sheet and land on the fresh position detail
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForFunction(() => location.hash === '#/')
  await page.waitForSelector('text=AAPL')
  await page.click('text=AAPL')
  await page.waitForSelector('[data-testid="position-detail"]')

  return { today, ccExpiration: today }
}

// ---------------------------------------------------------------------------
// US-9: Record CC Expiring Worthless
// ---------------------------------------------------------------------------

describe('US-9: Record CC expiring worthless', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-cc-expiry-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  it('records CC expiration worthless: position transitions to HOLDING_SHARES and EXPIRE leg is created', async () => {
    const page = await launchFreshApp()
    await reachCcOpenStateWithExpiredCc(page)

    // "Record Expiration →" should now be visible
    await page.waitForSelector('[data-testid="record-cc-expiration-btn"]')
    await page.click('[data-testid="record-cc-expiration-btn"]')
    await page.waitForSelector('text=Expire Covered Call Worthless')

    await page.click('button:has-text("Confirm Expiration")')

    // Success: header should show AAPL CC Expired Worthless (or similar)
    await page.waitForSelector('text=AAPL CC Expired Worthless')

    // Navigate back to position detail to verify phase and leg
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    const bodyText = await page.textContent('body')
    // Phase should be HOLDING_SHARES
    expect(bodyText).toContain('Holding')
    // EXPIRE leg should appear in leg history
    expect(bodyText).toContain('EXPIRE')
  })

  it('records CC expiration worthless: success screen shows +$230.00 premium captured (100%)', async () => {
    const page = await launchFreshApp()
    await reachCcOpenStateWithExpiredCc(page)

    await page.waitForSelector('[data-testid="record-cc-expiration-btn"]')
    await page.click('[data-testid="record-cc-expiration-btn"]')
    await page.waitForSelector('text=Expire Covered Call Worthless')
    await page.click('button:has-text("Confirm Expiration")')
    await page.waitForSelector('text=AAPL CC Expired Worthless')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('230')
    expect(bodyText).toContain('100%')
    expect(bodyText).toContain('premium captured')
  })

  it('rejects expiration attempt before the expiration date: "Record Expiration →" is NOT visible when DTE > 0', async () => {
    const page = await launchFreshApp()
    const today = localToday()
    // Use a future CC expiration — DTE > 0 → button should not appear
    const futureExpiration = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

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

    await page.click('[data-testid="open-covered-call-btn"]')
    await page.waitForSelector('text=Open Covered Call')
    await page.fill('[data-testid="cc-strike"]', '182')
    await page.fill('[data-testid="cc-premium"]', '2.30')
    await selectDate(page, '[data-testid="cc-expiration"]', futureExpiration)
    await selectDate(page, '[data-testid="cc-fill-date"]', today)
    await page.click('[data-testid="cc-submit"]')
    await page.waitForSelector('text=CC OPEN')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // DTE > 0 — "Record Expiration →" button should NOT be visible
    const count = await page.locator('[data-testid="record-cc-expiration-btn"]').count()
    expect(count).toBe(0)
  })

  it('rejects CC expiration when position is not in CC_OPEN phase: button is NOT visible in HOLDING_SHARES', async () => {
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
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Position is now HOLDING_SHARES — no CC open → button must not appear
    const count = await page.locator('[data-testid="record-cc-expiration-btn"]').count()
    expect(count).toBe(0)
  })

  it('success state shows strategic nudge and sell-next-CC CTA', async () => {
    const page = await launchFreshApp()
    await reachCcOpenStateWithExpiredCc(page)

    await page.waitForSelector('[data-testid="record-cc-expiration-btn"]')
    await page.click('[data-testid="record-cc-expiration-btn"]')
    await page.waitForSelector('text=Expire Covered Call Worthless')
    await page.click('button:has-text("Confirm Expiration")')
    await page.waitForSelector('text=AAPL CC Expired Worthless')

    const bodyText = await page.textContent('body')
    // Strategic nudge
    expect(bodyText).toContain('1')
    expect(bodyText).toContain('3 days')

    // CTA button
    await page.waitForSelector('button:has-text("Sell New Covered Call on AAPL")')
    await page.click('button:has-text("Sell New Covered Call on AAPL")')

    // Sheet closes and position detail shows HOLDING_SHARES
    await page.waitForSelector('[data-testid="position-detail"]')
    const afterText = await page.textContent('body')
    expect(afterText).toContain('Holding')
  })
})
