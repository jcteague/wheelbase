// Shared helpers for the bench e2e specs — US-66's ranked results, US-67's criteria
// sheet, US-68's promote flow, US-70's earnings tiers and US-98's staleness tiers.
//
// [US-96] The Screener page is gone: everything these specs drive now lives on
// `/watchlist`, where each watchlist stock is a card in one of two sections — Meets
// criteria and Stocks of interest — beside a sticky detail panel. The file keeps its
// name because every spec that imports it would otherwise have to change for a rename
// alone; the queries below are the bench's, not the retired table's.
//
// The suite stays offline: put chains come from the FakeMarketDataProvider's
// OCC-keyed WHEELBASE_MOCK_OPTION_SNAPSHOTS fixtures, IVR rows from the US-44
// fake-scraper seam, and the market session from FAKE_MARKET_STATUS. Every
// rendered number the ACs pin is produced by the real US-65 engine over these
// fixtures — nothing stubs the IPC — so the spec proves the renderer formats what
// the screener actually emits.
import type { ElectronApplication, Page } from 'playwright'
import { addDays, format, parseISO } from 'date-fns'
import { getPage, launchElectron, type MarketStatusFixture } from './assignment-helpers'
import {
  buildIvrLaunchEnv,
  collectIvrNow,
  FAKE_NOW_DAY,
  fakeNowAt,
  okOutcome,
  seedWatchlist,
  setIvrOutcomes,
  type WatchlistConditions
} from './ivr-helpers'
import { BASE_DAY, observedSessionsAgo, sessionsBefore } from './trading-day-fixtures'

/** Every fixture quote carries the same stamp so `quoteTimestamp` (the newest ranked
 *  strike's timestamp) is deterministic for the stale-caption assertion. Pinned to the
 *  fixture day rather than a fixed date — see FAKE_NOW_DAY. */
export const QUOTE_TIMESTAMP = fakeNowAt('20:00:02Z')

/** When the fake IVR scrape is recorded as having happened. Display never shows it;
 *  it only has to be a parseable ISO instant for the snapshot row. */
export const IVR_OBSERVED_AT = fakeNowAt('21:00:00Z')

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
export const FRESH_QUOTE_TIMESTAMP = fakeNowAt('20:11:40Z')

/** A calendar day relative to the fixture day the screener's fake clock runs on —
 *  the offline counterpart of `localDate`, which is anchored to the real clock. */
export function screenerDate(offsetDays: number): string {
  return format(addDays(parseISO(FAKE_NOW_DAY), offsetDays), 'yyyy-MM-dd')
}

// ── Canonical fixtures ────────────────────────────────────────────────────────
//
// Numbers chosen so the real engine reproduces the AC's exact strings — see the
// "E2E fixtures reproduce AC numbers through the real engine" ADR in
// plans/us-66/research.md. Period yield = mid / strike; annualized = period × 365 / DTE;
// score = annualized / |delta|.

