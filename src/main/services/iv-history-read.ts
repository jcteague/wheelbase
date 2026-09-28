// [US-121] The IV-metrics read path: rank, percentile and 52-week range derived from the stored
// IV30 series. Synchronous and provider-free by construction — this module imports no
// market-data port, so reading IV metrics cannot make a market-data request.
//
// Rules: data-model.md §3 (readIvMetricsByUnderlying).
import type Database from 'better-sqlite3'
import { RANK_WINDOW_SESSIONS, computeIvMetrics } from '../core/iv-metrics'
import type { IvRankReading } from '../core/ivr-freshness'
import type { TradingCalendar } from '../core/trading-calendar'
import { logger } from '../logger'
import { hasAnyGap, selectAnchor, selectReadingsBetween } from './iv-history-store'

/** What the series can say for a ticker: a publishable reading, rows that do not clear the
 *  coverage gate (with how many window sessions they cover), or nothing at all. */
export type IvMetricsRead =
  | { status: 'reading'; reading: IvRankReading }
  | { status: 'insufficient'; coverage: number }
  | { status: 'none' }

function readIvMetrics(
  db: Database.Database,
  ticker: string,
  sessionDates: readonly string[]
): IvMetricsRead {
  const anchor = selectAnchor(db, ticker)
  // Gaps without a reading are a collected history with zero coverage, not an uncollected one.
  if (anchor === undefined) {
    return hasAnyGap(db, ticker) ? { status: 'insufficient', coverage: 0 } : { status: 'none' }
  }

  // The window is the 252 sessions strictly before the anchor. When the calendar holds fewer,
  // coverage is still judged against 252: an unknown session counts as missing.
  const windowSessions = sessionDates
    .filter((session) => session < anchor.session)
    .slice(-RANK_WINDOW_SESSIONS)
  const readings = selectReadingsBetween(
    db,
    ticker,
    windowSessions[0] ?? anchor.session,
    anchor.session
  )
  const metrics = computeIvMetrics({ anchorIv30: anchor.iv30, windowSessions, readings })
  if (metrics === null) {
    return {
      status: 'insufficient',
      coverage: windowSessions.filter((session) => readings.has(session)).length
    }
  }
  return {
    status: 'reading',
    reading: {
      value: metrics.rank === null ? null : String(metrics.rank),
      percentile: String(metrics.percentile),
      low: metrics.low,
      high: metrics.high,
      observedAt: anchor.observed_at
    }
  }
}

/** Synchronous and provider-free: the read path never makes a market-data request. */
export function readIvMetricsByUnderlying(
  db: Database.Database,
  tickers: string[],
  calendar: TradingCalendar
): Map<string, IvMetricsRead> {
  const sessionDates = calendar.sessions.map((session) => session.date)
  const reads = new Map(
    tickers.map((raw): [string, IvMetricsRead] => {
      const ticker = raw.toUpperCase()
      return [ticker, readIvMetrics(db, ticker, sessionDates)]
    })
  )
  logger.debug(
    {
      tickers,
      statuses: Object.fromEntries([...reads].map(([ticker, read]) => [ticker, read.status]))
    },
    'iv_metrics_read'
  )
  return reads
}
