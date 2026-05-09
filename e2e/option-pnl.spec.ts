// [US-33] Show current option mid-price and unrealized P&L for open legs
//
// Uses FakeMarketDataProvider (WHEELBASE_MARKET_MOCK=true).
// Option snapshot fixtures are passed via WHEELBASE_MOCK_OPTION_SNAPSHOTS env var
// keyed by OCC symbol. For AC-5, profit_target_percent is set via the test-only
// `setPositionProfitTarget` IPC handler before navigating back to the positions list.
import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// Dynamic expiration — 30 days out so tests never rot
const EXPIRATION_ISO = localDate(30)
const STRIKE = 180
const PREMIUM = 3.5
const CONTRACTS = 1

// Build OCC symbol from seed parameters (no import of buildOccSymbol — pure string arithmetic)
function occSym(
  ticker: string,
  expiration: string,
  instrumentType: 'PUT' | 'CALL',
  strike: number
): string {
  const [yyyy, mm, dd] = expiration.split('-')
  const yy = yyyy.slice(2)
  const letter = instrumentType === 'PUT' ? 'P' : 'C'
  const strikeInt = String(Math.round(strike * 1000)).padStart(8, '0')
  return `${ticker.toUpperCase()}${yy}${mm}${dd}${letter}${strikeInt}`
}

const AAPL_OCC = occSym('AAPL', EXPIRATION_ISO, 'PUT', STRIKE)

// Full OptionSnapshot shape required by FakeMarketDataProvider
function makeSnapshot(bid: string, ask: string, mid: string): object {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: null,
    volume: null,
    greeks: { delta: '-0.30', gamma: '0.02', theta: '-0.05', vega: '0.10', iv: '0.25' },
    timestamp: new Date().toISOString()
  }
}

// AC-1/2/4/6: mid=1.30 → pnl = (3.50-1.30)*100 = +$220.00 → 62.86% of max → hits 50% target
const SNAP_NORMAL = makeSnapshot('1.20', '1.40', '1.30')
// AC-3: mid=5.20 → pnl = (3.50-5.20)*100 = -$170.00
const SNAP_LOSS = makeSnapshot('5.10', '5.30', '5.20')
// AC-7: spread = (1.50-0.50)/1.00 = 100% > 10% → wide spread warning
const SNAP_WIDE = makeSnapshot('0.50', '1.50', '1.00')
// AC-8: bid=0 → no bid; mid=0.03 → pnl = (3.50-0.03)*100 = +$347.00
const SNAP_NO_BID = makeSnapshot('0', '0.05', '0.03')
// AC-5: mid=2.50 → pnl = (3.50-2.50)*100 = +$100 → 28.57% of max → hits override 25% target
const SNAP_TARGET_OVERRIDE = makeSnapshot('2.45', '2.55', '2.50')

const AAPL_STOCK_QUOTE = {
  price: '182.45',
  bid: '182.40',
  ask: '182.50',
  prevClose: '181.00',
  change: '1.45',
  changePercent: '0.0080',
  volume: 50000000,
  timestamp: new Date().toISOString()
}

const REGULAR_SESSION = {
  isOpen: true,
  session: 'regular',
  nextOpen: '',
  nextClose: ''
}

// ── Launch helper ─────────────────────────────────────────────────────────────

