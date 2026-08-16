// [US-67] Configure screening criteria — E2E tests.
//
// Exactly one `it()` per acceptance-criteria scenario in
// docs/epics/08-stories/US-67-configure-screening-defaults.md; the names mirror the
// Gherkin. Every criteria write goes through the real sheet — never a direct
// `app_settings` write — so each test proves the whole path: form → Zod → IPC →
// service → `app_settings` → engine → re-rendered table. Only the market-data
// provider and the IVR scrape are faked, through the existing e2e seams.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import {
  RANKED_IVR,
  RANKED_PUTS,
  PEP_PUT,
  SAVE_CRITERIA_BUTTON,
  SBUX_PUT,
  STOCK_QUOTES,
  TSLA_PUT,
  criteriaChips,
  criteriaValues,
  dismissCriteriaSheet,
  launchScreener,
  openCriteriaSheet,
  rankedTickers,
  relaunchScreener,
  saveCriteria,
  segmentPressed,
  setCriteriaValues,
  waitForCriteriaSheetClosed,
  waitForRankedRowCount,
  type ScreenerLaunchOpts
} from './screener-helpers'

/** The strip the Background pins, chip by chip. */
const DEFAULT_CHIPS = ['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']

/** The Background's persisted criteria, as the sheet's inputs render them. */
const DEFAULT_FIELDS = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: '30',
  dteMax: '45',
  minOpenInterest: '500',
  maxSpreadPercent: '10',
  maxUnderlyingPrice: '',
  minIvRank: ''
}

