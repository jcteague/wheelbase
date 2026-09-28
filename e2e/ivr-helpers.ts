// Shared helpers for the IV-history e2e specs (US-44/US-97/US-98/US-100/US-121).
//
// The e2e suite must stay offline. [US-121] IV rank is computed from the app's own IV30
// series, which the collector builds from daily option and stock bars. Offline those bars
// come from `FakeMarketDataProvider`, which prices every requested option leg with
// Black–Scholes at the IV a fixture programs for that session — so the real engine inverts
// the fake's prices back to exactly the programmed IV. The fixture is supplied at boot
// through WHEELBASE_FAKE_IV_SERIES and replaced at runtime through the dev-only
// `_test:iv-series-set` channel (guarded by NODE_ENV === 'test'); persisted rows and the
// fake's bar-request log are read back the same way. Contract:
// plans/us-121/contracts/test-iv-history.md.
import type { ElectronApplication, Page } from 'playwright'
import {
  REGULAR_SESSION,
  buildLaunchEnv,
  launchElectron,
  seedCsp,
  type CspFixture,
  type MarketStatusFixture
} from './assignment-helpers'
import { localDate } from './dates'
import { BASE_DAY, afterCloseOn, sessionsBefore, sessionsBetween } from './trading-day-fixtures'

/** The Eastern calendar day the offline fixtures are built around — see BASE_DAY. */
export const FAKE_NOW_DAY = BASE_DAY

/** 21:00Z on that day: 17:00 EDT or 16:00 EST, either way at or after the 16:00 ET
 *  close, so the session counts as complete and the collector reads it. */
export const DEFAULT_FAKE_NOW = afterCloseOn(FAKE_NOW_DAY)

/** An instant on the fixture day, for quote and observation stamps that must read as
 *  same-session rather than stale. */
export function fakeNowAt(time: string): string {
  return `${FAKE_NOW_DAY}T${time}`
}

// ── [US-121] The fake IV series ──────────────────────────────────────────────

/** One session of a programmed series: a flat vol surface, optionally thinned. Mirrors
 *  `FakeIvSessionSpec` in src/main/integrations/fake-market-data.ts — stated rather than
 *  imported because e2e drives the packaged app and shares no module graph with it. */
export type FakeIvSessionSpec =
  | number
  | {
      iv: number
      untraded?: Array<{ strike: number; type: 'call' | 'put' }>
      tradeCount?: number
      weeklyTradeCount?: number
    }

export type FakeIvSeries = {
  price: number
  tradeCount?: number
  weeklyTradeCount?: number
  latencyMs?: number
  failWith?: 'network_error' | 'rate_limited' | 'unknown'
  sessions: Record<string, FakeIvSessionSpec>
}

export type FakeIvSeriesFixture = Record<string, FakeIvSeries>

/** The rank window plus its anchor — what one full backfill reads. */
const SERIES_SESSIONS = 253

/** Every fixture's underlying VWAP. A round price sits on every strike increment, so the
 *  engine probes one at-the-money strike per expiration and inverts it cleanly. */
export const SERIES_PRICE = 100

const RANK_LOW = 0.2
const RANK_HIGH = 0.6

function round4(x: number): number {
  return Number(x.toFixed(4))
}

/** `values` (oldest first) keyed onto the weekday sessions ending at `last`. */
export function seriesEnding(last: string, values: number[]): FakeIvSeries {
  const days = sessionsBetween(last, values.length)
  return {
    price: SERIES_PRICE,
    sessions: Object.fromEntries(days.map((day, i) => [day, values[i]]))
  }
}

/** `values` (oldest first) ending `endingSessionsAgo` sessions before FAKE_NOW_DAY. */
function seriesOf(values: number[], endingSessionsAgo = 0): FakeIvSeries {
  return seriesEnding(sessionsBefore(FAKE_NOW_DAY, endingSessionsAgo), values)
}

