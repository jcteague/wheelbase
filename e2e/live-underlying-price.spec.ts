// [US-32] Display live underlying price on position list with market status indicator
//
// These tests use the FakeMarketDataProvider (WHEELBASE_MARKET_MOCK=true).
// Market status and stock-quote fixtures are passed via JSON env vars so no real
// Alpaca credentials or WebSocket connections are required.  Stream events (ticks
// and errors) are injected via window.api.triggerTestTick / triggerStreamError,
// which are backed by real IPC channels registered by registerMarketDataHandlers.
import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// Future expiration — dynamic so tests don't rot (30 days out)
const EXPIRATION_ISO = localDate(30)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const QUOTE_AAPL = {
  price: '182.45',
  bid: '182.40',
  ask: '182.50',
  prevClose: '181.00',
  change: '1.45',
  changePercent: '0.0080',
  volume: 50000000,
  timestamp: '2026-04-29T15:00:00Z'
}

const QUOTE_MSFT = {
  price: '418.30',
  bid: '418.20',
  ask: '418.40',
  prevClose: '420.00',
  change: '-1.70',
  changePercent: '-0.0040',
  volume: 25000000,
  timestamp: '2026-04-29T15:00:00Z'
}

const QUOTE_TSLA = {
  price: '175.50',
  bid: '175.40',
  ask: '175.60',
  prevClose: '174.00',
  change: '1.50',
  changePercent: '0.0086',
  volume: 80000000,
  timestamp: '2026-04-29T15:00:00Z'
}

// Closed-session fixture: prevClose is the authoritative display price per AC-4
const QUOTE_AAPL_CLOSED = {
  price: '182.45',
  bid: '182.40',
  ask: '182.50',
  prevClose: '182.00',
  change: '0.45',
  changePercent: '0.0025',
  volume: 0,
  timestamp: '2026-04-28T20:00:00Z'
}

const ALL_QUOTES = { AAPL: QUOTE_AAPL, MSFT: QUOTE_MSFT, TSLA: QUOTE_TSLA }

type MarketStatusFixture = {
  isOpen: boolean
  session: 'regular' | 'pre' | 'post' | 'closed'
  nextOpen: string
  nextClose: string
}

const REGULAR_SESSION: MarketStatusFixture = {
  isOpen: true,
  session: 'regular',
  nextOpen: '2026-04-30T13:30:00Z',
  nextClose: '2026-04-29T20:00:00Z'
}

// ── Launch helper ─────────────────────────────────────────────────────────────

function launchWithMocks(
  dbPath: string,
  opts: {
    quotes?: Record<string, object>
    marketStatus?: MarketStatusFixture
  } = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: {
      ...process.env,
      WHEELBASE_DB_PATH: dbPath,
      WHEELBASE_MARKET_MOCK: 'true',
      WHEELBASE_MOCK_STOCK_QUOTES: JSON.stringify(opts.quotes ?? ALL_QUOTES),
      WHEELBASE_MOCK_MARKET_STATUS: JSON.stringify(opts.marketStatus ?? REGULAR_SESSION)
    }
  })
}

// ── Page helpers ──────────────────────────────────────────────────────────────

async function goToPositionsList(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
}

async function triggerTick(
  page: Page,
  ticker: string,
  quote: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ({ t, q }) => {
      await window.api.triggerTestTick({ ticker: t, quote: q as IpcStockQuote })
    },
    { t: ticker, q: quote }
  )
}

async function triggerStreamErr(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.api.triggerStreamError({
      feed: 'stockQuotes',
      code: 'stream_disconnected',
      message: 'Connection lost',
      reconnectable: true
    })
  })
}

// ── Position seeding ──────────────────────────────────────────────────────────

