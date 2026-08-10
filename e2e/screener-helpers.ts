// Shared helpers for the US-66 screener-results e2e spec.
//
// The suite stays offline: put chains come from the FakeMarketDataProvider's
// OCC-keyed WHEELBASE_MOCK_OPTION_SNAPSHOTS fixtures, IVR rows from the US-44
// fake-scraper seam, and the market session from FAKE_MARKET_STATUS. Every
// rendered number the ACs pin is produced by the real US-65 engine over these
// fixtures — nothing stubs the IPC — so the spec proves the renderer formats what
// the screener actually emits.
import type { ElectronApplication, Page } from 'playwright'
import { getPage, launchElectron, type MarketStatusFixture } from './assignment-helpers'
import { localDate } from './dates'
import {
  buildIvrLaunchEnv,
  collectIvrNow,
  okOutcome,
  seedActivePosition,
  setIvrOutcomes
} from './ivr-helpers'

/** Every fixture quote carries the same stamp so `quoteTimestamp` (the newest ranked
 *  strike's timestamp) is deterministic for the stale-caption assertion. */
export const QUOTE_TIMESTAMP = '2026-08-07T20:00:02Z'

/** When the fake IVR scrape is recorded as having happened. Display never shows it;
 *  it only has to be a parseable ISO instant for the snapshot row. */
const IVR_OBSERVED_AT = '2026-08-07T21:00:00Z'

/** One put strike as the provider would quote it. `mid` is what the engine screens
 *  on (it becomes `mark`), so it is stated rather than derived from bid/ask. */
export type PutFixtureSpec = {
  ticker: string
  strike: number
  bid: string
  ask: string
  mid: string
  /** Signed as the provider ships it — the engine takes the absolute value. */
  delta: string
  openInterest: number
  /** Calendar days from today, so DTE lands in the 30–45 default window on any run date. */
  dteOffset: number
}

// ── Canonical fixtures ────────────────────────────────────────────────────────
//
// Numbers chosen so the real engine reproduces the AC's exact strings — see the
// "E2E fixtures reproduce AC numbers through the real engine" ADR in
// plans/us-66/research.md. Period yield = mid / strike; annualized = period × 365 / DTE;
// score = annualized / |delta|.

/** mid 0.95 / 60 = 1.58% period, 15.62%/yr over 37 DTE, ÷ 0.22 ⇒ score 0.71 (rank 1). */
const KO_PUT: PutFixtureSpec = {
  ticker: 'KO',
  strike: 60,
  bid: '0.92',
  ask: '0.98',
  mid: '0.95',
  delta: '-0.22',
  openInterest: 1800,
  dteOffset: 37
}

/** mid 2.70 / 180 = 1.5% period, 14.8%/yr over 37 DTE, ÷ 0.28 ⇒ score 0.53 (rank 2).
 *  Spread 0.06 on a 2.70 mark ⇒ the AC's `$0.06 (2%)`. */
const AAPL_PUT: PutFixtureSpec = {
  ticker: 'AAPL',
  strike: 180,
  bid: '2.67',
  ask: '2.73',
  mid: '2.70',
  delta: '-0.28',
  openInterest: 4200,
  dteOffset: 37
}

/** mid 6.20 / 410 = 1.51% period, 12.54%/yr over 44 DTE, ÷ 0.25 ⇒ score 0.50 (rank 3).
 *  Deliberately gets no IVR outcome, so its IV rank cell must read `n/a`. */
const MSFT_PUT: PutFixtureSpec = {
  ticker: 'MSFT',
  strike: 410,
  bid: '6.05',
  ask: '6.35',
  mid: '6.20',
  delta: '-0.25',
  openInterest: 2600,
  dteOffset: 44
}

/** Spread 0.66 on a 3.00 mark is exactly 22% — chosen so the engine's round-up-2dp
 *  formatter emits the AC's literal `spread 22% exceeds 10%`. */
export const TSLA_PUT: PutFixtureSpec = {
  ticker: 'TSLA',
  strike: 240,
  bid: '2.67',
  ask: '3.33',
  mid: '3.00',
  delta: '-0.25',
  openInterest: 1000,
  dteOffset: 37
}

/** The three tickers that rank, in expected rank order. */
export const RANKED_PUTS: PutFixtureSpec[] = [KO_PUT, AAPL_PUT, MSFT_PUT]

/** IV ranks the collector persists for the ranked fixtures. MSFT is absent on purpose. */
export const RANKED_IVR: Record<string, number> = { KO: 38, AAPL: 44 }

// ── Fixture construction ──────────────────────────────────────────────────────

type OptionSnapshotFixture = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number
  volume: number
  greeks: { delta: string; gamma: string; theta: string; vega: string }
  impliedVolatility: string
  timestamp: string
}

