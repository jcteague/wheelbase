// [US-100] Single-ticker IVR collection, fired the moment a ticker enters the app.
//
// The scheduled batch runs once a market day, 60 minutes after the close. A ticker added
// at any other time — which is most of the time research actually happens — read `n/a`
// until that window came round. This is the other trigger: the watchlist-add and
// position-open paths hand the ticker here and return immediately.
//
// It deliberately does NOT reuse `collectIVRSnapshots`: that resolves its targets from
// positions ∪ watchlist, so firing it per add would refetch the whole bench every time.
// Only the per-ticker body (`collectTicker`) is shared.
import type Database from 'better-sqlite3'
import { parseISO } from 'date-fns'
import type { Logger } from 'pino'
import { etDateOf, getMostRecentCompletedSession } from '../core/trading-calendar'
import { fetchIVR, type IVRResult } from '../integrations/barchart-ivr-scraper'
import type { MarketCalendarSource } from '../integrations/market-data-provider'
import { logger as defaultLogger } from '../logger'
import { collectTicker } from './ivr-collector'
import { getLatestIvrByUnderlying } from './ivr-snapshots'
import { ensureTradingCalendar, readTradingCalendar } from './trading-calendar-store'

export type IvrOnDemand = {
  /**
   * Collects one ticker unless it already has a reading for the current trading day.
   *
   * **Never rejects.** That guarantee is load-bearing, not a courtesy: both callers fire
   * this with `void` after their write has committed, so a rejection would surface as an
   * unhandled rejection and a failing Barchart would make a perfectly good watchlist add
   * look broken. Every failure is logged and swallowed instead.
   */
  collect(ticker: string): Promise<void>
}

type CreateIvrOnDemandDeps = {
  db: Database.Database
  /** May throw when market data is unconfigured — `ensureTradingCalendar` guards it. */
  getProvider: () => MarketCalendarSource
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: { now(): Date }
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
  /** Fired only when a row was actually written, so the renderer refetches exactly once. */
  onCollected?: (ticker: string) => void
}

export function createIvrOnDemand({
  db,
  getProvider,
  fetchIvr = fetchIVR,
  clock = { now: () => new Date() },
  logger = defaultLogger,
  onCollected
}: CreateIvrOnDemandDeps): IvrOnDemand {
  return {
    async collect(rawTicker: string): Promise<void> {
      const ticker = rawTicker.trim().toUpperCase()
      try {
        const now = clock.now()
        // Awaited, not fired: an install whose calendar has never been fetched would
        // otherwise stamp the reading at the raw fetch instant, and US-98 would assess
        // it as unreadable — the reading would exist and still render `n/a`.
        await ensureTradingCalendar(db, getProvider, now)
        const calendar = readTradingCalendar(db, now)
        const currentSession = getMostRecentCompletedSession(calendar, now)

        function belongsToCurrentSession(observedAt: string): boolean {
          const observed = parseISO(observedAt)
          // With no calendar there is no session to compare, so the honest fallback is
          // the Eastern calendar day — coarser, but it still stops a same-evening
          // re-add from refetching.
          return currentSession === null
            ? etDateOf(observed) === etDateOf(now)
            : getMostRecentCompletedSession(calendar, observed)?.date === currentSession.date
        }

        const latest = getLatestIvrByUnderlying(db, [ticker]).get(ticker)
        if (latest !== undefined && belongsToCurrentSession(latest.observedAt)) {
          logger.debug({ ticker }, 'ivr_on_demand_already_collected')
          return
        }

        if ((await collectTicker({ db, logger, fetchIvr, calendar, ticker })) === 'persisted') {
          logger.info({ ticker }, 'ivr_on_demand_collected')
          onCollected?.(ticker)
        }
      } catch (err) {
        logger.error({ ticker, err }, 'ivr_on_demand_failed')
      }
    }
  }
}
