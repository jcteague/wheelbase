import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'
import { openPosition, openDetailFor, reachCcOpenState, reachHoldingSharesState } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-17: Reject Roll in Invalid Phase
// ---------------------------------------------------------------------------

describe('reject roll in invalid phase', () => {
  let app: ElectronApplication
  let dbPath: string

  const CSP_EXPIRATION = localDate(30)
  const CC_EXPIRATION = localDate(60)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-reject-roll-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  function cspExpirationParts(): { year: number; month: number; day: number } {
    const [y, m, d] = CSP_EXPIRATION.split('-').map(Number)
    return { year: y, month: m, day: d }
  }

  // AC-1: CSP roll rejected for non-CSP_OPEN phase (HOLDING_SHARES)
  it('rejects CSP roll when position is in HOLDING_SHARES phase', async () => {
    const page = await launchFreshApp()
    const { year, month, day } = cspExpirationParts()

    await reachHoldingSharesState(page, { year, month, day })

    // Roll CSP button should NOT be visible in HOLDING_SHARES
    const rollCspCount = await page.locator('[data-testid="roll-csp-btn"]').count()
    expect(rollCspCount).toBe(0)
  })

  // AC-2: CC roll rejected for non-CC_OPEN phase (CSP_OPEN)
  it('rejects CC roll when position is in CSP_OPEN phase', async () => {
    const page = await launchFreshApp()
    const { year, month, day } = cspExpirationParts()

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year,
      month,
      day
    })
    await openDetailFor(page, 'AAPL')

    // Roll CC button should NOT be visible in CSP_OPEN
    const rollCcCount = await page.locator('[data-testid="roll-cc-btn"]').count()
    expect(rollCcCount).toBe(0)
  })

  // AC-3: Roll button hidden for non-rollable phase, shows phase-appropriate actions
  it('hides roll button and shows phase-appropriate actions for HOLDING_SHARES', async () => {
    const page = await launchFreshApp()
    const { year, month, day } = cspExpirationParts()

    await reachHoldingSharesState(page, { year, month, day })

    // No roll buttons
    const rollCspCount = await page.locator('[data-testid="roll-csp-btn"]').count()
    const rollCcCount = await page.locator('[data-testid="roll-cc-btn"]').count()
    expect(rollCspCount).toBe(0)
    expect(rollCcCount).toBe(0)

    // Phase-appropriate action: Open Covered Call
    await page.waitForSelector('[data-testid="open-covered-call-btn"]')
  })

  // AC-4: Roll CSP button visible and enabled for CSP_OPEN
  it('shows Roll CSP button and opens roll form for CSP_OPEN', async () => {
    const page = await launchFreshApp()
    const { year, month, day } = cspExpirationParts()

    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year,
      month,
      day
    })
    await openDetailFor(page, 'AAPL')

    // Roll CSP button should be visible
    await page.waitForSelector('[data-testid="roll-csp-btn"]')
    await page.click('[data-testid="roll-csp-btn"]')

    // Roll form sheet should open
    await page.waitForSelector('text=Roll Cash-Secured Put')
  })

  // AC-5: Roll CC button visible and enabled for CC_OPEN
  it('shows Roll CC button and opens roll form for CC_OPEN', async () => {
    const page = await launchFreshApp()

    await reachCcOpenState(page, '185', '2.00', CC_EXPIRATION)

    // Roll CC button should be visible
    await page.waitForSelector('[data-testid="roll-cc-btn"]')
    await page.click('[data-testid="roll-cc-btn"]')

    // Roll form sheet should open
    await page.waitForSelector('text=Roll Covered Call')
  })

  // AC-6: Roll rejected after CSP has been closed (expired)
  it('hides Roll CSP button after CSP has been expired', async () => {
    const page = await launchFreshApp()
    const today = localToday()
    const [ty, tm, td] = today.split('-').map(Number)

    // Create a CSP with today's expiration (DTE = 0) so we can expire it
    await openPosition(page, {
      ticker: 'AAPL',
      strike: '180',
      contracts: '1',
      premium: '3.50',
      year: ty,
      month: tm,
      day: td
    })
    await openDetailFor(page, 'AAPL')

    // Expire the CSP (DTE = 0 allows expiration)
    await page.click('[data-testid="record-expiration-btn"]')
    await page.waitForSelector('text=Expire CSP Worthless')
    await page.click('button:has-text("Confirm Expiration")')
    await page.waitForSelector('text=AAPL Expired Worthless')

    // Navigate back to the position detail
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')

    // Roll CSP button should NOT be visible in CSP_EXPIRED
    const rollCspCount = await page.locator('[data-testid="roll-csp-btn"]').count()
    expect(rollCspCount).toBe(0)
  })
})
