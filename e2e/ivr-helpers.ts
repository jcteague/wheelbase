// Shared helpers for the US-44 IVR collector e2e spec.
//
// The e2e suite must stay offline: the real `ivr-collect` job handler normally
// calls the live Barchart scraper. To exercise it deterministically we boot the
// app with WHEELBASE_FAKE_IVR set, which makes the main process inject a fake
// `fetchIvr` + instant clock into `collectIVRSnapshots`. Per-ticker outcomes are
// programmed at runtime through the dev-only `_test:ivr-*` IPC channels (guarded
// by NODE_ENV === 'test'), and persisted rows are read back the same way.
import type { ElectronApplication, Page } from 'playwright'
import {
  REGULAR_SESSION,
  buildLaunchEnv,
  launchElectron,
  seedCsp,
  type CspFixture,
  type MarketStatusFixture
} from './assignment-helpers'
import { addDays, format, isWeekend } from 'date-fns'
import { localDate } from './dates'

/**
 * The Eastern calendar day the offline fixtures are built around: the most recent
 * weekday on or before today.
 *
 * Derived rather than pinned. The screener runs on this fake clock while position
 * creation validates expirations against the real one, so a fixed base guarantees a
 * date on which every promoted-expiration fixture turns into a past date and the
 * promote specs start failing — a deadline baked into the suite. Anchoring to the real
 * date keeps the two clocks in step for good.
 */
export const FAKE_NOW_DAY = mostRecentWeekday()

/** 21:00Z on that day: 17:00 EDT or 16:00 EST, either way at or after the 16:00 ET
 *  close, so the session counts as complete and the collector runs. */
export const DEFAULT_FAKE_NOW = `${FAKE_NOW_DAY}T21:00:00.000Z`

/** An instant on the fixture day, for quote and observation stamps that must read as
 *  same-session rather than stale. */
export function fakeNowAt(time: string): string {
  return `${FAKE_NOW_DAY}T${time}`
}

function mostRecentWeekday(): string {
  let day = new Date()
  while (isWeekend(day)) day = addDays(day, -1)
  return format(day, 'yyyy-MM-dd')
}

/** Subset of the scraper's IVRResult union that the e2e tests program. */
export type IvrOutcome =
  | {
      status: 'ok'
      data: {
        ticker: string
        ivr: number
        ivp?: number
        iv30?: number
        observedAt: string
        source: 'barchart'
      }
    }
  | { status: 'not_available'; error: { code: 'TICKER_NOT_COVERED'; message: string } }
  | { status: 'parse_error'; error: { code: 'PARSE_FAILED'; message: string; rawSnippet: string } }
  | { status: 'network_error'; error: { code: 'NETWORK_FAILURE'; message: string } }

export function okOutcome(
  ticker: string,
  opts: { ivr: number; ivp?: number; iv30?: number; observedAt: string }
): IvrOutcome {
  return { status: 'ok', data: { ticker, source: 'barchart', ...opts } }
}

export function notAvailableOutcome(ticker: string): IvrOutcome {
  return {
    status: 'not_available',
    error: { code: 'TICKER_NOT_COVERED', message: `Barchart has no options data for ${ticker}` }
  }
}

/** Mirrors `makeNetworkError` in `barchart-ivr-scraper.ts` — what an unreachable
 *  Barchart looks like to the collector. */
export function networkErrorOutcome(ticker: string): IvrOutcome {
  return {
    status: 'network_error',
    error: { code: 'NETWORK_FAILURE', message: `Barchart unreachable for ${ticker}` }
  }
}

export function parseErrorOutcome(): IvrOutcome {
  return {
    status: 'parse_error',
    error: { code: 'PARSE_FAILED', message: 'Expected impliedVolatilityRank1y', rawSnippet: '{}' }
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
  // Presence (not value) switches the ivr-collect handler to the injected fake
  // fetcher; per-ticker outcomes are set later via _test:ivr-set-outcomes.
  env.WHEELBASE_FAKE_IVR = '{}'
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

export type IvrSnapshotRow = {
  underlying: string
  observed_at: string
  ivr: string
  ivp: string | null
  iv30: string | null
  source: string
}

export type IvrBatch = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_closed' | null
}

type IvrTestApi = {
  testIvrSnapshots: () => Promise<IvrSnapshotRow[]>
  testIvrFetchLog: () => Promise<string[]>
  testSchedulerRunScheduled: (jobName: string) => Promise<IvrBatch>
  testIvrSetOutcomes: (outcomes: Record<string, IvrOutcome>) => Promise<{ ok: boolean }>
  testIvrSetNow: (nowIso: string) => Promise<{ ok: boolean; error?: string }>
  testTradingSessionCount: () => Promise<number>
  testMarketCalendarFetchCount: () => Promise<number>
}

/** [US-116] How many rows the cached exchange calendar holds. Zero means it has never
 *  been fetched — the fresh-install state the bench is supposed to resolve by itself. */
export async function tradingSessionCount(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrTestApi
    return await api.testTradingSessionCount()
  })
}