/**
 * A 253-session series whose newest reading has IV rank exactly `rank`.
 *
 * The 252 window readings are evenly spaced over [0.2000, 0.6000] and the anchor is
 * `0.2 + 0.004·rank`, so (anchor − low) / (high − low) · 100 = rank with no rounding.
 *
 * `endingSessionsAgo` ages the reading: the series stops that many sessions before
 * FAKE_NOW_DAY. The collector only ever reads the 253 sessions ending at the latest close,
 * so an aged series loses its oldest `endingSessionsAgo` readings — the low and high are
 * therefore placed on the two newest window sessions, where they always survive, and the
 * dropped readings are interior values that cannot move the rank.
 */
export function seriesForRank(
  rank: number,
  { endingSessionsAgo = 0 }: { endingSessionsAgo?: number } = {}
): FakeIvSeries {
  const step = (RANK_HIGH - RANK_LOW) / (SERIES_SESSIONS - 2)
  const interior = Array.from({ length: SERIES_SESSIONS - 3 }, (_, i) =>
    round4(RANK_LOW + step * (i + 1))
  )
  const anchor = round4(RANK_LOW + 0.004 * rank)
  return seriesOf([...interior, RANK_LOW, RANK_HIGH, anchor], endingSessionsAgo)
}

/** A 253-session series whose window spans exactly [low, high], ending with `today`. The
 *  window alternates between low and high around a midpoint, so both bounds are hit. */
export function seriesWithRange({
  low,
  high,
  today,
  sessions = SERIES_SESSIONS
}: {
  low: number
  high: number
  today: number
  sessions?: number
}): FakeIvSeries {
  const window = Array.from({ length: sessions - 1 }, (_, i) =>
    i === 0 ? low : i === 1 ? high : round4((low + high) / 2)
  )
  return seriesOf([...window, today])
}

/** A 253-session series where exactly `belowCount` of the 252 window readings sit below
 *  `today` (at `low`) and the rest above it (at `high`). */
export function seriesWithPercentile({
  belowCount,
  today,
  low = round4(today / 2),
  high = round4(today * 2)
}: {
  belowCount: number
  today: number
  low?: number
  high?: number
}): FakeIvSeries {
  const window = Array.from({ length: SERIES_SESSIONS - 1 }, (_, i) =>
    i < belowCount ? low : high
  )
  return seriesOf([...window, today])
}

/** A 253-session series at one IV throughout — a flat window. */
export function flatSeries(iv: number): FakeIvSeries {
  return seriesOf(Array.from({ length: SERIES_SESSIONS }, () => iv))
}

/**
 * A full-length series with holes: the anchor on FAKE_NOW_DAY plus `readingCount` window
 * readings spread evenly across the 252 window sessions, the rest absent (the collector
 * records them as gaps). Coverage reads exactly `readingCount`.
 */
export function sparseSeries(readingCount: number): FakeIvSeries {
  const windowSize = SERIES_SESSIONS - 1
  const days = sessionsBetween(FAKE_NOW_DAY, SERIES_SESSIONS)
  const kept = days.filter(
    (_, i) =>
      i === windowSize ||
      Math.floor(((i + 1) * readingCount) / windowSize) >
        Math.floor((i * readingCount) / windowSize)
  )
  return {
    price: SERIES_PRICE,
    sessions: Object.fromEntries(kept.map((day, i) => [day, i % 2 === 0 ? RANK_LOW : RANK_HIGH]))
  }
}