/** OCC symbol: <root><YYMMDD><P|C><strike × 1000, 8 digits>. */
function occPutSymbol(spec: PutFixtureSpec): string {
  const [year, month, day] = localDate(spec.dteOffset).split('-')
  const strikeThousandths = String(Math.round(spec.strike * 1000)).padStart(8, '0')
  return `${spec.ticker}${year.slice(2)}${month}${day}P${strikeThousandths}`
}

/** The quote body of one snapshot. Strike, expiration and contract type are derived by
 *  the fake provider from the OCC key, so only the quote is stated here. */
function putSnapshot(spec: PutFixtureSpec): OptionSnapshotFixture {
  return {
    bid: spec.bid,
    ask: spec.ask,
    mid: spec.mid,
    lastTrade: spec.mid,
    openInterest: spec.openInterest,
    volume: 500,
    greeks: { delta: spec.delta, gamma: '0.02', theta: '-0.03', vega: '0.10' },
    impliedVolatility: '0.28',
    timestamp: QUOTE_TIMESTAMP
  }
}

function buildPutFixtures(specs: PutFixtureSpec[]): Record<string, OptionSnapshotFixture> {
  return Object.fromEntries(specs.map((spec) => [occPutSymbol(spec), putSnapshot(spec)]))
}

// ── Seeding ───────────────────────────────────────────────────────────────────

/** Add each ticker through the production watchlist IPC — never a direct DB write. */
async function seedWatchlist(page: Page, tickers: string[]): Promise<void> {
  await page.evaluate(async (list) => {
    for (const ticker of list) {
      const result = await window.api.watchlist.add({ ticker })
      if (!result.ok) throw new Error(`watchlist.add failed: ${JSON.stringify(result)}`)
    }
  }, tickers)
}

/**
 * Persist an IVR snapshot per ticker through the real collector. The collector reads
 * its targets from open positions, so each ticker gets a throwaway active CSP first —
 * the screener itself only ever reads the watchlist, so these positions are inert.
 */
async function seedIvr(page: Page, ivr: Record<string, number>): Promise<void> {
  const tickers = Object.keys(ivr)
  for (const ticker of tickers) {
    await seedActivePosition(page, ticker)
  }
  await setIvrOutcomes(
    page,
    Object.fromEntries(
      tickers.map((ticker) => [
        ticker,
        okOutcome(ticker, { ivr: ivr[ticker], observedAt: IVR_OBSERVED_AT })
      ])
    )
  )
  await collectIvrNow(page)
}

async function goToScreener(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/screener'
  })
  await page.waitForSelector('h1:has-text("Screener")')
}

// ── Launch ────────────────────────────────────────────────────────────────────

export type ScreenerLaunchOpts = {
  /** Put chains the fake provider serves; their tickers are the seeded watchlist.
   *  Defaults to the three ranking fixtures. */
  fixtures?: PutFixtureSpec[]
  /** IV ranks to persist, keyed by ticker. Tickers omitted here render `n/a`. */
  ivr?: Record<string, number>
  marketStatus?: MarketStatusFixture
  /** MarketDataErrorCode that makes every provider call throw — the outage scenario. */
  marketDataError?: string
}

/**
 * Boot the app with screener fixtures, seed the watchlist (and any IV ranks), then
 * land on the results page. Seeding happens before navigation so the page's first
 * fetch already sees the data.
 */
export async function launchScreener(
  dbPath: string,
  opts: ScreenerLaunchOpts = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const fixtures = opts.fixtures ?? RANKED_PUTS

  // buildIvrLaunchEnv supplies the shared keys plus the WHEELBASE_FAKE_IVR seam this
  // suite seeds IV ranks through; only the option chains and the outage flag are ours.
  const env = buildIvrLaunchEnv(dbPath, { marketStatus: opts.marketStatus })
  env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify(buildPutFixtures(fixtures))
  if (opts.marketDataError) env.FAKE_MARKET_DATA_ERROR = opts.marketDataError

  const app = await launchElectron(env)
  const page = await getPage(app)

  await seedWatchlist(
    page,
    fixtures.map((fixture) => fixture.ticker)
  )
  if (opts.ivr) await seedIvr(page, opts.ivr)
  await goToScreener(page)

  return { app, page }
}

// ── Page queries ──────────────────────────────────────────────────────────────

/** Ranked tickers in rendered row order. */
export async function rankedTickers(page: Page): Promise<string[]> {
  const testids = await page
    .locator('[data-testid^="screener-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''))
  return testids.map((testid) => testid.replace('screener-row-', ''))
}

/** The cell texts of one ranked row, in column order. */
export function rowCells(page: Page, ticker: string): Promise<string[]> {
  return page.locator(`[data-testid="screener-row-${ticker}"] td`).allTextContents()
}

/** The `data-yield-per-delta` score a ranked row exposes for machine verification. */
export function rowScore(page: Page, ticker: string): Promise<string | null> {
  return page.getAttribute(`[data-testid="screener-row-${ticker}"]`, 'data-yield-per-delta')
}
