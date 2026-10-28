// [US-18] Helpers for the position-card e2e spec: launch with the story's Background quotes and
// option snapshots, seed its four wheels, and read a card's regions back as plain strings.
//
// Dates are run-day relative (the app reads the real clock), so expirations are built from the
// scenario's DTE. Two Background figures cannot be seeded as written: MSFT's 280.00 premium
// with a 402.40 basis would need a free CSP, so MSFT is seeded from a $410 put at 4.80. Its
// basis matches the AC's 402.40 but its premium is 760.00, which S9 asserts as the footer's
// unchanged "Premium collected" when the MSFT snapshot is unavailable.
import type { ElectronApplication, Locator, Page } from 'playwright'
import {
  AAPL_PUT_180,
  REGULAR_SESSION,
  buildLaunchEnv,
  getPage,
  launchElectron,
  seedCsp,
  tmpDb,
  type ActivityFixture
} from './assignment-helpers'
import { listManagementQueueItems, runAlertEvaluation } from './alert-helpers'
import {
  seedCcOpenPosition,
  seedHoldingSharesPosition,
  seedWheelCompletePosition
} from './calendar-helpers'
import { localDate } from './dates'
import { reloadPositionsList } from './helpers'
import { flatStockQuote, optionSnapshot } from './market-data-fixtures'
import { occSymbol } from './pmcc-helpers'

// ── Market data fixtures ─────────────────────────────────────────────────────

export type Prices = Record<string, string>

/** The Background's stock quotes. */
export const BACKGROUND_PRICES: Prices = { MSFT: '421.50', AAPL: '182.45', NVDA: '128.30' }

/** An option quote as `[bid, ask, mid]`. */
export type OptionQuote = [string, string, string]

export const MSFT_CALL: OptionQuote = ['1.75', '1.85', '1.80']
export const AAPL_PUT: OptionQuote = ['2.55', '2.65', '2.60']

// ── Launch and seed ──────────────────────────────────────────────────────────

export interface BackgroundOptions {
  /** DTE of the MSFT covered call; the Background's is 10. */
  msftDte?: number
  /** Stock prices merged over the Background's. */
  prices?: Prices
  /** The MSFT call's quote; `null` returns no snapshot for it. */
  msftCall?: OptionQuote | null
  /** The AAPL put's quote; `null` returns no snapshot for it. */
  aaplPut?: OptionQuote | null
  /** Snapshots for positions a scenario seeds beyond the Background, by OCC symbol. */
  extraSnapshots?: Record<string, OptionQuote>
  activities?: ActivityFixture[]
}

export interface CardsHarness {
  app: ElectronApplication
  page: Page
  dbPath: string
  ids: Record<'MSFT' | 'AAPL' | 'NVDA' | 'TSLA', string>
  msftExpiration: string
  aaplExpiration: string
}

/**
 * Launches with the Background's market data and seeds its four wheels. The seed order (AAPL,
 * NVDA, MSFT, TSLA) matches neither the list's DTE order nor alphabetical or creation order.
 */
export async function launchBackground(
  label: string,
  {
    msftDte = 10,
    prices = {},
    msftCall = MSFT_CALL,
    aaplPut = AAPL_PUT,
    extraSnapshots = {},
    activities
  }: BackgroundOptions = {}
): Promise<CardsHarness> {
  const msftExpiration = localDate(msftDte)
  const aaplExpiration = AAPL_PUT_180.expiration
  const optionQuotes: Record<string, OptionQuote> = {
    ...extraSnapshots,
    ...(msftCall && { [occSymbol('MSFT', msftExpiration, 'C', 430)]: msftCall }),
    ...(aaplPut && { [AAPL_PUT_180.occSymbol]: aaplPut })
  }

  const dbPath = tmpDb(`wb-e2e-us18-${label}`)
  const env = buildLaunchEnv(dbPath, { marketStatus: REGULAR_SESSION, activities })
  const quotes = Object.entries({ ...BACKGROUND_PRICES, ...prices })
  env.WHEELBASE_MOCK_STOCK_QUOTES = JSON.stringify(
    Object.fromEntries(quotes.map(([ticker, price]) => [ticker, flatStockQuote(price)]))
  )
  env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify(
    Object.fromEntries(
      Object.entries(optionQuotes).map(([symbol, quote]) => [symbol, optionSnapshot(...quote)])
    )
  )
  const app = await launchElectron(env)
  const page = await getPage(app)

  const AAPL = await seedCsp(page, AAPL_PUT_180)
  // NVDA: $125 put at 6.40, assigned → basis 118.60, premium 640.00.
  const NVDA = await seedHoldingSharesPosition(page, { ticker: 'NVDA', strike: 125, premium: 6.4 })
  const MSFT = await seedCcOpenPosition(page, {
    ticker: 'MSFT',
    cspStrike: 410,
    cspPremium: 4.8,
    ccStrike: 430,
    ccPremium: 2.8,
    ccExpiration: msftExpiration
  })
  // TSLA: $248.80 put at 6.40, a $260 call at 6.00, called away → basis 236.40, premium 1,240.00.
  const TSLA = await seedWheelCompletePosition(page, {
    ticker: 'TSLA',
    cspStrike: 248.8,
    cspPremium: 6.4,
    ccStrike: 260,
    ccPremium: 6,
    ccExpiration: localDate(30)
  })

  return {
    app,
    page,
    dbPath,
    ids: { MSFT, AAPL, NVDA, TSLA },
    msftExpiration,
    aaplExpiration
  }
}

