// Shared helpers for the screener e2e specs — US-66's ranked results and US-67's
// criteria sheet.
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
export const IVR_OBSERVED_AT = '2026-08-07T21:00:00Z'

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
  /** [US-68] Overrides QUOTE_TIMESTAMP — how a re-served quote reads as newer. */
  quotedAt?: string
}

/** [US-68] When the promoted form's re-fetch is served, later than QUOTE_TIMESTAMP so
 *  the provenance strip visibly changes once the fresh quote lands. */
export const FRESH_QUOTE_TIMESTAMP = '2026-08-07T20:11:40Z'

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
export const AAPL_PUT: PutFixtureSpec = {
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

/** [US-67] mid 1.78 / 150 = 1.1867% period, 11.71%/yr over 37 DTE, ÷ 0.26 ⇒ score 0.45
 *  (rank 4, behind MSFT's 0.50). Paired with a seeded IV rank of 22 — the only fixture
 *  below an IV-rank floor of 30, since KO 38 / AAPL 44 / MSFT n/a all clear it. */
export const PEP_PUT: PutFixtureSpec = {
  ticker: 'PEP',
  strike: 150,
  bid: '1.73',
  ask: '1.83',
  mid: '1.78',
  delta: '-0.26',
  openInterest: 3000,
  dteOffset: 37
}

/** [US-67] mid 1.10 / 90 = 1.2222% period, 10.62%/yr over 42 DTE, ÷ 0.18 ⇒ score 0.59.
 *  Deliberately outside the default 0.20–0.30 delta band and inside a conservative
 *  0.15–0.20 / 40–45 one, so a save flips it from excluded to the only ranked row. */
export const SBUX_PUT: PutFixtureSpec = {
  ticker: 'SBUX',
  strike: 90,
  bid: '1.06',
  ask: '1.14',
  mid: '1.10',
  delta: '-0.18',
  openInterest: 1500,
  dteOffset: 42
}

/** The three tickers that rank, in expected rank order. */
export const RANKED_PUTS: PutFixtureSpec[] = [KO_PUT, AAPL_PUT, MSFT_PUT]

/** IV ranks the collector persists for the ranked fixtures. MSFT is absent on purpose. */
export const RANKED_IVR: Record<string, number> = { KO: 38, AAPL: 44 }

/** [US-67] Underlying quotes for the ranked fixtures. Only `price` is read (by the
 *  price-ceiling filter); the rest of the shape is filled so the fixture is a real
 *  `StockQuote`. A $75 ceiling leaves KO and drops AAPL and MSFT. */
export const STOCK_QUOTES: Record<string, StockQuoteFixture> = {
  KO: stockQuote('62.00'),
  AAPL: stockQuote('185.00'),
  MSFT: stockQuote('420.00')
}

// ── Fixture construction ──────────────────────────────────────────────────────

/** One underlying quote as the provider would serve it — the `StockQuote` shape the
 *  WHEELBASE_MOCK_STOCK_QUOTES seam parses. */
type StockQuoteFixture = {
  price: string
  bid: string
  ask: string
  change: string
  changePercent: string
  prevClose: string
  volume: number
  timestamp: string
}

/** A flat quote at `price` — the screener only ever reads `price`. */
function stockQuote(price: string): StockQuoteFixture {
  return {
    price,
    bid: price,
    ask: price,
    change: '0.00',
    changePercent: '0.00',
    prevClose: price,
    volume: 1_000_000,
    timestamp: QUOTE_TIMESTAMP
  }
}

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
    timestamp: spec.quotedAt ?? QUOTE_TIMESTAMP
  }
}

function buildPutFixtures(specs: PutFixtureSpec[]): Record<string, OptionSnapshotFixture> {
  return Object.fromEntries(specs.map((spec) => [occPutSymbol(spec), putSnapshot(spec)]))
}

// ── Seeding ───────────────────────────────────────────────────────────────────

/** Add each ticker through the production watchlist IPC — never a direct DB write.
 *  [US-68] A ticker's note is seeded the same way, since promote reads it back out. */