/** mid 0.95 / 60 = 1.58% period, 15.62%/yr over 37 DTE, ÷ 0.22 ⇒ score 0.71 (rank 1). */
export const KO_PUT: PutFixtureSpec = {
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
export const MSFT_PUT: PutFixtureSpec = {
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

/** [US-96] What a fixture ticker is quoted at when a spec does not state a price.
 *
 *  Every bench row reads a quote now, not only the ones under a price ceiling: with no
 *  quote a stock carrying a price condition falls to Stocks of interest with `Price
 *  unavailable`, which would silently change the subject of every spec that is not about
 *  price. A flat default keeps the price gate at `none`/`met`, never `unknown`. */
const DEFAULT_UNDERLYING_PRICE = '100.00'

/** [US-96] A quote that moved on the day: the bench reads `prevClose` to derive the day
 *  change, which a flat fixture would render as an unhelpful `0.0%`. */
function movingQuote(price: string, prevClose: string): StockQuoteFixture {
  return { ...stockQuote(price), prevClose }
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
  const [year, month, day] = screenerDate(spec.dteOffset).split('-')
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

/** Fails loudly if an `ivr` key is not a fixture ticker. [US-97] The collector reaches
 *  a ticker only if it is on the watchlist, and `launchScreener` seeds the watchlist
 *  from `fixtures` — so programming an outcome for anything else persists nothing at
 *  all, silently. Before US-97 such a ticker got a throwaway position and an unread
 *  row; now it gets neither, and the next spec to rely on it would chase a missing
 *  value across three files. */
function assertIvrTickersCollectible(tickers: string[], fixtureTickers: string[]): void {
  const orphans = tickers.filter((ticker) => !fixtureTickers.includes(ticker))
  if (orphans.length > 0) {
    throw new Error(
      `seedIvr: [${orphans.join(', ')}] are not fixture tickers, so they are never on the ` +
        `watchlist and will never be collected. Pass only tickers in \`fixtures\` ` +
        `(${fixtureTickers.join(', ')}).`
    )
  }
}

/**
 * [US-98] An IV rank to persist. A bare number is collected "just now" — the case every
 * spec that is not about staleness wants. Supplying `observedAt` is how a spec ages a
 * reading: the collector stores the timestamp verbatim, so the freshness engine counts
 * real sessions between it and the clock. See `e2e/trading-day-fixtures.ts`.
 */
export type IvrFixture = number | { ivr: number; observedAt: string }

function ivrOutcomeFor(ticker: string, fixture: IvrFixture): ReturnType<typeof okOutcome> {
  return typeof fixture === 'number'
    ? okOutcome(ticker, { ivr: fixture, observedAt: IVR_OBSERVED_AT })
    : okOutcome(ticker, fixture)
}

/**
 * Persist an IVR snapshot per ticker through the real collector. [US-97] The collector
 * targets the union of open positions and the watchlist, and `launchScreener` has
 * already seeded these tickers onto the watchlist — so the bench names are collected
 * with no position in the database at all.
 */
async function seedIvr(
  page: Page,
  ivr: Record<string, IvrFixture>,
  fixtureTickers: string[]
): Promise<void> {
  const tickers = Object.keys(ivr)
  assertIvrTickersCollectible(tickers, fixtureTickers)
  await setIvrOutcomes(
    page,
    Object.fromEntries(tickers.map((ticker) => [ticker, ivrOutcomeFor(ticker, ivr[ticker])]))
  )
  const batch = await collectIvrNow(page)
  if (batch.successCount !== tickers.length) {
    throw new Error(
      `seedIvr: programmed ${tickers.length} ok outcomes but the collector persisted ` +
        `${batch.successCount} — batch ${JSON.stringify(batch)}. A run that persists ` +
        `nothing (e.g. skippedReason "market_closed") must fail here, not three files away.`
    )
  }
}

/** [US-96] The bench lives on the Watchlist page — there is no `#/screener` any more. */
async function goToBench(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/watchlist'
  })
  await page.waitForSelector('h1:has-text("Watchlist")')
}

// ── Launch ────────────────────────────────────────────────────────────────────

export type ScreenerLaunchOpts = {
  /** Put chains the fake provider serves; their tickers are the seeded watchlist.
   *  Defaults to the three ranking fixtures. */
  fixtures?: PutFixtureSpec[]
  /** IV ranks to persist, keyed by ticker. Tickers omitted here render `n/a`. */
  ivr?: Record<string, IvrFixture>
  /** [US-98] The instant the shared fake clock starts at — what the collector treats as
   *  "now" and what the screener ages readings against. Defaults to DEFAULT_FAKE_NOW. */
  fakeNow?: string
  /** [US-116] The exchange calendar the fake market-data provider publishes. Omit and
   *  every weekday in range is a normal session; supply one to make a specific day a
   *  recognised closure. */
  marketCalendar?: Array<{ date: string; close: string }>
  /** Underlying quotes, keyed by ticker. [US-96] Every bench row reads one, so omitting
   *  this seeds a flat DEFAULT_UNDERLYING_PRICE quote for each fixture rather than none. */
  stockQuotes?: Record<string, StockQuoteFixture>
  /** [US-96] Entry conditions to seed per ticker, through the real `watchlist.add`. */
  conditions?: Record<string, WatchlistConditions>
  marketStatus?: MarketStatusFixture
  /** MarketDataErrorCode that makes every provider call throw — the outage scenario. */
  marketDataError?: string
  /** [US-116] MarketDataErrorCode that fails only `getMarketCalendar`, leaving quotes and
   *  chains serving normally — the "a calendar failure degrades IV freshness only" case,
   *  which the global seam above cannot express. */
  marketCalendarError?: string
  /** [US-116] Market-data credentials saved with no broker attached — see LaunchOpts. */
  marketDataWithoutBroker?: boolean
  /** [US-99] Launch with no Alpaca credentials, for the "not connected" card. */
  withoutBrokerCredentials?: boolean
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
 *  a failed request for that ticker.
 *
 *  [US-98] `{ next, last }` states both sides explicitly, for the specs that care which
 *  side of an observation a print fell on. `dayOffset` cannot express that: it is one
 *  date the fake reads as answering whichever side of today it lands on. */
export type EarningsFixture =
  | { dayOffset: number }
  | { next: string | null; last: string | null }
  | null

/** Day offsets → the `EarningsLookup` record the fake calendar reads. */
type EarningsFeedFixture =
  | { status: 'found'; date: string }
  | { status: 'read'; next: string | null; last: string | null }
  | { status: 'unavailable' }

function toFeedFixture(fixture: EarningsFixture): EarningsFeedFixture {
  if (fixture === null) return { status: 'unavailable' }
  if ('dayOffset' in fixture) return { status: 'found', date: screenerDate(fixture.dayOffset) }
  return { status: 'read', next: fixture.next, last: fixture.last }
}

function buildEarningsFixtures(
  byTicker: Record<string, EarningsFixture>
): Record<string, EarningsFeedFixture> {
  return Object.fromEntries(
    Object.entries(byTicker).map(([ticker, fixture]) => [
      ticker.toUpperCase(),
      toFeedFixture(fixture)
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

/** Every fixture ticker quoted flat, so no bench row is missing a price. */
function flatQuotesFor(fixtures: PutFixtureSpec[]): Record<string, StockQuoteFixture> {
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.ticker, stockQuote(DEFAULT_UNDERLYING_PRICE)])
  )
}

// ── [US-96] The canonical bench ───────────────────────────────────────────────
//
// One watchlist of nine stocks, chosen so that every verdict the bench can reach is on
// screen at once: two names that meet criteria, and seven held back for seven different
// reasons — an unmet price target, an unmet IV trigger, an earnings gate, a stale
// reading, a reading a print invalidated, an expired reading, a reading that was never
// collected, and the screener's own exclusion.
//
// Like the fixtures above, every number here is the real engine's: see the
// "US-96 bench fixtures" tests in `src/main/core/screener.test.ts`, which run these
// contracts through `screenTicker` and pin the strings the ACs quote.

/** mid 0.65 / 50 = 1.3% period, 12.82%/yr over 37 DTE, ÷ 0.24 ⇒ score 0.53 — below KO's
 *  0.71, which is what makes the Meets-criteria order KO then XLF. Spread 0.06 stays under
 *  the $0.10 absolute ceiling, so the 9.23% percentage never bites. */
export const XLF_PUT: PutFixtureSpec = {
  ticker: 'XLF',
  strike: 50,
  bid: '0.62',
  ask: '0.68',
  mid: '0.65',
  delta: '-0.24',
  openInterest: 8610,
  dteOffset: 37
}

/** Spread 0.42 on a 3.00 mark is exactly 14%, and 0.42 also clears the $0.10 absolute
 *  ceiling — both limits must break for the filter to fire — so the engine emits the AC's
 *  literal `spread 14% exceeds 10%`. Everything else about the strike qualifies. */
export const AMD_PUT: PutFixtureSpec = {
  ticker: 'AMD',
  strike: 150,
  bid: '2.79',
  ask: '3.21',
  mid: '3.00',
  delta: '-0.25',
  openInterest: 1000,
  dteOffset: 37
}

/** An unremarkable qualifying put. DIS, ORCL and XYZ are held back by their IV readings,
 *  never by their chains, so each needs a strike that clears every hard filter — a stock
 *  with no chain at all would be waiting for the wrong reason. */
export const DIS_PUT: PutFixtureSpec = {
  ticker: 'DIS',
  strike: 100,
  bid: '1.47',
  ask: '1.53',
  mid: '1.50',
  delta: '-0.25',
  openInterest: 2000,
  dteOffset: 37
}

export const ORCL_PUT: PutFixtureSpec = {
  ticker: 'ORCL',
  strike: 120,
  bid: '1.76',
  ask: '1.84',
  mid: '1.80',
  delta: '-0.26',
  openInterest: 2500,
  dteOffset: 37
}

export const XYZ_PUT: PutFixtureSpec = {
  ticker: 'XYZ',
  strike: 40,
  bid: '0.48',
  ask: '0.52',
  mid: '0.50',
  delta: '-0.23',
  openInterest: 900,
  dteOffset: 37
}

/** The bench, in the order the story's Background names it. */
export const BENCH_PUTS: PutFixtureSpec[] = [
  KO_PUT,
  XLF_PUT,
  PEP_PUT,
  DIS_PUT,
  ORCL_PUT,
  AAPL_PUT,
  MSFT_PUT,
  AMD_PUT,
  XYZ_PUT
]

/** The entry conditions each bench stock carries. XLF is deliberately absent: a stock with
 *  no personal conditions must still reach Meets criteria on the screening defaults. */
export const BENCH_CONDITIONS: Record<string, WatchlistConditions> = {
  KO: { ivrTrigger: 40 },
  PEP: { ivrTrigger: 45 },
  DIS: { ivrTrigger: 40 },
  ORCL: { ivrTrigger: 50 },
  AAPL: { ownBelowPrice: 170, ivrTrigger: 50 },
  MSFT: { postEarningsOnly: true },
  AMD: { ivrTrigger: 50 },
  XYZ: { ivrTrigger: 40 }
}

/**
 * One reading per freshness tier, aged by moving the observation back through sessions —
 * never by moving the clock, which would also move every fixture's DTE.
 *
 * XYZ is omitted on purpose: it is the never-collected ticker, whose cell must read `n/a`
 * with no ring rather than borrow another stock's tier.
 */
export const BENCH_IVR: Record<string, IvrFixture> = {
  KO: { ivr: 58, observedAt: observedSessionsAgo(0) }, // fresh
  XLF: { ivr: 46, observedAt: observedSessionsAgo(0) }, // fresh
  AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) }, // fresh, but below AAPL's trigger
  MSFT: { ivr: 41, observedAt: observedSessionsAgo(2) }, // aging
  ORCL: { ivr: 62, observedAt: observedSessionsAgo(2) }, // aging on time, but see ORCL_LAST_PRINT
  PEP: { ivr: 58, observedAt: observedSessionsAgo(6) }, // stale
  DIS: { ivr: 47, observedAt: observedSessionsAgo(12) }, // expired
  AMD: { ivr: 52, observedAt: observedSessionsAgo(0) } // fresh
}

/**
 * The print that invalidates ORCL's reading — the session after the one it was observed in.
 *
 * Both bounds are tight. `assessIvRank` only counts a print that is strictly *after* the
 * observation's session, and the fake calendar only reports a `last` print strictly before
 * today, so the print has to sit in the one session between them. That is why ORCL is
 * observed two sessions ago rather than one: with a one-session-old reading there is no
 * such session to put the print in on four weekdays out of five.
 */
export const ORCL_LAST_PRINT = sessionsBefore(BASE_DAY, 1)

/** The session PEP's stale reading was taken in — what its tooltip names. */
export const PEP_OBSERVED_SESSION = sessionsBefore(BASE_DAY, 6)

/**
 * What the earnings calendar holds for the bench. A ticker omitted here is a calendar that
 * was read and holds nothing, which demotes its rank but never excludes it — see
 * `buildEarningsFixtures`. XYZ is omitted so its detail line reads as genuinely unknown.
 */
export const BENCH_EARNINGS: Record<string, EarningsFixture> = {
  KO: { dayOffset: 40 }, // past KO's 37-DTE expiry, so KO screens clear
  MSFT: { dayOffset: 3 }, // inside the row window and before expiry: the post-earnings gate
  AMD: { dayOffset: 5 }, // inside the row window, for the caution every stock gets
  ORCL: { next: null, last: ORCL_LAST_PRINT }
}

/** Quotes for the bench. Only AAPL and MSFT move — the day-change ACs name them — and the
 *  rest stay flat so no other scenario is quietly also a price scenario. */
export const BENCH_QUOTES: Record<string, StockQuoteFixture> = {
  ...flatQuotesFor(BENCH_PUTS),
  AAPL: movingQuote('178.40', '176.98'), // +0.8% on the day
  MSFT: movingQuote('505.10', '511.24') // −1.2% on the day
}

function screenerLaunchEnv(dbPath: string, opts: ScreenerLaunchOpts): Record<string, string> {
  // buildIvrLaunchEnv supplies the shared keys plus the WHEELBASE_FAKE_IVR seam this
  // suite seeds IV ranks through; only the market-data fixtures are ours.
  const fixtures = opts.fixtures ?? RANKED_PUTS
  const env = buildIvrLaunchEnv(dbPath, {
    marketStatus: opts.marketStatus,
    withoutBrokerCredentials: opts.withoutBrokerCredentials,
    marketDataWithoutBroker: opts.marketDataWithoutBroker,
    fakeNow: opts.fakeNow,
    marketCalendar: opts.marketCalendar
  })
  env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify(buildPutFixtures(fixtures))
  env.WHEELBASE_MOCK_STOCK_QUOTES = JSON.stringify(opts.stockQuotes ?? flatQuotesFor(fixtures))
  if (opts.marketDataError) env.FAKE_MARKET_DATA_ERROR = opts.marketDataError
  if (opts.marketCalendarError) env.FAKE_MARKET_CALENDAR_ERROR = opts.marketCalendarError
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

  const fixtureTickers = fixtures.map((fixture) => fixture.ticker)

  const app = await launchElectron(screenerLaunchEnv(dbPath, opts))
  const page = await getPage(app)

  await seedWatchlist(page, fixtureTickers, opts.watchlistNotes, opts.conditions)
  if (opts.ivr) await seedIvr(page, opts.ivr, fixtureTickers)
  await goToBench(page)

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
  await goToBench(page)

  return { app: relaunched, page }
}

/**
 * [US-98] Re-mount the bench against the same running app, so the next screen runs at
 * the shared fake clock's current value. Used by the specs that move the clock after
 * seeding — a hash that is already `#/watchlist` would not remount on its own.
 */
export async function reloadBench(page: Page): Promise<void> {
  await page.reload()
  await page.waitForSelector('h1:has-text("Watchlist")')
}

// ── [US-96] Bench queries ─────────────────────────────────────────────────────
//
// Every card carries `data-testid="watchlist-row-{ticker}"` and the section it landed
// in, so which half of the bench a stock is on is read off the card itself rather than
// by walking the DOM up to a heading.

type BenchSection = 'meets' | 'waiting'

function benchCard(ticker: string): string {
  return `[data-testid="watchlist-row-${ticker}"]`
}

async function sectionTickers(page: Page, section: BenchSection): Promise<string[]> {
  const testids = await page
    .locator(`[data-bench-section="${section}"]`)
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid') ?? ''))
  return testids.map((testid) => testid.replace('watchlist-row-', ''))
}

/** The Meets-criteria cards in rendered order — the screener's own rank order. */
export function meetsTickers(page: Page): Promise<string[]> {
  return sectionTickers(page, 'meets')
}

/** The Stocks-of-interest cards in rendered order — the trader's watchlist order. */
export function waitingTickers(page: Page): Promise<string[]> {
  return sectionTickers(page, 'waiting')
}

/**
 * Resolves once `ticker` has a card on the bench, and — when a section is named — once it
 * has landed in that half.
 *
 * Naming the section is how a spec waits for the *screen* rather than the watchlist: the
 * card itself is rendered from the watchlist snapshot, which resolves first, so waiting on
 * the bare card would let an assertion about ranking run before the screener answered.
 */
export async function waitForBenchCard(
  page: Page,
  ticker: string,
  section?: BenchSection
): Promise<void> {
  const inSection = section === undefined ? '' : `[data-bench-section="${section}"]`
  await page.waitForSelector(`${benchCard(ticker)}${inSection}`)
}

/** Resolves once exactly `count` cards sit in Meets criteria — i.e. a re-screen landed. */
export async function waitForMeetsCardCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-bench-section="meets"]').length === expected,
    count
  )
}