export type IvrLaunchOpts = {
  marketStatus?: MarketStatusFixture
  /** ISO timestamp the collector's trading-day check should treat as "now". */
  fakeNow?: string
  /** Launch with no Alpaca credentials — see LaunchOpts. */
  withoutBrokerCredentials?: boolean
  /** [US-116] Market-data credentials but no broker — see LaunchOpts. */
  marketDataWithoutBroker?: boolean
  /** [US-116] The exchange calendar `FakeMarketDataProvider.getMarketCalendar` publishes,
   *  and so what a refresh caches into `trading_session`. Omit and the fake generates
   *  every weekday in range as a normal 16:00 ET session; supply one to make a specific
   *  day a *recognised* closure rather than a day that was simply never fetched. */
  marketCalendar?: Array<{ date: string; close: string }>
  /** [US-121] The IV series the fake provider prices daily bars from, from boot. Replace
   *  it at runtime with `setIvSeries`. Omit and no ticker has any bar data. */
  ivSeries?: FakeIvSeriesFixture
}

export function buildIvrLaunchEnv(
  dbPath: string,
  opts: IvrLaunchOpts = {}
): Record<string, string> {
  // Reuse the shared launch-env builder for the common keys (DB path, FAKE_BROKER,
  // FAKE_MARKET_DATA, NODE_ENV, PRESEED, FAKE_MARKET_STATUS), then layer on the
  // IVR-specific seam vars.
  const env = buildLaunchEnv(dbPath, {
    marketStatus: opts.marketStatus ?? REGULAR_SESSION,
    withoutBrokerCredentials: opts.withoutBrokerCredentials,
    marketDataWithoutBroker: opts.marketDataWithoutBroker
  })
  // Presence switches every IV consumer onto the shared fake clock, which
  // `_test:ivr-set-now` then moves at runtime.
  env.WHEELBASE_FAKE_IV_SERIES = JSON.stringify(opts.ivSeries ?? {})
  env.WHEELBASE_FAKE_NOW = opts.fakeNow ?? DEFAULT_FAKE_NOW
  if (opts.marketCalendar) env.FAKE_MARKET_CALENDAR = JSON.stringify(opts.marketCalendar)
  return env
}

export async function launchIvrApp(
  dbPath: string,
  opts: IvrLaunchOpts = {}
): Promise<ElectronApplication> {
  return launchElectron(buildIvrLaunchEnv(dbPath, opts))
}

/** A future-dated CSP fixture for a given ticker so create-position validation passes. */
export function activeCspFixture(ticker: string, strike = 100): CspFixture {
  const expiration = localDate(30)
  const [year, month, day] = expiration.split('-')
  const occDate = `${year.slice(2)}${month}${day}`
  const strikePart = String(Math.round(strike * 1000)).padStart(8, '0')
  return {
    ticker,
    strike,
    expiration,
    contracts: 1,
    premiumPerContract: 1.5,
    occSymbol: `${ticker}${occDate}P${strikePart}`
  }
}

/** Seed one active (CSP_OPEN) position for the ticker via the createPosition IPC. */
export async function seedActivePosition(
  page: Page,
  ticker: string,
  strike = 100
): Promise<string> {
  return seedCsp(page, activeCspFixture(ticker, strike))
}

/**
 * [US-96] The entry conditions a seeded stock carries, exactly as `watchlist.add` takes
 * them. Stated rather than typed off the preload payload because e2e drives the packaged
 * app and shares no module graph with it.
 */
export type WatchlistConditions = {
  ownBelowPrice?: number
  ivrTrigger?: number
  postEarningsOnly?: boolean
}

/** Add each ticker through the production watchlist IPC — never a direct DB write.
 *  [US-68] A ticker's note is seeded the same way, since promote reads it back out.
 *  [US-96] So are its entry conditions, since the bench's verdicts are read off them. */
export async function seedWatchlist(
  page: Page,
  tickers: string[],
  notes: Record<string, string> = {},
  conditions: Record<string, WatchlistConditions> = {}
): Promise<void> {
  await page.evaluate(
    async ({ list, byTicker, conditionsByTicker }) => {
      for (const ticker of list) {
        const result = await window.api.watchlist.add({
          ticker,
          notes: byTicker[ticker],
          ...conditionsByTicker[ticker]
        })
        if (!result.ok) throw new Error(`watchlist.add failed: ${JSON.stringify(result)}`)
      }
    },
    { list: tickers, byTicker: notes, conditionsByTicker: conditions }
  )
}

