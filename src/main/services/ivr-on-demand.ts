// [US-100/US-121] Single-ticker IV-history collection, fired the moment a ticker enters the app.
//
// The scheduled batch runs once a market day, 60 minutes after the close. A ticker added
// at any other time — which is most of the time research actually happens — read `n/a`
// until that window came round. This is the other trigger: the watchlist-add and
// position-open paths hand the ticker here and return immediately.
//
// It deliberately does NOT reuse `collectIvHistoryBatch`: that resolves its targets from
// positions ∪ watchlist, so firing it per add would refetch the whole bench every time.
// Only the per-ticker body (`collectIvHistory`) is shared, and it is idempotent: a ticker
// whose series is already complete is `up_to_date` without a bar request.
import type Database from 'better-sqlite3'
import type { Clock } from '../dates'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { logger as defaultLogger } from '../logger'
import { collectIvHistory, type CollectorLogger, type IvHistoryTickerOutcome } from './iv-history'
import type { IvRunState } from './iv-run-state'
import { ensureTradingCalendar, readTradingCalendar } from './trading-calendar-store'

export type IvrOnDemand = {
  /**
   * Brings one ticker's IV30 series up to date.
   *
   * **Never rejects.** That guarantee is load-bearing, not a courtesy: both callers fire
   * this with `void` after their write has committed, so a rejection would surface as an
   * unhandled rejection and a failing provider would make a perfectly good watchlist add
   * look broken. Every failure is logged, recorded in the run state, and swallowed.
   */
  collect(ticker: string): Promise<void>
}

type CreateIvrOnDemandDeps = {
  db: Database.Database
  /** May throw when market data is unconfigured — that settles the ticker `no_market_data`. */
  getProvider: () => MarketDataProvider
  runState: IvRunState
  clock?: Clock
  logger?: CollectorLogger
  /** Fired once per run, after the run state settles: every settle can change what the card
   *  shows (a reading, a coverage note, a failure), and the bench does not poll. */
  onSettled?: (ticker: string) => void
}

export function createIvrOnDemand({
  db,
  getProvider,
  runState,
  clock = { now: () => new Date() },
  logger = defaultLogger,
  onSettled
}: CreateIvrOnDemandDeps): IvrOnDemand {
  function providerOrNull(ticker: string): MarketDataProvider | null {
    try {
      return getProvider()
    } catch (err) {
      logger.warn({ ticker, err }, 'ivr_on_demand_provider_unavailable')
      return null
    }
  }

  async function run(ticker: string): Promise<IvHistoryTickerOutcome> {
    try {
      const now = clock.now()
      // Awaited, not fired: a fresh install has no calendar to place the sessions on.
      const refresh = await ensureTradingCalendar(db, getProvider, now)
      if (refresh.status === 'no_market_data') return { status: 'no_market_data' }
      const calendar = readTradingCalendar(db, now)
      const provider = providerOrNull(ticker)
      if (provider === null) return { status: 'no_market_data' }

      const outcome = await collectIvHistory({ db, provider, calendar, now, ticker, logger })
      if (outcome.status === 'collected') logger.info({ ticker }, 'ivr_on_demand_collected')
      return outcome
    } catch (err) {
      logger.error({ ticker, err }, 'ivr_on_demand_failed')
      return { status: 'failed' }
    }
  }

  return {
    async collect(rawTicker: string): Promise<void> {
      const ticker = rawTicker.trim().toUpperCase()
      // Synchronously, before the first await: the snapshot the renderer refetches right
      // after `watchlist:add` must already read `pending`.
      runState.markPending(ticker)
      const outcome = await run(ticker)
      runState.settle(ticker, outcome)
      logger.debug({ ticker, status: outcome.status }, 'iv_run_state_settled')
      onSettled?.(ticker)
    }
  }
}