/** The text of an element that a card carries only sometimes — null when the card omits
 *  it, and null when the ticker is not on the bench at all. Which of the two it was is
 *  never the question a spec is asking: both mean "the card is not saying this". */
async function cardText(page: Page, ticker: string, testId: string): Promise<string | null> {
  const element = page.locator(`${benchCard(ticker)} [data-testid="${testId}"]`)
  if ((await element.count()) === 0) return null
  return (await element.textContent())?.trim() ?? null
}

/** The rank pill on a card — `#1` when the candidate is clear, `—` when its earnings
 *  verdict demoted it, and null for a waiting card, which carries no rank at all. */
export function cardRank(page: Page, ticker: string): Promise<string | null> {
  return cardText(page, ticker, 'watchlist-rank')
}

/** The yield-per-delta score a ranked card exposes for machine verification — it sits on
 *  the rank pill's title, since the card has no column to spend on it. */
export function cardScore(page: Page, ticker: string): Promise<string | null> {
  return page.getAttribute(`${benchCard(ticker)} [data-testid="watchlist-rank"]`, 'title')
}

/** Why a stock is waiting, verbatim. Null when the card meets criteria (and so shows the
 *  put on offer instead) or when the ticker is not on the bench at all. */
export function cardReason(page: Page, ticker: string): Promise<string | null> {
  return cardText(page, ticker, 'watchlist-reason')
}