async function seedWatchlist(
  page: Page,
  tickers: string[],
  notes: Record<string, string> = {}
): Promise<void> {
  await page.evaluate(
    async ({ list, byTicker }) => {
      for (const ticker of list) {
        const result = await window.api.watchlist.add({ ticker, notes: byTicker[ticker] })
        if (!result.ok) throw new Error(`watchlist.add failed: ${JSON.stringify(result)}`)
      }
    },
    { list: tickers, byTicker: notes }
  )
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
  /** Underlying quotes, keyed by ticker. Only read once a price ceiling is set. */
  stockQuotes?: Record<string, StockQuoteFixture>
  marketStatus?: MarketStatusFixture
  /** MarketDataErrorCode that makes every provider call throw — the outage scenario. */
  marketDataError?: string
  /** [US-68] Watchlist notes by ticker; promote seeds the form's thesis from them. */
  watchlistNotes?: Record<string, string>
  /** [US-70] Earnings the fake calendar holds, keyed by ticker. A ticker omitted from a
   *  supplied record reads as a genuinely empty calendar (`unknown`); pass `null` for a
   *  ticker whose own request failed (`unavailable`). Omit the option entirely and every
   *  fixture ticker gets a clear date well past its expiry — see
   *  `CLEAR_EARNINGS_DAY_OFFSET`. */
  earnings?: Record<string, EarningsFixture>
  /** [US-70] Make the whole earnings request fail — the outage scenario, distinct from
   *  a per-ticker gap. */
  earningsUnreachable?: boolean
}

/** [US-70] An earnings date as a day offset from today, so a fixture lands the same
 *  number of days out on any run date — the same technique as `dteOffset`. `null` is
 *  a failed request for that ticker. */
export type EarningsFixture = { dayOffset: number } | null

/** Day offsets → the `EarningsLookup` record the fake calendar reads. */
function buildEarningsFixtures(
  byTicker: Record<string, EarningsFixture>
): Record<string, { status: 'found'; date: string } | { status: 'unavailable' }> {
  return Object.fromEntries(
    Object.entries(byTicker).map(([ticker, fixture]) => [
      ticker.toUpperCase(),
      fixture === null
        ? ({ status: 'unavailable' } as const)
        : ({ status: 'found', date: localDate(fixture.dayOffset) } as const)
    ])
  )
}

/**
 * [US-70] Days out the default earnings fixture sits — past every fixture's expiry (the
 * furthest is 44 DTE) and inside the screener's lookahead, so an ordinary candidate
 * screens `clear` and keeps its rank number.
 *
 * This is why the default exists at all: with no calendar the store answers
 * `unavailable` for every ticker, which correctly demotes every row to `—`. That is the
 * right production behaviour but the wrong premise for the specs that predate this story
 * — US-66's ranked table, US-67's criteria saves, US-68's promote flow all describe
 * ordinary candidates, which now implies a readable calendar.
 *
 * Two bounds constrain the value, both checked by `assertClearOffsetUsable` below:
 * it must exceed the furthest fixture expiry (or the row would be flagged, not clear),
 * and it must stay inside the screener's horizon of `dteMax + LOOKAHEAD_BUFFER_DAYS`
 * (or the fake reads it as out-of-window and the row goes `unknown`). A spec that saves
 * a very narrow `dteMax` shrinks that horizon, which is why the lower bound is asserted
 * rather than left to be discovered as a puzzling `—` three files away.
 */
const CLEAR_EARNINGS_DAY_OFFSET = 60

/** The screener's `LOOKAHEAD_BUFFER_DAYS` and `DEFAULT_SCREENING_CRITERIA.dteMax`.
 *  Mirrored, not imported — e2e drives the packaged app and shares no module graph
 *  with it. */
const LOOKAHEAD_BUFFER_DAYS = 45
const DEFAULT_DTE_MAX = 45

/** Fails loudly if the all-clear default cannot actually read as clear for `fixtures`
 *  under `dteMax`, rather than letting every row silently lose its rank number. */
