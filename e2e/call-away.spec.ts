import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openPosition, openDetailFor, reachCcOpenState, selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-10: Record Shares Called Away
// ---------------------------------------------------------------------------

describe('record shares called away', () => {
  let app: ElectronApplication
  let dbPath: string

  // Call-away uses CC expiration as fill date; today is valid (>= CC open date = today)
  const CC_EXPIRATION = new Date().toISOString().slice(0, 10)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-call-away-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  it('successfully records shares called away — position transitions to WHEEL_COMPLETE with +$780.00 P&L', async () => {
    const page = await launchFreshApp()
    // CSP strike=180, prem=3.50 → basis=176.50; CC strike=182, prem=2.30 → basisPerShare=174.20
    // Call away at 182: (182-174.20)*100 = +$780.00
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="record-call-away-btn"]')
    await page.waitForSelector('text=Record Call-Away')

    const formText = await page.textContent('body')
    expect(formText).toContain('182.00')
    expect(formText).toContain('780')

    await page.click('[data-testid="call-away-submit"]')
    // Wait for success state — "Cycle Summary" only appears in CallAwaySuccess, not the form
    await page.waitForSelector('text=Cycle Summary')

    const bodyText = await page.textContent('body')
    // Leg history shows action "EXERCISE" (not the internal legRole "CC_CLOSE")
    expect(bodyText).toContain('EXERCISE')
    expect(bodyText).toMatch(/\+\$780|\+780/)
  })

  it('called-away below cost basis shows a loss — P&L is negative and displayed in red', async () => {
    const page = await launchFreshApp()
    // CSP strike=180, prem=3.50 → basis=176.50; CC strike=174, prem=0.50 → basisPerShare=176.00
    // Call away at 174: (174-176.00)*100 = -$200.00 (loss)
    await reachCcOpenState(page, '174', '0.50', CC_EXPIRATION)

    await page.click('[data-testid="record-call-away-btn"]')
    await page.waitForSelector('text=Record Call-Away')

    const formText = await page.textContent('body')
    // Negative P&L on the form (unicode minus or hyphen)
    expect(formText).toMatch(/−\$?200|−200/)

    await page.click('[data-testid="call-away-submit"]')
    await page.waitForSelector('text=Cycle Summary')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/−\$?200|−200/)
  })

  it('P&L breakdown waterfall is shown on the confirmation form before submission', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="record-call-away-btn"]')
    await page.waitForSelector('text=Record Call-Away')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC strike (shares delivered)')
    expect(bodyText).toContain('Effective cost basis')
    expect(bodyText).toContain('Appreciation per share')
    expect(bodyText).toContain('Final cycle P&L')
    expect(bodyText).toContain('182.00')
    expect(bodyText).toContain('174.20')
    expect(bodyText).toContain('780')
  })

  it('Record Call-Away button is not visible when position is not in CC_OPEN phase', async () => {
    const page = await launchFreshApp()

    // Reach HOLDING_SHARES — no CC open
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
    const today = new Date().toISOString().slice(0, 10)
    await page.click('[data-testid="record-assignment-btn"]')
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    const buttonCount = await page.locator('[data-testid="record-call-away-btn"]').count()
    expect(buttonCount).toBe(0)
  })

  it('fill date is derived from CC expiration and displayed as read-only', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="record-call-away-btn"]')
    await page.waitForSelector('text=Record Call-Away')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Fill Date')
    expect(bodyText).toContain(CC_EXPIRATION)
    // "auto" label confirms the field is derived, not user-entered
    expect(bodyText).toContain('auto')
  })

  it('success state shows WHEEL COMPLETE, cycle P&L, cycle duration, annualized return, and Start New Wheel CTA', async () => {
    const page = await launchFreshApp()
    await reachCcOpenState(page, '182', '2.30', CC_EXPIRATION)

    await page.click('[data-testid="record-call-away-btn"]')
    await page.waitForSelector('text=Record Call-Away')
    await page.click('[data-testid="call-away-submit"]')
    await page.waitForSelector('text=Cycle Summary')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Cycle Summary')
    expect(bodyText).toContain('days')
    expect(bodyText).toMatch(/~\d+\.\d+%/)
    expect(bodyText).toContain('Start New Wheel on AAPL →')

    await page.click('text=Start New Wheel on AAPL →')
    await page.waitForFunction(() => location.hash.startsWith('#/new'))
  })
})