/** Open a stock's detail panel, as a trader would — by clicking its ticker. */
export async function selectCard(page: Page, ticker: string): Promise<void> {
  await page.click(`${benchCard(ticker)} [data-testid="watchlist-ticker"]`)
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-testid="bench-detail-ticker"]')?.textContent?.trim() ===
      expected,
    ticker
  )
}

/** The header lines of the matching-put card, keyed apart from the metric list. */
export const PUT_CONTRACT = 'Contract'
export const PUT_EXPIRATION = 'Expiration'
export const PUT_CAPTION = 'Caption'

/**
 * The selected stock's matching put as one assertable object: the contract and expiry
 * lines, every `dt` → `dd` metric, and the cash-to-secure caption.
 *
 * A Map rather than an array, because the panel states each metric beside its own label —
 * pinning a value to a position would re-introduce the retired table's column indexes.
 */
export async function detailPutMetrics(page: Page): Promise<Map<string, string>> {
  const card = page.locator('[data-testid="bench-detail-put"]')
  await card.waitFor()
  const entries = await card.evaluate(
    (node, keys) => {
      const read = (el: Element | null | undefined): string =>
        el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const [contract, expiration] = node.querySelectorAll(':scope > div > span')
      const pairs: [string, string][] = [
        [keys.contract, read(contract)],
        [keys.expiration, read(expiration)]
      ]
      node
        .querySelectorAll('dt')
        .forEach((dt) => pairs.push([read(dt), read(dt.nextElementSibling)]))
      pairs.push([keys.caption, read(node.querySelector(':scope > p'))])
      return pairs
    },
    { contract: PUT_CONTRACT, expiration: PUT_EXPIRATION, caption: PUT_CAPTION }
  )
  return new Map(entries)
}

