// [US-63] Create and remove watchlist entries — E2E tests (one per acceptance scenario).
//
// Drives the real add form end to end (renderer → IPC → sqlite → refetch). Prior
// tickers are seeded through the UI, never by direct DB writes. Selectors match the
// ids/testids introduced by the Watchlist page (Layer 5).
//
// [US-96] The page became the bench: each entry is a card instead of a table row, the
// add form sits behind `+ Add stock` once anything is saved, and the thesis and entry
// conditions a card no longer has room for are shown in the detail panel beside it. Every
// scenario is unchanged — only where each value is read from has moved.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, getPage, launchApp, tmpDb } from './assignment-helpers'

async function goToWatchlist(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/watchlist'
  })
  // [US-96] The add form is revealed by `+ Add stock` and shown unconditionally only
  // while the bench is empty — so opening it here is what keeps it mounted once the
  // first ticker lands and the empty state goes away.
  await page.waitForSelector('[data-testid="bench-add-toggle"]')
  if ((await page.getAttribute('[data-testid="bench-add-toggle"]', 'aria-expanded')) !== 'true') {
    await page.click('[data-testid="bench-add-toggle"]')
  }
  await page.waitForSelector('[data-testid="watchlist-add-submit"]')
}

type AddTickerOpts = {
  ticker: string
  thesis?: string
  ownBelow?: string
  ivr?: string
}

async function addTicker(page: Page, opts: AddTickerOpts): Promise<void> {
  await page.fill('#ticker', opts.ticker)
  if (opts.thesis != null) await page.fill('#thesis', opts.thesis)
  if (opts.ownBelow != null) {
    await page.click('button:has-text("Would own below")')
    await page.fill('#ownBelowPrice', opts.ownBelow)
  }
  if (opts.ivr != null) {
    await page.click('button:has-text("Wait for high IV")')
    await page.fill('#ivrTrigger', opts.ivr)
  }
  await page.click('[data-testid="watchlist-add-submit"]')
}

/** Add a ticker and wait for its row to appear (used to seed prior state). */
async function seedTicker(page: Page, ticker: string): Promise<void> {
  await addTicker(page, { ticker })
  await page.waitForSelector(`[data-testid="watchlist-row-${ticker}"]`)
}

/** The tickers on the bench, in card order. The ticker is a button that carries a `→`
 *  affordance into the detail panel, which is not part of the symbol. */
async function tickerTexts(page: Page): Promise<string[]> {
  const labels = await page.locator('[data-testid="watchlist-ticker"]').allTextContents()
  return labels.map((label) => label.replace('→', '').trim())
}

function rowCount(page: Page): Promise<number> {
  return page.locator('[data-testid^="watchlist-row-"]').count()
}

describe('US-63: create and remove watchlist entries', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string): Promise<Page> {
    dbPath = tmpDb(prefix)
    app = await launchApp(dbPath)
    const page = await getPage(app)
    await goToWatchlist(page)
    return page
  }

  it('adds a ticker to the watchlist', async () => {
    const page = await launch('wb-e2e-us63-add')
    await seedTicker(page, 'AAPL')
    await seedTicker(page, 'MSFT')

    await addTicker(page, { ticker: 'NVDA' })
    await page.waitForSelector('[data-testid="watchlist-row-NVDA"]')

    expect(await rowCount(page)).toBe(3)
  })

  it('shows a newly added ticker at the top of the list', async () => {
    const page = await launch('wb-e2e-us63-top')
    await seedTicker(page, 'AAPL')
    await seedTicker(page, 'MSFT')

    await addTicker(page, { ticker: 'NVDA' })
    await page.waitForSelector('[data-testid="watchlist-row-NVDA"]')

    expect((await tickerTexts(page))[0]).toBe('NVDA')
  })

  it('creates an entry with a thesis and entry conditions', async () => {
    const page = await launch('wb-e2e-us63-thesis')

    await addTicker(page, {
      ticker: 'PLTR',
      thesis: 'Would own below $38 after the run-up',
      ownBelow: '38.00',
      ivr: '50'
    })
    await page.waitForSelector('[data-testid="watchlist-row-PLTR"]')

    // [US-96] The card carries the live read on the stock; the thesis and the conditions
    // it was saved with are stated in full in the detail panel, which opens on the only
    // stock on the bench.
    expect(await page.textContent('[data-testid="bench-detail-ticker"]')).toBe('PLTR')
    expect(await page.textContent('[data-testid="bench-detail-thesis"]')).toBe(
      'Would own below $38 after the run-up'
    )
    expect(await page.textContent('[data-testid="bench-gate-price"]')).toContain('≤ $38')
    expect(await page.textContent('[data-testid="bench-gate-iv"]')).toContain('IVR ≥ 50')
  })

  it('creates an entry with no thesis and no conditions', async () => {
    const page = await launch('wb-e2e-us63-bare')

    await addTicker(page, { ticker: 'NVDA' })
    await page.waitForSelector('[data-testid="watchlist-row-NVDA"]')

    const tags = await page
      .locator('[data-testid="watchlist-row-NVDA"] [data-testid="watchlist-tag"]')
      .count()
    expect(tags).toBe(0)
  })

  it('normalizes ticker symbols to uppercase', async () => {
    const page = await launch('wb-e2e-us63-upper')

    await addTicker(page, { ticker: 'nvda' })
    await page.waitForSelector('[data-testid="watchlist-row-NVDA"]')

    expect(await tickerTexts(page)).toContain('NVDA')
  })

  it('rejects a duplicate ticker', async () => {
    const page = await launch('wb-e2e-us63-dup')
    await seedTicker(page, 'AAPL')

    await addTicker(page, { ticker: 'AAPL' })
    await page.waitForSelector('text=AAPL is already on the watchlist')

    expect(await page.locator('[data-testid="watchlist-row-AAPL"]').count()).toBe(1)
  })

  it('rejects an empty symbol', async () => {
    const page = await launch('wb-e2e-us63-empty')

    await page.click('[data-testid="watchlist-add-submit"]')
    await page.waitForSelector('text=Enter a ticker symbol')

    expect(await rowCount(page)).toBe(0)
  })

  it('rejects a numeric symbol', async () => {
    const page = await launch('wb-e2e-us63-numeric')

    await addTicker(page, { ticker: '12345' })
    await page.waitForSelector('text=Enter a valid ticker symbol')

    expect(await rowCount(page)).toBe(0)
  })

  it('rejects a symbol with a space', async () => {
    const page = await launch('wb-e2e-us63-space')

    await addTicker(page, { ticker: 'AB CD' })
    await page.waitForSelector('text=Enter a valid ticker symbol')

    expect(await rowCount(page)).toBe(0)
  })

  it('removes a ticker from the watchlist', async () => {
    const page = await launch('wb-e2e-us63-remove')
    await seedTicker(page, 'AAPL')
    await seedTicker(page, 'MSFT')

    await page.click('[data-testid="watchlist-remove-AAPL"]')
    await page.waitForSelector('[data-testid="watchlist-row-AAPL"]', { state: 'detached' })

    expect(await page.locator('[data-testid="watchlist-row-MSFT"]').count()).toBe(1)
    expect(await rowCount(page)).toBe(1)
  })

  it('shows guidance when the watchlist is empty', async () => {
    const page = await launch('wb-e2e-us63-guidance')

    await page.waitForSelector('text=No tickers yet')
    const body = await page.textContent('body')
    expect(body).toContain('screener')
    expect(await rowCount(page)).toBe(0)
  })
})