/** [US-97] Drop a ticker through the production watchlist IPC — the collector must
 *  stop targeting it on the next run. */
export async function removeFromWatchlist(page: Page, ticker: string): Promise<void> {
  await page.evaluate(async (symbol) => {
    const result = await window.api.watchlist.remove({ ticker: symbol })
    if (!result.ok) throw new Error(`watchlist.remove failed: ${JSON.stringify(result)}`)
  }, ticker)
}

/** [US-97] Seed a position and close it, so the ticker's only position is CLOSED —
 *  the discriminating case for the positions∪watchlist union. */
export async function seedClosedPosition(page: Page, ticker: string): Promise<string> {
  const positionId = await seedActivePosition(page, ticker)
  await page.evaluate(async (id) => {
    const result = await window.api.closePosition({ positionId: id, closePricePerContract: 0.05 })
    if (!result.ok) throw new Error(`closePosition failed: ${JSON.stringify(result)}`)
  }, positionId)
  return positionId
}

/** One `iv30_reading` row as `_test:iv30-history` returns it (snake_case columns). Only
 *  the columns the specs read are typed. */
export type Iv30ReadingRow = {
  underlying: string
  session: string
  observed_at: string
  iv30: string
  method: string
  engine_version: number
  expiration_tier: string
  near_expiration: string
  near_strike: string
  near_call_trades: number
  near_put_trades: number
  far_expiration: string | null
  rate: string
}

export type Iv30GapRow = {
  underlying: string
  session: string
  method: string
  reason: string
  attempted_at: string
}

export type DailyBarRequest = {
  kind: 'option' | 'stock'
  underlying: string
  start: string
  end: string | null
}

export type IvrBatch = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_data_unavailable' | null
}

/** [US-116] How many rows the cached exchange calendar holds. Zero means it has never
 *  been fetched — the fresh-install state the bench is supposed to resolve by itself. */
export async function tradingSessionCount(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    return await window.api.testTradingSessionCount()
  })
}

/** [US-116] How many calendar fetches the fake provider has served. The refresh throttle
 *  lives in the store, so a skipped fetch is otherwise indistinguishable from a made one. */
export async function marketCalendarFetches(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    return await window.api.testMarketCalendarFetchCount()
  })
}

/** [US-121] Replace the fake provider's IV series and clear its bar-request log, so what
 *  `readDailyBarRequests` reports afterwards is only the work that follows. */
export async function setIvSeries(page: Page, fixture: FakeIvSeriesFixture): Promise<void> {
  await page.evaluate(async (next) => {
    const result = await window.api.testIvSeriesSet(next)
    if (!result.ok) throw new Error(result.error ?? 'invalid IV series fixture')
  }, fixture)
}

/** Advance the shared fake clock without restarting the Electron app. */
export async function setIvrNow(page: Page, nowIso: string): Promise<void> {
  await page.evaluate(async (next) => {
    const result = await window.api.testIvrSetNow(next)
    if (!result.ok) throw new Error(result.error ?? 'invalid fake IVR clock')
  }, nowIso)
}

/** Every persisted `iv30_reading` row, ordered by underlying then session. */
export async function readIv30History(page: Page): Promise<Iv30ReadingRow[]> {
  return await page.evaluate(async () => {
    return await window.api.testIv30History()
  })
}

/** Every persisted `iv30_gap` row, ordered by underlying then session. */
export async function readIv30Gaps(page: Page): Promise<Iv30GapRow[]> {
  return await page.evaluate(async () => {
    return await window.api.testIv30Gaps()
  })
}

/** Every daily-bar request the fake has served since the last `setIvSeries`. The only way
 *  to assert a fetch did *not* happen: an absent row proves nothing, since a ticker with
 *  no bar data also writes no reading. */