/** [US-116] How many calendar fetches the fake provider has served. The refresh throttle
 *  lives in the store, so a skipped fetch is otherwise indistinguishable from a made one. */
export async function marketCalendarFetches(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrTestApi
    return await api.testMarketCalendarFetchCount()
  })
}

type IvrApi = { ivr: { collectNow: () => Promise<unknown> } }

/** Program the fake scraper's per-ticker outcomes for the next collector run. */
export async function setIvrOutcomes(
  page: Page,
  outcomes: Record<string, IvrOutcome>
): Promise<void> {
  await page.evaluate(async (next) => {
    const api = window.api as unknown as IvrTestApi
    await api.testIvrSetOutcomes(next)
  }, outcomes)
}

/** Advance the shared fake clock without restarting the Electron app. */
export async function setIvrNow(page: Page, nowIso: string): Promise<void> {
  await page.evaluate(async (next) => {
    const api = window.api as unknown as IvrTestApi
    const result = await api.testIvrSetNow(next)
    if (!result.ok) throw new Error(result.error ?? 'invalid fake IVR clock')
  }, nowIso)
}

/** Read every persisted ivr_snapshot row, ordered by underlying. */
export async function readIvrSnapshots(page: Page): Promise<IvrSnapshotRow[]> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrTestApi
    return await api.testIvrSnapshots()
  })
}

/** Trigger the batch through the production manual-trigger path and unwrap the summary. */
export async function collectIvrNow(page: Page): Promise<IvrBatch> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrApi
    const result = (await api.ivr.collectNow()) as
      | { ok: true; batch: IvrBatch }
      | { ok: false; errors: unknown[] }
    if (!result.ok) throw new Error(`ivr:collect-now failed: ${JSON.stringify(result)}`)
    return result.batch
  })
}

/** Every ticker the fake scraper has been asked for since the last `setIvrOutcomes`.
 *  The only way to assert a fetch did *not* happen: an absent row proves nothing, since
 *  a fetch that returned `not_available` also writes none. */
export async function readIvrFetchLog(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrTestApi
    return await api.testIvrFetchLog()
  })
}

/** Drive the batch on the *scheduled* trigger, as the after-close timer would.
 *  `collectIvrNow` drives the explicit one and would pass for the wrong reason. */
export async function collectIvrScheduled(page: Page): Promise<IvrBatch> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as IvrTestApi
    return await api.testSchedulerRunScheduled('ivr-collect')
  })
}

/**
 * Seed the Background's positions and watchlist through the production IPCs, then wait
 * until every seeded ticker has been fetched.
 *
 * [US-100] Seeding now *triggers* collection, so a scenario that reset the fetch log
 * immediately after seeding would race the background collections and see them land
 * mid-assertion. Settling first makes the subsequent `setIvrOutcomes` reset meaningful.
 */
export async function seedBenchAndSettle(
  page: Page,
  { positions = [], watchlist = [] }: { positions?: string[]; watchlist?: string[] }
): Promise<void> {
  for (const ticker of positions) await seedActivePosition(page, ticker)
  await seedWatchlist(page, watchlist)

  const seeded = [...positions, ...watchlist]
  if (seeded.length === 0) return

  // Polled by hand rather than through `expect`: the helper modules here stay free of a
  // test-framework import, the way the rest of e2e/ does.
  const deadline = Date.now() + 15_000
  for (;;) {
    const log = await readIvrFetchLog(page)
    if (seeded.every((ticker) => log.includes(ticker))) return
    if (Date.now() > deadline) {
      throw new Error(
        `seedBenchAndSettle timed out: expected ${seeded.join(', ')} in the fetch log, saw ${
          log.join(', ') || '(empty)'
        }`
      )
    }
    await page.waitForTimeout(100)
  }
}