/** The selected stock's day change, with the direction that drives its colour. */
export async function detailDayChange(
  page: Page
): Promise<{ percent: string; direction: string | null }> {
  const cell = page.locator('[data-testid="bench-day-change"]')
  return {
    percent: (await cell.textContent())?.trim() ?? '',
    direction: await cell.getAttribute('data-direction')
  }
}

/** The selected stock's earnings line, with the tone that marks it as a caution. */
export async function detailEarnings(page: Page): Promise<{ text: string; tone: string | null }> {
  const line = page.locator('[data-testid="bench-detail-earnings"]')
  return {
    text: (await line.textContent())?.trim() ?? '',
    tone: await line.getAttribute('data-tone')
  }
}

/** [US-98] The rendered IV-rank cell on a card: what a trader sees, the state the engine
 *  assigned, the tier its ring draws, and the accessible label carrying the age. */
export type IvrCellReading = {
  text: string
  state: string | null
  /** Null when no ring is drawn — a ticker that was never collected. */
  ring: string | null
  /** Null for a never-collected ticker, which has no reading to describe. */
  label: string | null
}

export async function ivrCell(page: Page, ticker: string): Promise<IvrCellReading> {
  const cell = page.locator(`${benchCard(ticker)} [data-testid="ivr-cell"]`)
  if ((await cell.count()) === 0) {
    const empty = page.locator(`${benchCard(ticker)} [data-ivr-state="empty"]`)
    return {
      text: (await empty.textContent())?.trim() ?? '',
      state: 'empty',
      ring: null,
      label: null
    }
  }
  const ring = cell.locator('[data-testid="freshness-ring"]')
  return {
    text: (await cell.textContent())?.trim() ?? '',
    state: await cell.getAttribute('data-ivr-state'),
    ring: (await ring.count()) === 0 ? null : await ring.getAttribute('data-state'),
    label: await cell.getAttribute('aria-label')
  }
}

