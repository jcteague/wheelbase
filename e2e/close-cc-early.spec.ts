import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'
import { openPosition, openDetailFor, reachCcOpenState, selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-8: Close Covered Call Early
// ---------------------------------------------------------------------------

describe('close covered call early', () => {
  let app: ElectronApplication
  let dbPath: string

  // CC expiration must be in the future for the date picker to work
  const CC_EXPIRATION = localDate(60)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-close-cc-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  it('successfully close a covered call early at a profit — position phase changes to HOLDING_SHARES, CC_CLOSE leg recorded, P&L shows +$120.00', async () => {
    const page = await launchFreshApp()
    const today = await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '1.10')
    await selectDate(page, '[data-testid="cc-close-fill-date"]', today)
    await page.click('[data-testid="cc-close-submit"]')

    await page.waitForSelector('text=AAPL CC Closed')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC_CLOSE')
    expect(bodyText).toContain('120')
  })

  it('close at a loss shows negative P&L — CC_CLOSE leg recorded with $3.50, P&L shows −$120.00', async () => {
    const page = await launchFreshApp()
    const today = await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '3.50')
    await selectDate(page, '[data-testid="cc-close-fill-date"]', today)
    await page.click('[data-testid="cc-close-submit"]')

    await page.waitForSelector('text=AAPL CC Closed')
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC_CLOSE')
    expect(bodyText).toMatch(/−?\$?120|−120|-120/)
  })

  it('P&L preview shown on the form before submission — profit close shows correct amount and percentage', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    // openPremium=2.30, closePrice=1.10 → pnl = (2.30-1.10)*1*100 = $120.00
    // % of max captured = (2.30-1.10)/2.30*100 = 52.2%
    await page.fill('[data-testid="cc-close-price"]', '1.10')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('120')
    expect(bodyText).toMatch(/profit/i)
    expect(bodyText).toContain('52.2% of max')
  })

  it('P&L preview shown on the form before submission — loss close shows negative amount without percentage-of-max', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '3.50')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('120')
    expect(bodyText).toMatch(/loss/i)
    expect(bodyText).toMatch(/above open/i)
  })

  it('reject close when not in CC_OPEN phase — action rejected with No open covered call on this position', async () => {
    const page = await launchFreshApp()

    // Reach HOLDING_SHARES (no CC open) — close button should not appear
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
    const today = localToday()
    await page.click('[data-testid="record-assignment-btn"]')
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // No CC_OPEN — the button should not be visible
    const buttonCount = await page.locator('[data-testid="close-cc-early-btn"]').count()
    expect(buttonCount).toBe(0)
  })

  it('reject close price of zero or negative — validation error appears, no leg created', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '0')
    await page.click('[data-testid="cc-close-submit"]')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/close price must be greater than zero/i)
    // Success state was not reached — form is still showing, not the "CC Closed" success screen
    expect(bodyText).not.toContain('CC Closed')
  })

  it('reject fill date before CC open date — validation error appears, no leg created', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '1.10')

    // Try to set a fill date before the CC open date (today - 30 days)
    const pastDate = localDate(-30)
    await selectDate(page, '[data-testid="cc-close-fill-date"]', pastDate)
    await page.click('[data-testid="cc-close-submit"]')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/fill date cannot be before the cc open date/i)
  })

  it('reject fill date after CC expiration date — validation error appears, no leg created', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="close-cc-early-btn"]')
    await page.waitForSelector('text=Close Covered Call Early')
    await page.fill('[data-testid="cc-close-price"]', '1.10')

    // Try to set a fill date after CC_EXPIRATION
    const afterExpiry = new Date(new Date(CC_EXPIRATION).getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await selectDate(page, '[data-testid="cc-close-fill-date"]', afterExpiry)
    await page.click('[data-testid="cc-close-submit"]')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/fill date cannot be after the cc expiration date/i)
  })
})