function assertClearOffsetUsable(fixtures: PutFixtureSpec[], dteMax: number): void {
  const furthestExpiry = Math.max(...fixtures.map((fixture) => fixture.dteOffset))
  if (CLEAR_EARNINGS_DAY_OFFSET <= furthestExpiry) {
    throw new Error(
      `CLEAR_EARNINGS_DAY_OFFSET (${CLEAR_EARNINGS_DAY_OFFSET}) must exceed the furthest ` +
        `fixture expiry (${furthestExpiry} DTE), or those rows screen flagged, not clear.`
    )
  }
  const horizon = dteMax + LOOKAHEAD_BUFFER_DAYS
  if (CLEAR_EARNINGS_DAY_OFFSET > horizon) {
    throw new Error(
      `CLEAR_EARNINGS_DAY_OFFSET (${CLEAR_EARNINGS_DAY_OFFSET}) is past the screener's ` +
        `${horizon}-day horizon for dteMax ${dteMax}, so every row would read "unknown". ` +
        `Pass an explicit \`earnings\` fixture for this spec.`
    )
  }
}

/** Every fixture ticker's earnings safely after its expiry — the "nothing to see here"
 *  calendar a spec that is not about earnings wants. */
function clearEarningsFor(fixtures: PutFixtureSpec[]): Record<string, EarningsFixture> {
  assertClearOffsetUsable(fixtures, DEFAULT_DTE_MAX)
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.ticker, { dayOffset: CLEAR_EARNINGS_DAY_OFFSET }])
  )
}

function screenerLaunchEnv(dbPath: string, opts: ScreenerLaunchOpts): Record<string, string> {
  // buildIvrLaunchEnv supplies the shared keys plus the WHEELBASE_FAKE_IVR seam this
  // suite seeds IV ranks through; only the market-data fixtures are ours.
  const fixtures = opts.fixtures ?? RANKED_PUTS
  const env = buildIvrLaunchEnv(dbPath, { marketStatus: opts.marketStatus })
  env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify(buildPutFixtures(fixtures))
  if (opts.stockQuotes) env.WHEELBASE_MOCK_STOCK_QUOTES = JSON.stringify(opts.stockQuotes)
  if (opts.marketDataError) env.FAKE_MARKET_DATA_ERROR = opts.marketDataError
  // [US-70] The seam is always armed so e2e never reaches the live Finnhub API. Passing
  // `earnings` explicitly — including `{}`, which leaves every ticker `unknown` — opts
  // out of the all-clear default.
  env.WHEELBASE_MOCK_EARNINGS = JSON.stringify(
    buildEarningsFixtures(opts.earnings ?? clearEarningsFor(fixtures))
  )
  if (opts.earningsUnreachable) env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE = '1'
  return env
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

  const app = await launchElectron(screenerLaunchEnv(dbPath, opts))
  const page = await getPage(app)

  await seedWatchlist(
    page,
    fixtures.map((fixture) => fixture.ticker),
    opts.watchlistNotes
  )
  if (opts.ivr) await seedIvr(page, opts.ivr)
  await goToScreener(page)

  return { app, page }
}

/**
 * [US-67] Restart against the same database file — the persistence AC. Nothing is
 * re-seeded: the watchlist, IV-rank snapshots, and saved criteria all live in
 * `dbPath`, which survives the close because `cleanupDb` is a separate step.
 */
export async function relaunchScreener(
  app: ElectronApplication,
  dbPath: string,
  opts: ScreenerLaunchOpts = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  await app.close()

  const relaunched = await launchElectron(screenerLaunchEnv(dbPath, opts))
  const page = await getPage(relaunched)
  await goToScreener(page)

  return { app: relaunched, page }
}

// ── Page queries ──────────────────────────────────────────────────────────────

/** Ranked tickers in rendered row order. */
export async function rankedTickers(page: Page): Promise<string[]> {
  const testids = await page
    .locator('[data-testid^="screener-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''))
  return testids.map((testid) => testid.replace('screener-row-', ''))
}

/** Resolves once exactly `count` ranked rows are rendered — i.e. a re-screen has landed. */
export async function waitForRankedRowCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-testid^="screener-row-"]').length === expected,
    count
  )
}

/** The cell texts of one ranked row, in column order. */
export function rowCells(page: Page, ticker: string): Promise<string[]> {
  return page.locator(`[data-testid="screener-row-${ticker}"] td`).allTextContents()
}

/** The `data-yield-per-delta` score a ranked row exposes for machine verification. */
export function rowScore(page: Page, ticker: string): Promise<string | null> {
  return page.getAttribute(`[data-testid="screener-row-${ticker}"]`, 'data-yield-per-delta')
}

