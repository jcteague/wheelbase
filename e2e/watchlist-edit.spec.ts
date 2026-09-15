// [US-69] Editing a watchlist entry — E2E tests.
//
// Exactly one `it()` per acceptance-criteria scenario in Linear OPT-5, each named
// verbatim. The suite boots the real Electron app over the offline seams, so every save
// asserted below went through the real `watchlist:update` channel, the real service and
// the real SQLite file, and every verdict re-read below was recomputed by the real
// `core/watchlist-signal.ts`.
//
// The Background is one stock: AAPL on the watchlist with the note "Would own below $170"
// and the condition "Would own below" at $170.00. A scenario that needs more states only
// its delta from that, so each test's launch options read as its own Given.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import {
  AAPL_PUT,
  type ScreenerLaunchOpts,
  cardReason,
  launchScreener,
  openEdit,
  reloadBench,
  saveEdit,
  selectCard,
  waitForDetail,
  promoteCard,
  waitForBenchCard
} from './screener-helpers'
import { observedSessionsAgo } from './trading-day-fixtures'

const AAPL_NOTE = 'Would own below $170'

function backgroundOpts(overrides: ScreenerLaunchOpts = {}): ScreenerLaunchOpts {
  return {
    fixtures: [AAPL_PUT],
    watchlistNotes: { AAPL: AAPL_NOTE },
    conditions: { AAPL: { ownBelowPrice: 170 } },
    ...overrides
  }
}

function detailText(page: Page, testId: string): Promise<string> {
  return page.locator(`[data-testid="${testId}"]`).innerText()
}

describe('US-69: edit a watchlist entry', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, overrides: ScreenerLaunchOpts = {}): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, backgroundOpts(overrides))
    app = launched.app
    await waitForBenchCard(launched.page, 'AAPL')
    return launched.page
  }

  it('Edit the thesis text', async () => {
    const page = await launch('wb-e2e-us69-ac1')

    await openEdit(page, 'AAPL')
    await page.fill('#thesis', 'Would own below $165 after the split')
    await saveEdit(page)

    expect(
      await waitForDetail(page, 'bench-detail-thesis', 'Would own below $165 after the split')
    ).toBe('Would own below $165 after the split')

    await reloadBench(page)
    await selectCard(page, 'AAPL')

    expect(await detailText(page, 'bench-detail-thesis')).toBe(
      'Would own below $165 after the split'
    )
  })

  it('Clear the thesis', async () => {
    const page = await launch('wb-e2e-us69-ac2')

    await openEdit(page, 'AAPL')
    await page.fill('#thesis', '')
    await saveEdit(page)

    expect(await waitForDetail(page, 'bench-detail-thesis', 'No thesis yet.')).toBe(
      'No thesis yet.'
    )
    expect(await page.locator('[data-testid="watchlist-row-AAPL"]').count()).toBe(1)
    expect(await page.locator('[data-testid="bench-count"]').innerText()).toBe('1')
  })

  it('Reject an over-length thesis', async () => {
    const page = await launch('wb-e2e-us69-ac3')

    await openEdit(page, 'AAPL')
    await page.fill('#thesis', 'a'.repeat(501))
    await page.click('[data-testid="watchlist-edit-submit"]')

    await page.waitForSelector('text=Note must be 500 characters or fewer')

    await reloadBench(page)
    await selectCard(page, 'AAPL')

    expect(await detailText(page, 'bench-detail-thesis')).toBe(AAPL_NOTE)
  })

  it('Change a condition value', async () => {
    const page = await launch('wb-e2e-us69-ac4')

    await openEdit(page, 'AAPL')
    await page.fill('#ownBelowPrice', '165')
    await saveEdit(page)

    expect(await waitForDetail(page, 'bench-gate-price', '≤ $165')).toContain('≤ $165')
  })

  it('Add a condition to an existing entry', async () => {
    const page = await launch('wb-e2e-us69-ac5')

    await openEdit(page, 'AAPL')
    await page.click('button:has-text("Wait for high IV")')
    await page.fill('#ivrTrigger', '50')
    await saveEdit(page)

    expect(await waitForDetail(page, 'bench-gate-iv', 'IVR ≥ 50')).toContain('IVR ≥ 50')
    expect(['met', 'unmet', 'unknown']).toContain(
      await page.getAttribute('[data-testid="bench-gate-iv"]', 'data-verdict')
    )
  })

  it('Remove a condition', async () => {
    const page = await launch('wb-e2e-us69-ac6', {
      conditions: { AAPL: { ownBelowPrice: 170, ivrTrigger: 50 } }
    })

    await openEdit(page, 'AAPL')
    // The condition row, not the chip: the chip carries its label as bare text, the row
    // states it in a span of its own.
    await page
      .locator('div:has(> span:text-is("Wait for high IV"))')
      .locator('[title="Remove condition"]')
      .click()
    await saveEdit(page)

    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="bench-gate-iv"]').length === 0
    )
    expect(await detailText(page, 'bench-gate-price')).toContain('≤ $170')
  })

  it('The edit is opened from the stock detail panel', async () => {
    const page = await launch('wb-e2e-us69-ac7')

    await selectCard(page, 'AAPL')

    expect(await page.locator('[data-testid="bench-detail-edit"]').isVisible()).toBe(true)

    await page.click('[data-testid="bench-detail-edit"]')

    expect(
      await page
        .locator('[data-testid="bench-detail-panel"] [data-testid="watchlist-edit-submit"]')
        .isVisible()
    ).toBe(true)
  })

  it('Changing a condition re-judges the bench', async () => {
    const page = await launch('wb-e2e-us69-ac8', {
      conditions: { AAPL: { ivrTrigger: 50 } },
      ivr: { AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) } }
    })

    await waitForBenchCard(page, 'AAPL', 'waiting')
    expect(await cardReason(page, 'AAPL')).toBe('IV low')

    await openEdit(page, 'AAPL')
    await page.fill('#ivrTrigger', '30')
    await saveEdit(page)

    expect(await waitForDetail(page, 'bench-gate-iv', 'IVR ≥ 30 · met')).toBe('IVR ≥ 30 · met')
    expect(await page.getAttribute('[data-testid="bench-gate-iv"]', 'data-verdict')).toBe('met')

    // No `bench-refresh` click: the save's own invalidation is what has to move the card.
    await waitForBenchCard(page, 'AAPL', 'meets')
  })

  it('The ticker cannot be changed in the edit form', async () => {
    const page = await launch('wb-e2e-us69-ac9')

    await openEdit(page, 'AAPL')

    expect(await detailText(page, 'watchlist-entry-ticker')).toBe('AAPL')
    expect(await page.locator('#ticker').count()).toBe(0)
    expect(await page.getByRole('textbox', { name: 'Ticker' }).count()).toBe(0)
  })

  it('The thesis seeds the promote flow', async () => {
    // No price gate, so the default underlying quote lets AAPL meet criteria and offer
    // the Review trade action this scenario promotes through.
    const page = await launch('wb-e2e-us69-ac10', { conditions: {} })

    await waitForBenchCard(page, 'AAPL', 'meets')
    await promoteCard(page, 'AAPL')

    expect(await page.inputValue('#thesis')).toBe(AAPL_NOTE)
  })
})