async function seedPositions(page: Page, tickers: string[]): Promise<void> {
  const premiums: Record<string, number> = { AAPL: 3.5, MSFT: 5.0, TSLA: 2.5 }
  const strikes: Record<string, number> = { AAPL: 180, MSFT: 400, TSLA: 170 }

  // Navigate to a different route so the final navigate to #/ forces a fresh
  // mount of PositionsListPage and usePositions() re-fetches.
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')

  for (const ticker of tickers) {
    await page.evaluate(
      async ({ t, s, p, exp }) => {
        const result = await window.api.createPosition({
          ticker: t,
          strike: s,
          expiration: exp,
          contracts: 1,
          premiumPerContract: p
        })
        if (!result.ok) throw new Error(`createPosition failed for ${t}: ${JSON.stringify(result)}`)
      },
      { t: ticker, s: strikes[ticker] ?? 100, p: premiums[ticker] ?? 2.0, exp: EXPIRATION_ISO }
    )
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('US-32: live underlying price on positions list', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('AC-1: displays live underlying price with green LIVE dot during regular session', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac1-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL', 'MSFT', 'TSLA'])
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("LIVE")')
    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$182.45")')
    await page.waitForSelector('[data-testid="position-card-MSFT-price"]:has-text("$418.30")')
    await page.waitForSelector('[data-testid="position-card-TSLA-price"]:has-text("$175.50")')
  })

  it("AC-2: updates a row's price when a stream tick arrives, without page reload or spinner", async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac2-${Date.now()}.db`)
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL', 'MSFT', 'TSLA'])
    await goToPositionsList(page)
    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$182.45")')

    await triggerTick(page, 'AAPL', {
      price: '183.10',
      bid: '183.05',
      ask: '183.15',
      prevClose: '181.00',
      change: '2.10',
      changePercent: '0.0116',
      volume: 50000001,
      timestamp: '2026-04-29T15:01:00Z'
    })

    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="position-card-AAPL-price"]')
        ?.textContent?.includes('$183.10')
    )
    expect(await page.isVisible('[data-testid="loading"]')).toBe(false)
  })

  it('AC-3: shows daily change amount and direction (green for up, red for down)', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac3-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      quotes: { AAPL: QUOTE_AAPL, MSFT: QUOTE_MSFT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL', 'MSFT'])
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("+$1.45")')
    await page.waitForSelector('[data-testid="position-card-MSFT-price"]:has-text("-$1.70")')

    expect(
      await page.locator('[data-testid="position-card-AAPL-price"] .text-wb-green').isVisible()
    ).toBe(true)
    expect(
      await page.locator('[data-testid="position-card-MSFT-price"] .text-wb-red').isVisible()
    ).toBe(true)
  })

  it('AC-4: shows last closing price with gray CLOSED indicator when market is closed', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac4-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      quotes: { AAPL: QUOTE_AAPL_CLOSED },
      marketStatus: {
        isOpen: false,
        session: 'closed',
        nextOpen: '2026-04-30T13:30:00Z',
        nextClose: '2026-04-30T20:00:00Z'
      }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL'])
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$182.00")')
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("CLOSED")')
  })

  it('AC-5: shows extended hours price with amber EXT indicator during pre/post market', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac5-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      quotes: {
        AAPL: {
          price: '183.50',
          bid: '183.40',
          ask: '183.60',
          prevClose: '181.00',
          change: '2.50',
          changePercent: '0.0138',
          volume: 5000000,
          timestamp: '2026-04-29T21:00:00Z'
        }
      },
      marketStatus: {
        isOpen: false,
        session: 'post',
        nextOpen: '2026-04-30T13:30:00Z',
        nextClose: '2026-04-29T20:00:00Z'
      }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL'])
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$183.50")')
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("EXT")')
  })

  it('AC-6: shows dash with tooltip when price data is unavailable for a ticker', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac6-${Date.now()}.db`)
    // TSLA intentionally absent from quotes
    app = await launchWithMocks(dbPath, {
      quotes: { AAPL: QUOTE_AAPL, MSFT: QUOTE_MSFT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL', 'MSFT', 'TSLA'])
    await goToPositionsList(page)

    // AAPL and MSFT have quotes — wait for their prices to confirm data arrived
    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$182.45")')
    await page.waitForSelector('[data-testid="position-card-MSFT-price"]:has-text("$418.30")')

    // TSLA cell exists immediately (rendered as dash since no quote in map)
    await page.waitForSelector('[data-testid="position-card-TSLA-price"]')
    const tslaText = await page.textContent('[data-testid="position-card-TSLA-price"]')
    expect(tslaText).toContain('—')
    const tslaTitle = await page.getAttribute('[data-testid="position-card-TSLA-price"]', 'title')
    expect(tslaTitle).toBe('Price unavailable')
  })

  it('AC-7: shows stale data warning banner and amber DELAYED indicator when no update has arrived for 5 minutes', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us32-ac7-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPositions(page, ['AAPL'])
    await goToPositionsList(page)
    await page.waitForSelector('[data-testid="position-card-AAPL-price"]:has-text("$182.45")')

    // Simulate a stream error — PositionsListPage shows the stale banner and
    // switches the status pill to DELAYED when streamError is non-null.
    await triggerStreamErr(page)

    await page.waitForSelector('[data-testid="stale-data-banner"]', { timeout: 10_000 })
    const bannerText = await page.textContent('[data-testid="stale-data-banner"]')
    expect(bannerText).toContain('Prices may be delayed')
    expect(bannerText).toContain('m ago')
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("DELAYED")')
  })
})