// ── [US-70] Earnings ──────────────────────────────────────────────────────────

/** The earnings badge text on a ranked row, or null when the row carries none — i.e.
 *  the candidate's earnings are `clear`. */
export async function earningsBadge(page: Page, ticker: string): Promise<string | null> {
  const badge = page.locator(
    `[data-testid="screener-row-${ticker}"] [data-testid="earnings-badge"]`
  )
  return (await badge.count()) === 0 ? null : badge.textContent()
}

/** The rank cell of a ranked row — a number when the candidate is clear, `—` when its
 *  earnings verdict demoted it. */
export async function rowRank(page: Page, ticker: string): Promise<string> {
  const cells = await rowCells(page, ticker)
  return cells[0].trim()
}

/** The reason cell of an excluded ticker, after opening the Excluded section. Null when
 *  the ticker is not in that list at all. */
export async function excludedReason(page: Page, ticker: string): Promise<string | null> {
  const toggle = page.locator('[data-testid="screener-excluded-toggle"]')
  if ((await toggle.count()) === 0) return null
  await toggle.click()
  const row = page.locator(`[data-testid="screener-excluded-row-${ticker}"]`)
  if ((await row.count()) === 0) return null
  return (await row.textContent())?.replace(ticker, '') ?? null
}

/** [US-70] Persist the earnings-handling mode through the criteria sheet, then wait for
 *  the re-screen it triggers. Driven as a trader would — no direct IPC write. */
export async function setEarningsHandling(
  page: Page,
  mode: 'exclude' | 'flag',
  expectedRowCount: number
): Promise<void> {
  await openCriteriaSheet(page, 'header')
  await page.click(`[data-testid="earnings-${mode}"]`)
  await saveCriteria(page)
  await waitForCriteriaSheetClosed(page)
  await waitForRankedRowCount(page, expectedRowCount)
}

// ── [US-68] Promote to trade ──────────────────────────────────────────────────
//
// The story's temporal split — the screener saw one quote, the form's re-fetch sees
// another — is produced by mutating the fake provider's env between the two calls.
// `FakeMarketDataProvider` re-reads `process.env` on every call (`buildMockMap` /
// `maybeThrow`), so no new test seam is needed; `ElectronApplication.evaluate` runs
// in the main process, which is where that env lives.

/** Re-serve the option chain, replacing what the screener run was quoted. */
export async function setOptionSnapshotFixtures(
  app: ElectronApplication,
  specs: PutFixtureSpec[]
): Promise<void> {
  await app.evaluate(
    async (_electron, fixtures) => {
      process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = fixtures
    },
    JSON.stringify(buildPutFixtures(specs))
  )
}

/** Make every provider call throw the given MarketDataErrorCode; `null` clears it. */
export async function setMarketDataError(
  app: ElectronApplication,
  code: string | null
): Promise<void> {
  await app.evaluate(async (_electron, value) => {
    if (value === null) delete process.env.FAKE_MARKET_DATA_ERROR
    else process.env.FAKE_MARKET_DATA_ERROR = value
  }, code)
}

/** Click a ranked row's promote action and wait for the promoted form to mount. */
export async function promoteRow(page: Page, ticker: string): Promise<void> {
  await page.click(`[data-testid="screener-promote-${ticker}"]`)
  await page.waitForSelector('[data-testid="promote-provenance"]')
}

/** The kind of banner the promoted form is showing, once one is shown. */
export async function promoteBannerKind(page: Page): Promise<string | null> {
  const banner = page.locator('[data-testid="promote-banner"]')
  await banner.waitFor()
  return banner.getAttribute('data-kind')
}

/** Every active position, through the production read path. */
export function listPositions(
  page: Page
): Promise<{ ticker: string; entryPremiumPerContract: string | null }[]> {
  return page.evaluate(() => window.api.listPositions())
}

// ── [US-67] Criteria sheet ────────────────────────────────────────────────────

/** Criteria field → the `aria-label` its input carries in the sheet. */
const CRITERIA_LABELS = {
  deltaMin: 'Minimum delta',
  deltaMax: 'Maximum delta',
  dteMin: 'Minimum DTE',
  dteMax: 'Maximum DTE',
  minOpenInterest: 'Minimum open interest',
  maxSpreadPercent: 'Max bid-ask spread',
  maxUnderlyingPrice: 'Price ceiling',
  minIvRank: 'IV-rank floor'
} as const

