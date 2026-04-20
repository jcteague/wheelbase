import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reachCcOpenState, selectDate } from './helpers'
import { localDate } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-14: Roll an Open Covered Call
// ---------------------------------------------------------------------------

describe('roll open covered call', () => {
  let app: ElectronApplication
  let dbPath: string

  // Background: CC strike $185, premium $2.50
  // CSP: strike $180, premium $3.50 → cost basis = $176.50/share
  const CC_STRIKE = '185'
  const CC_EXPIRATION = localDate(30)
  const CC_PREMIUM = '2.50'
  const NEW_EXPIRATION = localDate(60)
  const BEFORE_CC_EXPIRATION = localDate(-7)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-cc-roll-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  /** Create a CSP → assign → open CC position and navigate to its detail page */
  async function reachCcOpenDetail(page: Page): Promise<void> {
    await reachCcOpenState(page, CC_STRIKE, CC_PREMIUM, CC_EXPIRATION)
    // reachCcOpenState already ends at the position detail page
  }

  /** Open the Roll CC sheet from the position detail page */
  async function openRollCcSheet(page: Page): Promise<void> {
    await page.click('[data-testid="roll-cc-btn"]')
    await page.waitForSelector('text=Roll Covered Call')
  }

  it('shows current CC details and cost basis context when roll form is opened', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    const bodyText = await page.textContent('body')
    // Current Leg section
    expect(bodyText).toContain('Current Leg')
    expect(bodyText).toContain('$185.00')
    expect(bodyText).toContain(CC_EXPIRATION)
    // Cost basis after CSP ($3.50) + CC ($2.50) premiums: $180 - $3.50 - $2.50 = $174.00/share
    expect(bodyText).toContain('174.00')

    // New leg input fields present
    expect(await page.isVisible('[aria-label="New Strike"]')).toBe(true)
    expect(await page.isVisible('[aria-label="New Expiration"]')).toBe(true)
    expect(await page.isVisible('[aria-label="Cost to Close"]')).toBe(true)
    expect(await page.isVisible('[aria-label="New Premium"]')).toBe(true)
    expect(await page.isVisible('[aria-label="Fill Date"]')).toBe(true)
  })

  it('shows net credit preview for roll up and out', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // New strike $190 > current $185, new expiration later → Roll Up & Out
    await page.fill('[aria-label="New Strike"]', '190')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '3.50')
    await page.fill('[aria-label="New Premium"]', '4.20')

    const bodyText = await page.textContent('body')
    // Roll type label
    expect(bodyText).toContain('Roll Up & Out')
    // Net credit preview: $4.20 - $3.50 = $0.70/contract, $70.00 total (1 contract × 100)
    expect(bodyText).toContain('Net Credit')
    expect(bodyText).toMatch(/\+\$0\.70\/contract/)
    expect(bodyText).toContain('$70.00 total')
  })

  it('shows amber warning when new CC strike is below cost basis', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // New strike $172 < cost basis $174.00 (= $180 − $3.50 CSP − $2.50 CC) → below-cost-basis warning
    // Diff: $174.00 − $172.00 = $2.00/share
    await page.fill('[aria-label="New Strike"]', '172')

    const bodyText = await page.textContent('body')
    // Warning text from RollCcForm: "New strike is below your cost basis by $2.00/share"
    expect(bodyText).toContain('below your cost basis')
    expect(bodyText).toContain('$2.00')
    // Confirm Roll button should still be enabled (warning is non-blocking)
    const isDisabled = await page.locator('button:has-text("Confirm Roll")').isDisabled()
    expect(isDisabled).toBe(false)
  })

  it('creates linked ROLL_FROM and ROLL_TO leg pair on successful CC roll', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // Roll up & out: new strike $190, new expiration 2026-05-16
    // cost to close $3.50, new premium $4.20 → net credit $0.70/contract
    // new cost basis = $174.00 (post-CC) − $0.70 = $173.30/share
    await page.fill('[aria-label="New Strike"]', '190')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '3.50')
    await page.fill('[aria-label="New Premium"]', '4.20')

    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CC Rolled Successfully')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Roll Complete')
    expect(bodyText).toContain('CC Rolled Successfully')
    expect(bodyText).toContain('Roll From')
    expect(bodyText).toContain('Roll To')
    expect(bodyText).toContain('CC Open (unchanged)')
    // Net credit: $4.20 − $3.50 = $0.70/contract
    expect(bodyText).toMatch(/\+\$0\.70/)
    // New cost basis: $174.00 − $0.70 = $173.30/share
    expect(bodyText).toContain('173.30')
  })

  it('accepts CC roll out with same strike and later expiration', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // Same strike $185 (default), later expiration → Roll Out
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '1.80')
    await page.fill('[aria-label="New Premium"]', '3.10')

    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CC Rolled Successfully')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC Rolled Successfully')
    expect(bodyText).toContain('Roll Out')
  })

  it('accepts CC roll down and out with lower strike', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // New strike $182 < current $185, later expiration → Roll Down & Out
    await page.fill('[aria-label="New Strike"]', '182')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '2.00')
    await page.fill('[aria-label="New Premium"]', '2.50')

    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CC Rolled Successfully')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC Rolled Successfully')
    expect(bodyText).toContain('Roll Down & Out')
  })

  it('accepts CC roll up with same expiration and higher strike', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // New strike $190 > current $185, same expiration 2026-04-18 → Roll Up
    await page.fill('[aria-label="New Strike"]', '190')
    await selectDate(page, '[aria-label="New Expiration"]', CC_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '2.00')
    await page.fill('[aria-label="New Premium"]', '3.50')

    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CC Rolled Successfully')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('CC Rolled Successfully')
    expect(bodyText).toContain('Roll Up')
  })

  it('shows net debit preview and confirms roll when cost to close exceeds new premium', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // cost to close $5.00 > new premium $3.50 → net debit $1.50
    await page.fill('[aria-label="New Strike"]', '190')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)
    await page.fill('[aria-label="Cost to Close"]', '5.00')
    await page.fill('[aria-label="New Premium"]', '3.50')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Net Debit')
    expect(bodyText).toMatch(/-\$1\.50\/contract/)
    expect(bodyText).toContain('$150.00 total')
    expect(bodyText).toContain('This roll costs more to close than the new premium provides')

    // Confirm button must remain enabled — debit rolls are valid
    const isDisabled = await page.locator('button:has-text("Confirm Roll")').isDisabled()
    expect(isDisabled).toBe(false)
  })

  it('shows validation error when new expiration is before current expiration', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '1.50')
    await page.fill('[aria-label="New Premium"]', '2.00')
    await selectDate(page, '[aria-label="New Expiration"]', BEFORE_CC_EXPIRATION)

    await page.click('button:has-text("Confirm Roll")')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/on or after/i)
    expect(bodyText).not.toContain('CC Rolled Successfully')
  })

  it('shows validation error when neither strike nor expiration changed', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    // Set new_expiration to same as current CC_EXPIRATION; new_strike defaults to '185.00'
    await selectDate(page, '[aria-label="New Expiration"]', CC_EXPIRATION)

    // Confirm Roll button must be disabled when rollType === 'No Change'
    const isDisabled = await page.locator('button:has-text("Confirm Roll")').isDisabled()
    expect(isDisabled).toBe(true)
  })

  it('shows validation error when cost to close is zero', async () => {
    const page = await launchFreshApp()
    await reachCcOpenDetail(page)
    await openRollCcSheet(page)

    await page.fill('[aria-label="Cost to Close"]', '0')
    await page.fill('[aria-label="New Premium"]', '2.80')
    await selectDate(page, '[aria-label="New Expiration"]', NEW_EXPIRATION)

    await page.click('button:has-text("Confirm Roll")')

    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/cost to close must be greater than zero/i)
    expect(bodyText).not.toContain('CC Rolled Successfully')
  })
})