describe('US-67: configure screening criteria', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, opts: ScreenerLaunchOpts = {}): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, opts)
    app = launched.app
    return launched.page
  }

  it('opens the criteria sheet from the page header', async () => {
    const page = await launch('wb-e2e-us67-header', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')

    // The sheet opens *over* the results — the table is still mounted behind it.
    expect(await page.locator('[data-testid="screener-row-KO"]').count()).toBe(1)

    // Every field is pre-filled from the persisted criteria.
    expect(await criteriaValues(page)).toEqual(DEFAULT_FIELDS)
    expect(await segmentPressed(page, 'price-ceiling-off')).toBe(true)
    expect(await segmentPressed(page, 'iv-rank-floor-off')).toBe(true)
    expect(await segmentPressed(page, 'earnings-exclude')).toBe(true)

    // The sidebar navigation remains visible and clickable — SheetOverlay starts at
    // left-[200px], so nothing covers the 200px rail.
    const navItem = page.locator('a[href="#/watchlist"]')
    expect(await navItem.isVisible()).toBe(true)
    await navItem.click()
    await page.waitForFunction(() => location.hash === '#/watchlist')
  })

  it('opens the criteria sheet from the criteria summary strip', async () => {
    const page = await launch('wb-e2e-us67-strip', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    expect(await criteriaChips(page)).toEqual(DEFAULT_CHIPS)

    await openCriteriaSheet(page, 'strip')

    expect(await criteriaValues(page)).toEqual(DEFAULT_FIELDS)
  })

  it('opens the criteria sheet from the empty state', async () => {
    // TSLA's 22% spread is the only fixture, so nothing survives the default criteria.
    const page = await launch('wb-e2e-us67-empty', { fixtures: [TSLA_PUT] })
    await page.waitForSelector('[data-testid="screener-empty"]')

    expect(await page.textContent('[data-testid="screener-empty"]')).toContain('Adjust criteria')

    await openCriteriaSheet(page, 'empty')

    expect(await criteriaValues(page)).toEqual(DEFAULT_FIELDS)
    // The trader is not navigated away from the Screener.
    expect(await page.evaluate(() => location.hash)).toBe('#/screener')
  })

  it('saves new screening criteria and re-screens', async () => {
    const page = await launch('wb-e2e-us67-save', {
      fixtures: [...RANKED_PUTS, SBUX_PUT],
      ivr: RANKED_IVR
    })
    await page.waitForSelector('[data-testid="screener-row-KO"]')
    // SBUX sits below the default delta band, so it starts out excluded.
    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, {
      deltaMin: '0.15',
      deltaMax: '0.20',
      dteMin: '40',
      dteMax: '45'
    })
    await saveCriteria(page)

    // The sheet closes and the page confirms the save.
    await waitForCriteriaSheetClosed(page)
    await page.waitForSelector('text=Screening criteria saved')

    // The results refresh: only SBUX (0.18Δ, 42 DTE) is inside the new band.
    await page.waitForSelector('[data-testid="screener-row-SBUX"]')
    expect(await rankedTickers(page)).toEqual(['SBUX'])

    expect(await criteriaChips(page)).toEqual([
      'Δ 0.15–0.20',
      'DTE 40–45',
      'OI ≥ 500',
      'Spread ≤ 10%',
      'Earnings Exclude'
    ])
  })

  it('saved criteria survive a restart', async () => {
    const opts: ScreenerLaunchOpts = { ivr: RANKED_IVR }
    const page = await launch('wb-e2e-us67-restart', opts)
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, { deltaMin: '0.15', deltaMax: '0.20' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    // Same database file, fresh process, no re-seeding.
    const relaunched = await relaunchScreener(app, dbPath, opts)
    app = relaunched.app

    await openCriteriaSheet(relaunched.page, 'header')

    const values = await criteriaValues(relaunched.page)
    expect(values.deltaMin).toBe('0.15')
    expect(values.deltaMax).toBe('0.20')
  })

  it('toggles earnings handling between exclude and flag', async () => {
    // Persistence only — what the screener DOES with the choice is US-70.
    const page = await launch('wb-e2e-us67-earnings', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')
    await page.click('[data-testid="earnings-flag"]')
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    await page.waitForSelector('text=Screening criteria saved')
    expect(await criteriaChips(page)).toContain('Earnings Flag only')

    await openCriteriaSheet(page, 'header')
    expect(await segmentPressed(page, 'earnings-flag')).toBe(true)
    expect(await segmentPressed(page, 'earnings-exclude')).toBe(false)
  })

  it('rejects an inverted delta band', async () => {
    const page = await launch('wb-e2e-us67-inverted-delta', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, { deltaMin: '0.30', deltaMax: '0.20' })

    await page.waitForSelector('text=Minimum delta must be less than maximum delta')
    expect(await page.isDisabled(SAVE_CRITERIA_BUTTON)).toBe(true)
  })

  it('rejects an inverted DTE window', async () => {
    const page = await launch('wb-e2e-us67-inverted-dte', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, { dteMin: '45', dteMax: '30' })

    await page.waitForSelector('text=Minimum DTE must be less than maximum DTE')
    expect(await page.isDisabled(SAVE_CRITERIA_BUTTON)).toBe(true)
  })

  it('rejects out-of-range criteria', async () => {
    // The AC's Examples table, driven through the real form one row at a time.
    const examples = [
      { field: 'deltaMax', value: '1.5', message: 'Delta must be between 0.01 and 0.99' },
      { field: 'dteMin', value: '0', message: 'DTE must be at least 1' },
      {
        field: 'minOpenInterest',
        value: '-100',
        message: 'Open interest floor cannot be negative'
      },
      { field: 'maxSpreadPercent', value: '0', message: 'Max spread must be between 1% and 50%' }
    ] as const

    const page = await launch('wb-e2e-us67-out-of-range', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')
    const rankedBefore = await rankedTickers(page)

    for (const example of examples) {
      await openCriteriaSheet(page, 'header')
      await setCriteriaValues(page, { [example.field]: example.value })

      await page.waitForSelector(`text=${example.message}`)
      expect(await page.isDisabled(SAVE_CRITERIA_BUTTON)).toBe(true)

      await dismissCriteriaSheet(page, 'cancel')

      // No criteria are saved, and the results behind the sheet are unchanged.
      expect(await criteriaChips(page)).toEqual(DEFAULT_CHIPS)
      expect(await rankedTickers(page)).toEqual(rankedBefore)
    }
  })

  it('leaves the IV-rank floor off by default and excludes below it when enabled', async () => {
    const page = await launch('wb-e2e-us67-ivr-floor', {
      fixtures: [...RANKED_PUTS, PEP_PUT],
      ivr: { ...RANKED_IVR, PEP: 22 }
    })
    await page.waitForSelector('[data-testid="screener-row-PEP"]')

    // Floor off: nothing is excluded for low IV rank.
    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT', 'PEP'])

    await openCriteriaSheet(page, 'header')
    await page.click('[data-testid="iv-rank-floor-on"]')
    await setCriteriaValues(page, { minIvRank: '30' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    // PEP (IVR 22) drops out; MSFT's IV rank is unknown, which never excludes.
    await waitForRankedRowCount(page, 3)
    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])
    expect(await criteriaChips(page)).toContain('IVR ≥ 30')
  })

  it('leaves the price ceiling off by default and excludes above it when enabled', async () => {
    const page = await launch('wb-e2e-us67-price-ceiling', {
      ivr: RANKED_IVR,
      stockQuotes: STOCK_QUOTES
    })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    // Ceiling off: MSFT ($420 underlying) still ranks.
    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])

    await openCriteriaSheet(page, 'header')
    await page.click('[data-testid="price-ceiling-on"]')
    await setCriteriaValues(page, { maxUnderlyingPrice: '75' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    // Only KO ($62) trades below the ceiling.
    await waitForRankedRowCount(page, 1)
    expect(await rankedTickers(page)).toEqual(['KO'])
    expect(await criteriaChips(page)).toContain('Price ≤ $75')
  })

  it('discards unsaved edits when the sheet is dismissed', async () => {
    const page = await launch('wb-e2e-us67-discard', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')
    const rankedBefore = await rankedTickers(page)

    // The AC lists all three dismissals, so all three are exercised here.
    for (const via of ['cancel', 'close', 'scrim'] as const) {
      await openCriteriaSheet(page, 'header')
      await setCriteriaValues(page, { deltaMin: '0.15', deltaMax: '0.20' })

      await dismissCriteriaSheet(page, via)

      // Nothing persisted, nothing re-screened.
      expect(await criteriaChips(page)).toEqual(DEFAULT_CHIPS)
      expect(await rankedTickers(page)).toEqual(rankedBefore)

      // Reopening shows the persisted band, not the discarded edit.
      await openCriteriaSheet(page, 'header')
      const values = await criteriaValues(page)
      expect(values.deltaMin).toBe('0.20')
      expect(values.deltaMax).toBe('0.30')
      await dismissCriteriaSheet(page, 'cancel')
    }
  })

  it('resets to defaults without persisting', async () => {
    const page = await launch('wb-e2e-us67-reset', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, { deltaMin: '0.15', deltaMax: '0.20' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)
    await page.waitForSelector('[data-testid="screener-criteria-strip"]:has-text("0.15–0.20")')

    await openCriteriaSheet(page, 'header')
    await page.click('button:has-text("Reset to defaults")')

    // Every field returns to its shipped default.
    expect(await criteriaValues(page)).toEqual(DEFAULT_FIELDS)
    expect(await segmentPressed(page, 'price-ceiling-off')).toBe(true)
    expect(await segmentPressed(page, 'iv-rank-floor-off')).toBe(true)
    expect(await segmentPressed(page, 'earnings-exclude')).toBe(true)

    // Nothing is persisted until "Save & re-screen" is clicked.
    await dismissCriteriaSheet(page, 'cancel')
    expect(await criteriaChips(page)).toContain('Δ 0.15–0.20')
  })

  it('does not show screening criteria in Settings', async () => {
    const page = await launch('wb-e2e-us67-settings', { ivr: RANKED_IVR })
    await page.waitForSelector('[data-testid="screener-row-KO"]')

    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await page.waitForSelector('[aria-label="Alert Defaults"]')

    // No screening-criteria section is shown.
    expect(await page.locator('input[aria-label="Minimum delta"]').count()).toBe(0)
    expect(await page.locator('[data-testid="screener-criteria-strip"]').count()).toBe(0)
    expect(await page.locator('text=Screening Criteria').count()).toBe(0)

    // The alert defaults and broker credentials sections are unchanged.
    expect(await page.locator('[aria-label="Alert Defaults"]').isVisible()).toBe(true)
    expect(await page.locator('[aria-label="Broker"]').isVisible()).toBe(true)
  })
})
