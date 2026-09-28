// [US-65/US-121] iv-rank-lookup — the IV-rank read path. Reads the stored IV30 series
// (`iv-history-read.ts`), assesses the reading for freshness, and — when there is no
// publishable reading — says why. Never writes, never calls a provider.
import type Database from 'better-sqlite3'
import { MIN_WINDOW_COVERAGE, RANK_WINDOW_SESSIONS } from '../core/iv-metrics'
import { assessIvRank, type AssessedIvRank } from '../core/ivr-freshness'
import type { TradingCalendar } from '../core/trading-calendar'
import { logger } from '../logger'
import { readIvMetricsByUnderlying, type IvMetricsRead } from './iv-history-read'
import type { IvRunState, IvRunStatus } from './iv-run-state'

/** Why a ticker has no IV rank. Display-only: the verdict and the screener floor never read it. */
export type IvRankAbsence =
  | { reason: 'pending' | 'no_market_data' | 'failed' | 'not_collected' }
  | { reason: 'insufficient_history'; coverage: number; window: number; required: number }

/** One ticker's lookup, under the field names a row carries over IPC: exactly one of
 *  `ivRank` / `ivRankAbsence` is non-null. */
export type IvRankPair =
  | { ivRank: AssessedIvRank; ivRankAbsence: null }
  | { ivRank: null; ivRankAbsence: IvRankAbsence }

const NOT_COLLECTED: IvRankPair = { ivRank: null, ivRankAbsence: { reason: 'not_collected' } }

/** A ticker's lookup from `readIvRankLookup`'s result. A ticker the read said nothing about
 *  has, by definition, not been collected. */
export function lookupOf(lookups: ReadonlyMap<string, IvRankPair>, ticker: string): IvRankPair {
  return lookups.get(ticker.trim().toUpperCase()) ?? NOT_COLLECTED
}

export type IvRankLookupOptions = {
  now: Date
  lastEarnings: ReadonlyMap<string, string | null | undefined>
  calendar: TradingCalendar
  runState: IvRunState
}

/**
 * Precedence when no reading is published: pending > no_market_data > failed >
 * insufficient_history > not_collected. A run status is process state and outranks anything
 * the stored series says; coverage is derived from the series.
 */
export function absenceFor(
  runStatus: IvRunStatus | undefined,
  read: Exclude<IvMetricsRead, { status: 'reading' }>
): IvRankAbsence {
  if (runStatus !== undefined) return { reason: runStatus }
  if (read.status === 'insufficient') {
    return {
      reason: 'insufficient_history',
      coverage: read.coverage,
      window: RANK_WINDOW_SESSIONS,
      required: MIN_WINDOW_COVERAGE
    }
  }
  return { reason: 'not_collected' }
}

/**
 * One ticker's lookup. A published reading wins over any run status — a catch-up in flight
 * does not hide a rank. A reading we hold but cannot assess (a corrupt value, or a calendar
 * that cannot reach the anchor) is logged rather than passed through as a silent absence,
 * then reported as `not_collected`.
 */
function lookupFor(
  ticker: string,
  read: IvMetricsRead,
  { now, lastEarnings, calendar, runState }: IvRankLookupOptions
): IvRankPair {
  if (read.status !== 'reading') {
    return { ivRank: null, ivRankAbsence: absenceFor(runState.get(ticker), read) }
  }

  const assessment = assessIvRank(read.reading, {
    now,
    calendar,
    lastEarnings: lastEarnings.get(ticker)
  })
  if (assessment.status === 'assessed') return { ivRank: assessment.reading, ivRankAbsence: null }

  logger.warn({ ticker, reading: read.reading }, 'ivr_assessment_unreadable_reading')
  return { ivRank: null, ivRankAbsence: absenceFor(runState.get(ticker), { status: 'none' }) }
}

/**
 * The IV rank, or the reason for its absence, per requested ticker (keyed upper-cased).
 * Assessment is kept here at the service boundary so the core remains pure and no
 * screener/watchlist caller can trigger a provider or earnings request per row.
 */
export function readIvRankLookup(
  db: Database.Database,
  underlyings: string[],
  opts: IvRankLookupOptions
): Map<string, IvRankPair> {
  const tickers = [...new Set(underlyings.map((ticker) => ticker.trim().toUpperCase()))]
  if (tickers.length === 0) return new Map()

  const reads = readSeriesOrEmpty(db, tickers, opts.calendar)

  return new Map(
    tickers.map((ticker): [string, IvRankPair] => [
      ticker,
      lookupFor(ticker, reads.get(ticker) ?? { status: 'none' }, opts)
    ])
  )
}

/** The series read degrades to "unknown for everyone": IV rank is display-only here, so
 *  losing it must not cost the caller its whole batch. */
function readSeriesOrEmpty(
  db: Database.Database,
  tickers: string[],
  calendar: TradingCalendar
): Map<string, IvMetricsRead> {
  try {
    return readIvMetricsByUnderlying(db, tickers, calendar)
  } catch (err) {
    logger.warn({ err, tickers }, 'ivr_assessment_series_read_failed')
    return new Map()
  }
}