/** [US-96] Hover a card's IV reading and wait for the tier tooltip it opens. */
export async function hoverIvrRing(page: Page, ticker: string): Promise<void> {
  await page.hover(`${benchCard(ticker)} [data-testid="ivr-cell"]`)
  await page.waitForSelector('[data-testid="ivr-tooltip"]')
}

// ── [US-70] Earnings ──────────────────────────────────────────────────────────

/** The earnings badge text on a card, or null when the card carries none — i.e.
 *  the candidate's earnings are `clear`. */
export function earningsBadge(page: Page, ticker: string): Promise<string | null> {
  return cardText(page, ticker, 'earnings-badge')
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
  await waitForMeetsCardCount(page, expectedRowCount)
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

/** [US-116] Fail only `getMarketCalendar` with the given MarketDataErrorCode; `null`
 *  clears it, so a spec can start from "the calendar has never been fetched" and then
 *  let the bench resolve it. */
export async function setMarketCalendarError(
  app: ElectronApplication,
  code: string | null
): Promise<void> {
  await app.evaluate(async (_electron, value) => {
    if (value === null) delete process.env.FAKE_MARKET_CALENDAR_ERROR
    else process.env.FAKE_MARKET_CALENDAR_ERROR = value
  }, code)
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

/** [US-96] Promote a bench candidate: the handoff moved onto the detail panel, so the
 *  stock has to be selected before its Review trade action exists to click. */
export async function promoteCard(page: Page, ticker: string): Promise<void> {
  await selectCard(page, ticker)
  await page.click(`[data-testid="bench-review-${ticker}"]`)
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
  // [US-96] The bench header names the action outright ("Screening criteria") instead of
  // the Screener page's ⚙ glyph, so the button carries its own test id.
  header: '[data-testid="bench-criteria"]',
  strip: '[data-testid="screener-criteria-strip"]',
  // The empty state now sits *inside* the Meets-criteria section, but its card and its
  // "Adjust criteria" action are the same ones the Screener page showed.
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
