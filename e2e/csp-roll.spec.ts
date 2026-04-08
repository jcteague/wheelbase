import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openPosition, openDetailFor, selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-12: Roll Open CSP Out
// ---------------------------------------------------------------------------

describe('roll open CSP out', () => {
  let app: ElectronApplication
  let dbPath: string

  // CSP expiration must be in the future for the form to work
  const CSP_EXPIRATION = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const NEW_EXPIRATION = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const PAST_EXPIRATION = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-csp-roll-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  /** Create a CSP_OPEN position and navigate to its detail page */
  async function reachCspOpenDetail(page: Page): Promise<void> {
    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: parseInt(CSP_EXPIRATION.slice(0, 4)),
      month: parseInt(CSP_EXPIRATION.slice(5, 7)),
      day: parseInt(CSP_EXPIRATION.slice(8, 10))
    })
    await openDetailFor(page, 'AAPL')
  }

  /** Open the Roll CSP sheet from the position detail page */
  async function openRollSheet(page: Page): Promise<void> {
    await page.click('[data-testid="roll-csp-btn"]')
    await page.waitForSelector('text=Roll Cash-Secured Put')
  }

  it('shows current leg summary and new leg inputs when roll form is opened', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    const bodyText = await page.textContent('body')
    // Current leg section
    expect(bodyText).toContain('Current Leg')
    expect(bodyText).toContain('$180.00')
    expect(bodyText).toContain(CSP_EXPIRATION)
    expect(bodyText).toContain('$350.00')

    // New leg input fields
    expect(bodyText).toContain('New Leg')
    expect(await page.isVisible('[aria-label="New Strike"]')).toBe(true)
    expect(await page.isVisible('[aria-label="New Expiration"]')).toBe(true)
    expect(await page.isVisible('[aria-label="Cost to Close"]')).toBe(true)
    expect(await page.isVisible('[aria-label="New Premium"]')).toBe(true)
    expect(await page.isVisible('[aria-label="Fill Date"]')).toBe(true)
  })

  it('shows net credit preview when cost to close and new premium are entered', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '1.20')
    await page.fill('[aria-label="New Premium"]', '2.80')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Net Credit')
    expect(bodyText).toMatch(/\+\$1\.60\/contract/)
    expect(bodyText).toContain('$160.00 total')
  })

  it('shows net debit preview with warning when cost to close exceeds new premium', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '3.00')
    await page.fill('[aria-label="New Premium"]', '2.50')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Net Debit')
    expect(bodyText).toMatch(/-\$0\.50\/contract/)
    expect(bodyText).toContain('$50.00 total')
    expect(bodyText).toContain('This roll costs more to close than the new premium provides')
  })

  it('creates linked ROLL_FROM and ROLL_TO leg pair and keeps position in CSP_OPEN on successful roll', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '1.20')
    await page.fill('[aria-label="New Premium"]', '2.80')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)

    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CSP Rolled Successfully')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Roll Complete')
    expect(bodyText).toContain('ROLL_FROM')
    expect(bodyText).toContain('ROLL_TO')
    expect(bodyText).toContain('CSP_OPEN')
    expect(bodyText).toMatch(/\+\$1\.60/)
  })

  it('shows validation error when new expiration is not after current expiration', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '1.20')
    await page.fill('[aria-label="New Premium"]', '2.80')
    await selectDate(page, '[aria-label="New Expiration"]', PAST_EXPIRATION)

    await page.click('button:has-text("Confirm Roll")')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/new expiration must be after the current expiration/i)
    expect(bodyText).not.toContain('CSP Rolled Successfully')
  })

  it('shows validation error when cost to close is zero', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '0')
    await page.fill('[aria-label="New Premium"]', '2.80')

    await page.click('button:has-text("Confirm Roll")')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/cost to close must be greater than zero/i)
    expect(bodyText).not.toContain('CSP Rolled Successfully')
  })

  it('shows validation error when new premium is zero', async () => {
    const page = await launchFreshApp()
    await reachCspOpenDetail(page)
    await openRollSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '1.20')
    await page.fill('[aria-label="New Premium"]', '0')

    await page.click('button:has-text("Confirm Roll")')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/new premium must be greater than zero/i)
    expect(bodyText).not.toContain('CSP Rolled Successfully')
  })
})