export async function readDailyBarRequests(page: Page): Promise<DailyBarRequest[]> {
  return await page.evaluate(async () => {
    return await window.api.testDailyBarRequests()
  })
}

/** The distinct underlyings the fake has served bars for since the last `setIvSeries`. */
export async function requestedUnderlyings(page: Page): Promise<string[]> {
  const requests = await readDailyBarRequests(page)
  return [...new Set(requests.map((request) => request.underlying))].sort()
}

/** Re-run the IV30 arithmetic over stored inputs — no market-data request. */
export async function recomputeIvHistory(
  page: Page,
  opts?: { force?: boolean }
): Promise<{ recomputed: number; unrecomputable: number }> {
  return await page.evaluate(async (options) => {
    return await window.api.testIvHistoryRecompute(options)
  }, opts)
}

/** Overwrite one stored reading and stamp it behind every engine version — what a
 *  defective engine would have left behind. */
export async function corruptIv30(
  page: Page,
  payload: { ticker: string; session: string; iv30: string }
): Promise<void> {
  await page.evaluate(async (next) => {
    await window.api.testIv30Corrupt(next)
  }, payload)
}

export async function tableExists(page: Page, name: string): Promise<boolean> {
  return await page.evaluate(async (table) => {
    return await window.api.testTableExists(table)
  }, name)
}

/** The bench detail's IV-rank note — why the selected stock has no usable reading. */
export async function readingNote(page: Page): Promise<{ kind: string | null; text: string }> {
  const note = page.locator('[data-testid="bench-reading-note"]')
  await note.waitFor()
  return {
    kind: await note.getAttribute('data-kind'),
    text: (await note.textContent())?.trim() ?? ''
  }
}

/** Trigger the batch through the production manual-trigger path and unwrap the summary. */
export async function collectIvrNow(page: Page): Promise<IvrBatch> {
  return await page.evaluate(async () => {
    const result = await window.api.ivr.collectNow()
    if (!result.ok) throw new Error(`ivr:collect-now failed: ${JSON.stringify(result)}`)
    return result.batch
  })
}

/** Drive the batch on the *scheduled* trigger, as the after-close timer would. */
export async function collectIvrScheduled(page: Page): Promise<IvrBatch> {
  return await page.evaluate(async () => {
    return await window.api.testSchedulerRunScheduled('ivr-collect')
  })
}

/**
 * Wait until every ticker has persisted IV history — a reading, or a gap for a ticker the
 * fake has no bars for. A ticker's backfill is written in one transaction, so the first
 * row means its whole run has landed.
 *
 * Polled by hand rather than through `expect`: the helper modules here stay free of a
 * test-framework import, the way the rest of e2e/ does.
 */
export async function waitForIvHistory(page: Page, tickers: string[]): Promise<void> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const [readings, gaps] = await Promise.all([readIv30History(page), readIv30Gaps(page)])
    const settled = new Set([...readings, ...gaps].map((row) => row.underlying))
    if (tickers.every((ticker) => settled.has(ticker))) return
    if (Date.now() > deadline) {
      throw new Error(
        `waitForIvHistory timed out: expected IV history for ${tickers.join(', ')}, saw ${
          [...settled].join(', ') || '(none)'
        }`
      )
    }
    await page.waitForTimeout(100)
  }
}

/**
 * Seed the Background's positions and watchlist through the production IPCs, then wait
 * until every seeded ticker's backfill has landed.
 *
 * [US-100] Seeding *triggers* collection, so a scenario that reset the request log
 * immediately after seeding would race the background collections and see them land
 * mid-assertion. Settling first makes the subsequent `setIvSeries` reset meaningful.
 */
export async function seedBenchAndSettle(
  page: Page,
  { positions = [], watchlist = [] }: { positions?: string[]; watchlist?: string[] }
): Promise<void> {
  for (const ticker of positions) await seedActivePosition(page, ticker)
  await seedWatchlist(page, watchlist)
  await waitForIvHistory(page, [...positions, ...watchlist])
}