/** "The alert engine has evaluated active positions", then the dashboard is viewed. */
export async function viewDashboard(page: Page): Promise<void> {
  await runAlertEvaluation(page)
  await reloadPositionsList(page)
  await page.locator(ACTIVE_CARD).first().waitFor()
}

// ── Reading a card ───────────────────────────────────────────────────────────

export const ACTIVE_CARD = '[data-testid="position-card"]'

/** The active card whose ticker link reads exactly `ticker`. */
export function cardFor(page: Page, ticker: string): Locator {
  return page
    .locator(ACTIVE_CARD)
    .filter({ has: page.locator(`[data-testid="position-ticker"]:text-is("${ticker}")`) })
}

async function childTexts(locator: Locator): Promise<string[]> {
  return locator.evaluate((el) => Array.from(el.children).map((child) => child.textContent ?? ''))
}

/** The active cards' bounding boxes, in grid order. */
export async function cardBoxes(
  page: Page
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const cards = await page.locator(ACTIVE_CARD).all()
  return Promise.all(
    cards.map(async (card) => {
      const box = await card.boundingBox()
      if (!box) throw new Error('card has no bounding box')
      return box
    })
  )
}

/** The card's leg blocks (one on a wheel card, two on a PMCC card). */
export function legOf(card: Locator): Locator {
  return card.getByTestId('leg-block')
}

/** The leg block's DTE text element (the third cell's own span). */
export function dteOf(card: Locator): Locator {
  return legOf(card).locator(':scope > :nth-child(3) > span')
}

/** The card's footer: Cost basis then Premium collected, each label · value · note. */
export async function footerText(card: Locator): Promise<string | null> {
  return card.locator(':scope > :last-child').textContent()
}

/** How many of the card's markers render: its action strip, TARGET badge and Expiring-soon flag. */
export async function markerCounts(
  card: Locator
): Promise<{ strip: number; badge: number; flag: number }> {
  const [strip, badge, flag] = await Promise.all(
    ['action-strip', 'target-badge', 'expiring-soon-flag'].map((id) => card.getByTestId(id).count())
  )
  return { strip, badge, flag }
}

/** The strip's lead line as the AC writes it: `glyph WORD · summary` (the +N chip excluded). */
export async function stripLine(card: Locator): Promise<string> {
  const [glyph, text] = await childTexts(card.getByTestId('action-strip'))
  return `${glyph} ${text}`
}

/** The strip's +N chip: the element whose tooltip lists the other open rows. */
export function stripChip(card: Locator): Locator {
  return card.getByTestId('action-strip').locator('[title^="Also open:"]')
}

/** A leg block's four cells: tag, title (with any action marks), DTE, and mark · credit. */
export async function legCells(leg: Locator): Promise<string[]> {
  return childTexts(leg)
}

/** The header's price block lines: price, then (with a prior close) the change, then the sub-line. */
export async function priceLines(card: Locator, ticker: string): Promise<string[]> {
  return childTexts(card.getByTestId(`position-card-${ticker}-price`))
}

/** The P&L figure and its sub-line. */
export async function pnlLines(card: Locator, ticker: string): Promise<string[]> {
  return childTexts(card.getByTestId(`position-card-${ticker}-pnl`))
}

/** Text of the P&L lines carrying `toneClass` (e.g. `text-wb-green`). */
export async function pnlLinesIn(
  card: Locator,
  ticker: string,
  toneClass: string
): Promise<string[]> {
  return card
    .getByTestId(`position-card-${ticker}-pnl`)
    .locator(`div.${toneClass}`)
    .allTextContents()
}

export async function classOf(locator: Locator): Promise<string> {
  return (await locator.getAttribute('class')) ?? ''
}

// ── Reading the queue ────────────────────────────────────────────────────────

/** The rule codes of `ticker`'s open management-queue rows, sorted. */
export async function ruleCodesFor(page: Page, ticker: string): Promise<string[]> {
  const items = await listManagementQueueItems(page)
  return items
    .filter((item) => item.ticker === ticker)
    .map((item) => item.ruleCode)
    .sort()
}