function launchWithMocks(
  dbPath: string,
  opts: {
    quotes?: Record<string, object>
    optionSnapshots?: Record<string, object>
    marketStatus?: object
  } = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: {
      ...process.env,
      WHEELBASE_DB_PATH: dbPath,
      WHEELBASE_MARKET_MOCK: 'true',
      WHEELBASE_MOCK_STOCK_QUOTES: JSON.stringify(opts.quotes ?? { AAPL: AAPL_STOCK_QUOTE }),
      WHEELBASE_MOCK_OPTION_SNAPSHOTS: JSON.stringify(opts.optionSnapshots ?? {}),
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

async function goToPositionDetail(page: Page, positionId: string): Promise<void> {
  await page.evaluate((id: string) => {
    location.hash = `#/positions/${id}`
  }, positionId)
  await page.waitForSelector('[data-testid="position-detail"]')
}

// ── Position seeding ──────────────────────────────────────────────────────────

type CreateResult = { ok: true; position: { id: string } } | { ok: false }
type AssignResult = { ok: boolean }

interface SeedPositionOptions {
  ticker?: string
  strike?: number
  premium?: number
  contracts?: number
}

interface SeedPositionInput {
  ticker: string
  strike: number
  premium: number
  contracts: number
  expiration: string
}

async function seedPosition(page: Page, opts: SeedPositionOptions = {}): Promise<string> {
  const input: SeedPositionInput = {
    ticker: opts.ticker ?? 'AAPL',
    strike: opts.strike ?? STRIKE,
    premium: opts.premium ?? PREMIUM,
    contracts: opts.contracts ?? CONTRACTS,
    expiration: EXPIRATION_ISO
  }

  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')

  const result = (await page.evaluate(
    async (i: SeedPositionInput) =>
      window.api.createPosition({
        ticker: i.ticker,
        strike: i.strike,
        contracts: i.contracts,
        premiumPerContract: i.premium,
        expiration: i.expiration
      }),
    input
  )) as CreateResult

  if (!result.ok) throw new Error(`createPosition failed: ${JSON.stringify(result)}`)
  return result.position.id
}

async function assignCsp(page: Page, positionId: string, assignmentDate: string): Promise<void> {
  const result = (await page.evaluate(
    async ({ posId, date }: { posId: string; date: string }) =>
      window.api.assignPosition({ positionId: posId, assignmentDate: date }),
    { posId: positionId, date: assignmentDate }
  )) as AssignResult
  if (!result.ok) throw new Error(`assignPosition failed: ${JSON.stringify(result)}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('US-33: option mid-price and unrealized P&L for open legs', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('AC-1: displays option mid-price as $1.30 in the Opt Mid column for an open CSP', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac1-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NORMAL } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-opt-mid"]:has-text("$1.30")')

    const headers = await page.$$eval('thead th', (ths) => ths.map((th) => th.textContent?.trim()))
    expect(headers).toContain('Opt Mid')
  })

  it('AC-2: shows unrealized P&L of +$220.00 in green when option has decayed below entry premium', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac2-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NORMAL } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-pnl"]:has-text("+$220.00")')
    expect(
      await page
        .locator('[data-testid="position-card-AAPL-pnl"] .text-wb-green')
        .first()
        .isVisible()
    ).toBe(true)
  })

  it('AC-3: shows unrealized P&L of -$170.00 in red when option is above entry premium', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac3-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_LOSS } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-pnl"]:has-text("-$170.00")')
    expect(
      await page.locator('[data-testid="position-card-AAPL-pnl"] .text-wb-red').first().isVisible()
    ).toBe(true)
  })

  it('AC-4: shows gold TARGET badge on the row when default 50% threshold is reached', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac4-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NORMAL } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector(
      '[data-testid="position-card"]:has-text("AAPL") [data-testid="target-badge"]'
    )
    const badge = page.locator('[data-testid="target-badge"]').first()
    const title = await badge.getAttribute('title')
    expect(title).toContain('62.9%')
    expect(title).toContain('$350')
    expect(title).toContain('target is 50%')
  })

  it('AC-5: shows gold TARGET badge using per-position override of 25%', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac5-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_TARGET_OVERRIDE } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Seed position (leaves us on '#/new')
    const positionId = await seedPosition(page)

    // Set profit_target_percent = 25 via the test-only IPC handler
    await page.evaluate(
      async ({ posId }: { posId: string }) =>
        window.api.setPositionProfitTarget({ positionId: posId, targetPercent: 25 }),
      { posId: positionId }
    )

    // Navigate to positions list — PositionsListPage remounts and re-fetches positions
    await goToPositionsList(page)

    await page.waitForSelector(
      '[data-testid="position-card"]:has-text("AAPL") [data-testid="target-badge"]'
    )
    const badge = page.locator('[data-testid="target-badge"]').first()
    const title = await badge.getAttribute('title')
    expect(title).toContain('target is 25%')
  })

  it('AC-6: Open Leg section on the detail page shows Current Mid, Unrealized P&L, and % of Max Profit stats', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac6-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NORMAL } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Current Mid')
    await page.waitForSelector('text=$1.30')

    await page.waitForSelector('text=Unrealized P&L')
    await page.waitForSelector('text=+$220.00')

    await page.waitForSelector('text=% of Max Profit')
    await page.waitForSelector('text=62.9%')
  })

  it('AC-7: shows amber spread-warning icon when bid-ask spread exceeds 10% of mid', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac7-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_WIDE } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="opt-mid-spread-warning"]')
    const title = await page.locator('[data-testid="opt-mid-spread-warning"]').getAttribute('title')
    expect(title).toBe('Wide spread: $0.50 × $1.50 — P&L may be unreliable')
  })

  it('AC-8: shows "no bid" indicator when bid is zero on a deep-OTM option', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac8-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NO_BID } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card-AAPL-opt-mid"]:has-text("$0.03")')
    const optMidText = await page.textContent('[data-testid="position-card-AAPL-opt-mid"]')
    expect(optMidText).toContain('no bid')

    await page.waitForSelector('[data-testid="position-card-AAPL-pnl"]:has-text("+$347.00")')
  })

  it('AC-9: shows dashes for Opt Mid and P&L when position is HOLDING_SHARES with no open option leg', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac9-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, { optionSnapshots: { [AAPL_OCC]: SNAP_NORMAL } })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)

    // Assign the CSP → moves position to HOLDING_SHARES phase
    await assignCsp(page, positionId, localToday())

    await goToPositionsList(page)
    await page.waitForSelector('[data-testid="position-card"]')

    const optMidText = await page.textContent('[data-testid="position-card-AAPL-opt-mid"]')
    expect(optMidText).toContain('—')

    const pnlText = await page.textContent('[data-testid="position-card-AAPL-pnl"]')
    expect(pnlText).toContain('—')
  })

  it('AC-10: falls back to dashes when option snapshot is unavailable for the OCC symbol', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us33-ac10-${Date.now()}.db`)
    // Empty snapshots — provider returns no data for the AAPL OCC symbol
    app = await launchWithMocks(dbPath, { optionSnapshots: {} })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await seedPosition(page)
    await goToPositionsList(page)

    await page.waitForSelector('[data-testid="position-card"]')
    await page.waitForSelector('[data-testid="position-card-AAPL-opt-mid"]')

    const optMidText = await page.textContent('[data-testid="position-card-AAPL-opt-mid"]')
    expect(optMidText).toContain('—')

    const pnlText = await page.textContent('[data-testid="position-card-AAPL-pnl"]')
    expect(pnlText).toContain('—')

    // Other position data still displays correctly
    const rowText = await page.textContent('[data-testid="position-card"]')
    expect(rowText).toContain('AAPL')
    expect(rowText).toContain('$180.00')
  })
})