export type CriteriaField = keyof typeof CRITERIA_LABELS

/** Fill order, so a two-ended edit passes through a valid intermediate band —
 *  lowering the minimum before the maximum, and vice versa. */
const CRITERIA_FILL_ORDER: CriteriaField[] = [
  'deltaMin',
  'deltaMax',
  'dteMin',
  'dteMax',
  'minOpenInterest',
  'maxSpreadPercent',
  'maxUnderlyingPrice',
  'minIvRank'
]

function criteriaInput(page: Page, field: CriteriaField): string {
  return `input[aria-label="${CRITERIA_LABELS[field]}"]`
}

/** The three entry points the ACs name, each opening the same sheet. */
export type CriteriaEntryPoint = 'header' | 'strip' | 'empty'

const ENTRY_POINT_SELECTOR: Record<CriteriaEntryPoint, string> = {
  // The only *button* carrying ⚙ — the sidebar's Settings item is an anchor. Matching on
  // its "Criteria" label instead would also hit the empty state's "Adjust criteria",
  // since `:has-text()` is a case-insensitive substring match.
  header: 'button:has-text("⚙")',
  strip: '[data-testid="screener-criteria-strip"]',
  empty: '[data-testid="screener-empty"] button'
}

/** Open the criteria sheet and wait for its form to mount. */
export async function openCriteriaSheet(page: Page, via: CriteriaEntryPoint): Promise<void> {
  await page.click(ENTRY_POINT_SELECTOR[via])
  await page.waitForSelector(criteriaInput(page, 'deltaMin'))
}

/** The dismissals the AC lists — all three discard unsaved edits. */
export type CriteriaDismissal = 'cancel' | 'close' | 'scrim'

const DISMISSAL_SELECTOR: Record<CriteriaDismissal, string> = {
  cancel: 'button:has-text("Cancel")',
  close: 'button[aria-label="Close sheet"]',
  scrim: '[data-testid="sheet-scrim"]'
}

export async function dismissCriteriaSheet(page: Page, via: CriteriaDismissal): Promise<void> {
  await page.click(DISMISSAL_SELECTOR[via])
  await waitForCriteriaSheetClosed(page)
}

/** Resolves once the sheet has unmounted; throws if it stays open. */
export async function waitForCriteriaSheetClosed(page: Page): Promise<void> {
  await page.waitForSelector(criteriaInput(page, 'deltaMin'), { state: 'detached' })
}

/** The sheet's primary action — also what the validation ACs assert is disabled. */
export const SAVE_CRITERIA_BUTTON = 'button:has-text("Save & re-screen")'

/** Click the sheet's primary action. The caller asserts what the save produced. */
export async function saveCriteria(page: Page): Promise<void> {
  await page.click(SAVE_CRITERIA_BUTTON)
}

/** Every criteria input's current value — what "pre-filled from the persisted
 *  criteria" means in one assertable object. A disabled optional reads `''`. */
export async function criteriaValues(page: Page): Promise<Record<CriteriaField, string>> {
  const entries = await Promise.all(
    CRITERIA_FILL_ORDER.map(
      async (field) => [field, await page.inputValue(criteriaInput(page, field))] as const
    )
  )
  return Object.fromEntries(entries) as Record<CriteriaField, string>
}

/** Type new values into the sheet, in the fill order above. */
export async function setCriteriaValues(
  page: Page,
  values: Partial<Record<CriteriaField, string>>
): Promise<void> {
  for (const field of CRITERIA_FILL_ORDER) {
    const value = values[field]
    if (value !== undefined) await page.fill(criteriaInput(page, field), value)
  }
}

/** Whether an Off/On or Exclude/Flag segment is the selected one. */
export async function segmentPressed(page: Page, testId: string): Promise<boolean> {
  return (await page.getAttribute(`[data-testid="${testId}"]`, 'aria-pressed')) === 'true'
}

/** The criteria summary strip's chips, without its `Criteria` label or `Edit →`. */
export async function criteriaChips(page: Page): Promise<string[]> {
  const spans = await page.locator('[data-testid="screener-criteria-strip"] span').allTextContents()
  return spans.slice(1, -1)
}
