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
import { localDate } from './dates'

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
    withoutBrokerCredentials: opts.withoutBrokerCredentials
  })
  // Presence (not value) switches the ivr-collect handler to the injected fake
  // fetcher; per-ticker outcomes are set later via _test:ivr-set-outcomes.
  env.WHEELBASE_FAKE_IVR = '{}'
  if (opts.fakeNow) env.WHEELBASE_FAKE_NOW = opts.fakeNow
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

/** Add each ticker through the production watchlist IPC — never a direct DB write.
 *  [US-68] A ticker's note is seeded the same way, since promote reads it back out. */
export async function seedWatchlist(
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
  testIvrSetOutcomes: (outcomes: Record<string, IvrOutcome>) => Promise<{ ok: boolean }>
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
