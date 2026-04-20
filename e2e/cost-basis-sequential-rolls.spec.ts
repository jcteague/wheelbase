import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'
import { openPosition, openDetailFor, selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// US-16: Cost basis after sequential rolls — E2E tests (one per AC)
// ---------------------------------------------------------------------------

describe('US-16: cost basis after sequential rolls', () => {
  let app: ElectronApplication
  let dbPath: string

  const CSP_EXPIRATION = localDate(30)
  const ROLL1_EXPIRATION = localDate(60)
  const ROLL2_EXPIRATION = localDate(90)
  const ROLL3_EXPIRATION = localDate(120)
  const CC_EXPIRATION = localDate(30)
  const CC_ROLL_EXPIRATION = localDate(60)

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  async function launchFreshApp(): Promise<Page> {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-us16-${Date.now()}.db`)
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  /** Open a CSP position with given parameters */
  async function openCsp(
    page: Page,
    opts: { strike: string; premium: string; contracts: string; expiration: string }
  ): Promise<void> {
    const [year, month, day] = opts.expiration.split('-').map(Number)
    await openPosition(page, {
      ticker: 'AAPL',
      strike: opts.strike,
      contracts: opts.contracts,
      premium: opts.premium,
      year,
      month,
      day
    })
  }

  /** Navigate to detail and open the Roll CSP sheet */
  async function openRollCspSheet(page: Page): Promise<void> {
    await page.click('[data-testid="roll-csp-btn"]')
    await page.waitForSelector('text=Roll Cash-Secured Put')
  }

  /** Fill and submit the CSP roll form */
  async function doRollCsp(
    page: Page,
    opts: {
      costToClose: string
      newPremium: string
      newExpiration: string
      newStrike?: string
    }
  ): Promise<void> {
    await openRollCspSheet(page)
    await page.fill('[aria-label="Cost to Close"]', opts.costToClose)
    await page.fill('[aria-label="New Premium"]', opts.newPremium)
    if (opts.newStrike) {
      await page.fill('[aria-label="New Strike"]', opts.newStrike)
    }
    await selectDate(page, '[aria-label="New Expiration"]', opts.newExpiration)
    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CSP Rolled Successfully')
  }

  /** Close the roll success sheet and return to position detail */
  async function dismissRollSuccess(page: Page): Promise<void> {
    await page.click('[aria-label="Close sheet"]')
    await page.waitForSelector('[data-testid="position-detail"]')
  }

  /** Record assignment from the position detail page */
  async function doAssignment(page: Page): Promise<void> {
    const today = localToday()
    await page.click('[data-testid="record-assignment-btn"]')
    await page.waitForSelector('text=Assign CSP to Shares')
    await selectDate(page, '#assignment-date', today)
    await page.click('button:has-text("Confirm Assignment")')
    await page.waitForSelector('text=HOLDING 100 SHARES')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')
  }

  /** Open a covered call from the position detail page. */
  async function doOpenCc(
    page: Page,
    opts: { strike: string; premium: string; expiration: string }
  ): Promise<void> {
    const today = localToday()
    await page.click('[data-testid="open-covered-call-btn"]')
    await page.waitForSelector('text=Open Covered Call')
    await dismissStaleCalendar(page)
    await page.fill('[data-testid="cc-strike"]', opts.strike)
    await page.fill('[data-testid="cc-premium"]', opts.premium)
    await selectDate(page, '[data-testid="cc-expiration"]', opts.expiration)
    await selectDate(page, '[data-testid="cc-fill-date"]', today)
    await page.click('[data-testid="cc-submit"]')
    await page.waitForSelector('text=CC OPEN')
    await page.click('text=View full position history')
    await page.waitForSelector('[data-testid="position-detail"]')
  }

  /** Dismiss any stale calendar popover left in the DOM */
  async function dismissStaleCalendar(page: Page): Promise<void> {
    const staleCalendar = await page.locator('.rdp-month_caption').count()
    if (staleCalendar > 0) {
      await page.keyboard.press('Escape')
      await page.waitForSelector('.rdp-month_caption', { state: 'detached' })
    }
  }

  /** Open the Roll CC sheet and submit */
  async function doRollCc(
    page: Page,
    opts: {
      costToClose: string
      newPremium: string
      newExpiration: string
      newStrike?: string
    }
  ): Promise<void> {
    await page.click('[data-testid="roll-cc-btn"]')
    await page.waitForSelector('text=Roll Covered Call')
    await page.fill('[aria-label="Cost to Close"]', opts.costToClose)
    await page.fill('[aria-label="New Premium"]', opts.newPremium)
    if (opts.newStrike) {
      await page.fill('[aria-label="New Strike"]', opts.newStrike)
    }
    await selectDate(page, '[aria-label="New Expiration"]', opts.newExpiration)
    await page.click('button:has-text("Confirm Roll")')
    await page.waitForSelector('text=CC Rolled Successfully')
  }

  // -------------------------------------------------------------------------
  // AC1: Cost basis after single CSP roll with net credit
  // CSP $50 / $2.00, roll (close $0.80, new $1.50, net credit $0.70)
  // Expected: basis $47.30, total premium $270.00
  // -------------------------------------------------------------------------
  it('AC1: cost basis after single CSP roll with net credit — basis shows $47.30, total premium $270', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doRollCsp(page, {
      costToClose: '0.80',
      newPremium: '1.50',
      newExpiration: ROLL1_EXPIRATION
    })

    // Roll success screen shows cost basis transition
    const successText = await page.textContent('body')
    expect(successText).toContain('$48.00')
    expect(successText).toContain('$47.30')

    await dismissRollSuccess(page)

    // Position detail shows updated cost basis
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Effective Basis / Share')
    expect(bodyText).toContain('$47.30')
    expect(bodyText).toContain('Premium Collected')
    expect(bodyText).toContain('$270.00')
  })

  // -------------------------------------------------------------------------
  // AC2: Cost basis after single CSP roll with net debit
  // CSP $50 / $2.00, roll (close $2.50, new $2.00, net debit $0.50)
  // Expected: basis $48.50, total premium $150.00
  // -------------------------------------------------------------------------
  it('AC2: cost basis after single CSP roll with net debit — basis shows $48.50, total premium $150', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doRollCsp(page, {
      costToClose: '2.50',
      newPremium: '2.00',
      newExpiration: ROLL1_EXPIRATION
    })

    const successText = await page.textContent('body')
    expect(successText).toContain('$48.00')
    expect(successText).toContain('$48.50')

    await dismissRollSuccess(page)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('$48.50')
    expect(bodyText).toContain('$150.00')
  })

  // -------------------------------------------------------------------------
  // AC3: Cost basis after three sequential CSP rolls
  // CSP $50 / $2.00 → Roll1 credit $0.70 → Roll2 credit $0.80 → Roll3 debit $0.20
  // Expected: final basis $46.70, total premium $330.00
  // -------------------------------------------------------------------------
  it('AC3: cost basis after three sequential CSP rolls — final basis $46.70, total premium $330', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    // Roll 1: net credit $0.70 (close $0.80, new $1.50)
    await doRollCsp(page, {
      costToClose: '0.80',
      newPremium: '1.50',
      newExpiration: ROLL1_EXPIRATION
    })
    await dismissRollSuccess(page)

    // Roll 2: net credit $0.80 (close $1.00, new $1.80)
    await doRollCsp(page, {
      costToClose: '1.00',
      newPremium: '1.80',
      newExpiration: ROLL2_EXPIRATION
    })
    await dismissRollSuccess(page)

    // Roll 3: net debit $0.20 (close $1.60, new $1.40)
    await doRollCsp(page, {
      costToClose: '1.60',
      newPremium: '1.40',
      newExpiration: ROLL3_EXPIRATION
    })

    const successText = await page.textContent('body')
    expect(successText).toContain('$46.70')

    await dismissRollSuccess(page)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('$46.70')
    expect(bodyText).toContain('$330.00')
  })

  // -------------------------------------------------------------------------
  // AC4: Cost basis after CSP rolls followed by assignment
  // CSP $50 / $2.00, roll (net credit $0.70), assign
  // Expected: assignment basis $47.30
  // -------------------------------------------------------------------------
  it('AC4: cost basis after CSP rolls followed by assignment — assignment basis $47.30', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doRollCsp(page, {
      costToClose: '0.80',
      newPremium: '1.50',
      newExpiration: ROLL1_EXPIRATION
    })
    await dismissRollSuccess(page)

    // Record assignment
    await doAssignment(page)

    // Position detail should show basis $47.30 in the HOLDING_SHARES state
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('$47.30')
  })

  // -------------------------------------------------------------------------
  // AC5: Cost basis after CC roll with net credit
  // CSP $50 / $2.00 → assign (basis $48.00) → CC $52 / $1.50 (basis $46.50)
  // → CC roll (close $2.00, new $2.80, net credit $0.80) → basis $45.70
  //
  // Note: Using numbers that work end-to-end:
  // Assignment basis = $50 - $2.00 = $48.00
  // CC open: $48.00 - $1.50 = $46.50
  // CC roll net credit $0.80: $46.50 - $0.80 = $45.70
  // -------------------------------------------------------------------------
  it('AC5: cost basis after CC roll with net credit — basis decreases by net credit', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doAssignment(page)
    await doOpenCc(page, { strike: '52', premium: '1.50', expiration: CC_EXPIRATION })

    // Verify pre-roll basis
    let bodyText = await page.textContent('body')
    expect(bodyText).toContain('$46.50')

    await doRollCc(page, {
      costToClose: '2.00',
      newPremium: '2.80',
      newExpiration: CC_ROLL_EXPIRATION,
      newStrike: '55'
    })

    // CC roll success shows basis transition
    const successText = await page.textContent('body')
    expect(successText).toContain('$46.50')
    expect(successText).toContain('$45.70')

    await dismissRollSuccess(page)

    bodyText = await page.textContent('body')
    expect(bodyText).toContain('$45.70')
  })

  // -------------------------------------------------------------------------
  // AC6: Cost basis snapshot chain is complete and auditable — 6 snapshots
  // Full lifecycle: CSP open → CSP roll (same-strike) → CSP roll (roll-down)
  //   → assignment → CC open → CC roll
  // Each step creates a snapshot; verify via leg history table row count
  // -------------------------------------------------------------------------
  it(
    'AC6: cost basis snapshot chain is complete and auditable — leg history shows all events with running basis',
    { timeout: 120_000 },
    async () => {
      const page = await launchFreshApp()
      await openCsp(page, {
        strike: '50',
        premium: '2.00',
        contracts: '1',
        expiration: CSP_EXPIRATION
      })
      await openDetailFor(page, 'AAPL')

      // CSP roll same-strike
      await doRollCsp(page, {
        costToClose: '0.80',
        newPremium: '1.50',
        newExpiration: ROLL1_EXPIRATION
      })
      await dismissRollSuccess(page)

      // CSP roll-down to $47
      await doRollCsp(page, {
        costToClose: '1.20',
        newPremium: '1.50',
        newStrike: '47',
        newExpiration: ROLL2_EXPIRATION
      })
      await dismissRollSuccess(page)

      // Assign
      await doAssignment(page)

      // Open CC
      await doOpenCc(page, { strike: '52', premium: '1.50', expiration: CC_EXPIRATION })

      // Roll CC
      await doRollCc(page, {
        costToClose: '2.00',
        newPremium: '2.80',
        newStrike: '55',
        newExpiration: CC_ROLL_EXPIRATION
      })
      await dismissRollSuccess(page)

      // The leg history table should show all events with Running Basis / Share column
      const bodyText = await page.textContent('body')
      expect(bodyText).toContain('Running Basis / Share')
      expect(bodyText).toContain('Leg History')

      // Verify the table has rows for: CSP Open, Roll From, Roll To, Roll From, Roll To,
      // Assign, CC Open, Roll From, Roll To — at least 9 leg rows
      const legRows = page.locator('table:has-text("Running Basis / Share") tbody tr')
      const rowCount = await legRows.count()
      expect(rowCount).toBeGreaterThanOrEqual(9)
    }
  )

  // -------------------------------------------------------------------------
  // AC7: Multi-contract roll — same per-share basis regardless of contract count
  // CSP $50 / $2.00 / 3 contracts, roll (close $0.80, new $1.50)
  // Expected: basisPerShare $47.30 (same as 1-contract), totalPremium increases by $210
  // Initial premium: $2.00 × 3 × 100 = $600.00
  // Net credit: $0.70 × 3 × 100 = $210.00
  // Total premium: $600.00 + $210.00 = $810.00
  // -------------------------------------------------------------------------
  it('AC7: multi-contract roll applies net credit per contract correctly — same per-share basis', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '3',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doRollCsp(page, {
      costToClose: '0.80',
      newPremium: '1.50',
      newExpiration: ROLL1_EXPIRATION
    })

    const successText = await page.textContent('body')
    expect(successText).toContain('$47.30')

    await dismissRollSuccess(page)

    const bodyText = await page.textContent('body')
    // Per-share basis same as single-contract
    expect(bodyText).toContain('$47.30')
    // Total premium: $600 initial + $210 net credit = $810
    expect(bodyText).toContain('$810.00')
  })

  // -------------------------------------------------------------------------
  // AC10: Multi-contract CC roll with partial coverage — basis prorated
  // CSP $50 / $2.00 / 2 contracts → assign (200 shares, basis $48.00)
  // → CC 1 contract $52 / $1.50 (income $150 / 200 shares = $0.75/sh → basis $47.25)
  // → CC roll (close $2.00, new $2.80, net credit $0.80)
  //   income $80 / 200 shares = $0.40/sh → basis $47.25 - $0.40 = $46.85
  //
  // Without proration the wrong answer would be:
  //   $47.25 - $0.80 = $46.45 (applying full net credit per share)
  // -------------------------------------------------------------------------
  it(
    'AC10: multi-contract CC roll with partial coverage — basis prorated across all held shares',
    { timeout: 120_000 },
    async () => {
      const page = await launchFreshApp()

      // Open CSP with 2 contracts
      await openCsp(page, {
        strike: '50',
        premium: '2.00',
        contracts: '2',
        expiration: CSP_EXPIRATION
      })
      await openDetailFor(page, 'AAPL')

      // Assign — 200 shares
      const today = localToday()
      await page.click('[data-testid="record-assignment-btn"]')
      await page.waitForSelector('text=Assign CSP to Shares')
      await selectDate(page, '#assignment-date', today)
      await page.click('button:has-text("Confirm Assignment")')
      await page.waitForSelector('text=HOLDING 200 SHARES')
      await page.click('text=View full position history')
      await page.waitForSelector('[data-testid="position-detail"]')

      // Open CC with only 1 contract (partial coverage on 200 shares)
      await page.click('[data-testid="open-covered-call-btn"]')
      await page.waitForSelector('text=Open Covered Call')
      await dismissStaleCalendar(page)
      await page.fill('[data-testid="cc-strike"]', '52')
      await page.fill('[data-testid="cc-premium"]', '1.50')
      await page.fill('[data-testid="cc-contracts"]', '1')
      await selectDate(page, '[data-testid="cc-expiration"]', CC_EXPIRATION)
      await selectDate(page, '[data-testid="cc-fill-date"]', today)
      await page.click('[data-testid="cc-submit"]')
      await page.waitForSelector('text=CC OPEN')
      await page.click('text=View full position history')
      await page.waitForSelector('[data-testid="position-detail"]')

      // Verify basis after partial CC open: $48.00 - ($150 / 200) = $48.00 - $0.75 = $47.25
      let bodyText = await page.textContent('body')
      expect(bodyText).toContain('$47.25')

      // Roll CC: close $2.00, new $2.80, net credit $0.80
      await doRollCc(page, {
        costToClose: '2.00',
        newPremium: '2.80',
        newStrike: '55',
        newExpiration: CC_ROLL_EXPIRATION
      })

      // CC roll success should show prorated basis
      const successText = await page.textContent('body')
      expect(successText).toContain('$47.25') // previous basis
      expect(successText).toContain('$46.85') // new basis (prorated)

      await dismissRollSuccess(page)

      bodyText = await page.textContent('body')
      // Correct prorated value
      expect(bodyText).toContain('$46.85')
      // Ensure the non-prorated wrong value is NOT shown
      expect(bodyText).not.toContain('$46.45')
    }
  )

  // -------------------------------------------------------------------------
  // AC8: Cost basis after CSP roll down to lower strike
  // CSP $50 / $2.00, roll down to $47 (close $1.20, new $1.50, net credit $0.30)
  // Expected: basis $44.70, NOT $47.70
  // Formula: $48.00 + ($47 - $50) - $0.30 = $48.00 - $3.00 - $0.30 = $44.70
  // -------------------------------------------------------------------------
  it('AC8: cost basis after CSP roll down to lower strike — basis is $44.70, NOT $47.70', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doRollCsp(page, {
      costToClose: '1.20',
      newPremium: '1.50',
      newStrike: '47',
      newExpiration: ROLL1_EXPIRATION
    })

    const successText = await page.textContent('body')
    expect(successText).toContain('$44.70')

    await dismissRollSuccess(page)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('$44.70')
    // Ensure it's NOT the wrong value that ignores strike delta
    expect(bodyText).not.toContain('$47.70')
  })

  // -------------------------------------------------------------------------
  // AC9: Cost basis after CC roll up to higher strike — strike change does NOT affect basis
  // CSP $50 / $2.00 → assign (basis $48.00) → CC $52 / $1.50 (basis $46.50)
  // → CC roll from $52 to $55 (close $2.00, new $2.80, net credit $0.80)
  // Expected: basis $45.70 (46.50 - 0.80), NOT adjusted by the $3 strike increase
  // -------------------------------------------------------------------------
  it('AC9: cost basis after CC roll up to higher strike — strike change does not affect basis', async () => {
    const page = await launchFreshApp()
    await openCsp(page, {
      strike: '50',
      premium: '2.00',
      contracts: '1',
      expiration: CSP_EXPIRATION
    })
    await openDetailFor(page, 'AAPL')

    await doAssignment(page)
    await doOpenCc(page, { strike: '52', premium: '1.50', expiration: CC_EXPIRATION })

    await doRollCc(page, {
      costToClose: '2.00',
      newPremium: '2.80',
      newStrike: '55',
      newExpiration: CC_ROLL_EXPIRATION
    })

    // CC roll success should show basis changed by net credit only
    const successText = await page.textContent('body')
    expect(successText).toContain('$45.70')

    await dismissRollSuccess(page)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('$45.70')
    // Basis should NOT be affected by the $3 strike increase
    // If strike delta was incorrectly applied: $46.50 + ($55 - $52) - $0.80 = $48.70
    expect(bodyText).not.toContain('$48.70')
  })
})
