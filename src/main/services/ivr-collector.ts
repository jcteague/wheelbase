import Database from 'better-sqlite3'
import { addDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { Logger } from 'pino'
import { fetchIVR, type IVRResult } from '../integrations/barchart-ivr-scraper'
import {
  etDateOf,
  getMostRecentCompletedSession,
  getTradingSession,
  observationWindowOf,
  type TradingCalendar
} from '../core/trading-calendar'
import type { MarketCalendarSource } from '../integrations/market-data-provider'
import { readTradingCalendar, refreshTradingCalendar } from './trading-calendar-store'
import { logger as defaultLogger } from '../logger'

export const IVR_COLLECT_JOB_NAME = 'ivr-collect'

export type CollectIVRSnapshotsResult = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_closed' | null
}

type Clock = {
  now(): Date
}

type CollectorLogger = Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>

/** What one ticker's turn produced. `failed` covers both a scraper error result and a
 *  thrown fetch — the caller tallies them the same way and neither aborts the batch. */
export type TickerOutcome = 'persisted' | 'not_available' | 'failed'

type CollectTickerInput = {
  db: Database.Database
  logger: CollectorLogger
  fetchIvr: (ticker: string) => Promise<IVRResult>
  calendar: TradingCalendar
  ticker: string
}

type CollectIVRSnapshotsInput = {
  db: Database.Database
  logger?: CollectorLogger
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: Clock
  /** Refreshes the cached exchange calendar before the run reads it. The market-data
   *  factory always constructs, so in the app this is always supplied; absence is a
   *  test shape, and the run then uses whatever is already cached. */
  marketDataProvider?: MarketCalendarSource
  /** Aborts the run at the next ticker boundary — set by the app's before-quit hook so
   *  a watchlist-sized batch does not stall shutdown for the scheduler's drain timeout. */
  signal?: AbortSignal
  /** Who asked. The non-trading-day guard exists to avoid pointless *scheduled* fetches;
   *  a person clicking refresh, or adding a ticker, has stated their intent and Barchart
   *  serves the last close whenever it is asked. */
  trigger?: 'scheduled' | 'explicit'
}

const COLLECTION_TARGETS_QUERY = `
  SELECT ticker
  FROM positions
  WHERE status != 'CLOSED'
  UNION
  SELECT ticker
  FROM watchlist
`

const DEFAULT_CLOCK: Clock = {
  now: () => new Date()
}

function listCollectionTargets(db: Database.Database): string[] {
  const rows = db.prepare(COLLECTION_TARGETS_QUERY).all() as Array<{ ticker: string }>

  return [...new Set(rows.map((row) => row.ticker.toUpperCase()))].sort((a, b) =>
    a.localeCompare(b)
  )
}

/** The fallback dedupe window for a reading the calendar cannot place: the UTC day the
 *  fetch happened on. Only reachable on an install whose calendar has never been
 *  fetched — a stamped reading uses its session's window instead. */
function utcDayBounds(isoTimestamp: string): { start: string; end: string } {
  const observedAt = parseISO(isoTimestamp)
  const dayStart = new Date(
    Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), observedAt.getUTCDate())
  )

  return {
    start: dayStart.toISOString(),
    end: addDays(dayStart, 1).toISOString()
  }
}

/**
 * Writes the reading against the session it reflects, not the instant it was fetched.
 * Barchart serves the last close, so a Saturday and a Sunday scrape are the same
 * observation; stamping both at Friday's close is what keeps `ivr_snapshot` to one row
 * per underlying per session and keeps US-98's age-in-sessions honest.
 */
function persistSnapshot(
  db: Database.Database,
  logger: CollectorLogger,
  calendar: TradingCalendar,
  result: Extract<IVRResult, { status: 'ok' }>
): void {
  const { ticker, observedAt } = result.data
  const session = getMostRecentCompletedSession(calendar, parseISO(observedAt))
  const window = session === null ? null : observationWindowOf(calendar, session)

  if (window === null) {
    logger.warn({ ticker, observedAt }, 'ivr_observation_unstamped')
  }

  // The row goes in at the lower bound of the window it was just cleared from, so the
  // stamp and the dedupe range cannot drift apart. An open-ended window (the newest
  // session the calendar holds) has no upper bound, and the SQL skips that half.
  const { start, end } =
    window === null ? utcDayBounds(observedAt) : { start: window.from, end: window.to }
  const stamp = window?.from ?? observedAt

  const deleteExisting = db.prepare(
    `DELETE FROM ivr_snapshot
     WHERE underlying = ?
       AND observed_at >= ?
       AND (? IS NULL OR observed_at < ?)`
  )
  const insertSnapshot = db.prepare(
    `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  db.transaction(() => {
    deleteExisting.run(ticker, start, end, end)
    insertSnapshot.run(
      ticker,
      stamp,
      new Decimal(result.data.ivr).toFixed(1),
      result.data.ivp === undefined ? null : new Decimal(result.data.ivp).toFixed(1),
      result.data.iv30 === undefined ? null : new Decimal(result.data.iv30).toString(),
      result.data.source
    )
  })()
  logger.debug({ ticker, stamp }, 'ivr_snapshot_persisted')
}

/**
 * One ticker's turn: fetch, classify, and persist a reading. Shared by the scheduled
 * batch and the on-add single-ticker path so neither can drift from the other.
 *
 * Per-ticker isolation is mandatory for the fetch: `fetchIvr` rejects on a non-JSON
 * response body, and an unguarded throw would abort a batch and lose every ticker after
 * the offending one. `persistSnapshot` stays OUTSIDE the try on purpose — a DB write
 * failing is systemic (read-only file, bad migration), and downgrading it to a
 * per-ticker warn would report a broken run as "completed with N errors".
 */
export async function collectTicker({
  db,
  logger,
  fetchIvr,
  calendar,
  ticker
}: CollectTickerInput): Promise<TickerOutcome> {
  let result: IVRResult
  try {
    result = await fetchIvr(ticker)
  } catch (err) {
    // `err`, not `error`: pino's Error serializer is bound to the `err` key.
    logger.warn({ ticker, err }, 'IVR collection threw for ticker')
    return 'failed'
  }

  switch (result.status) {
    case 'ok':
      persistSnapshot(db, logger, calendar, result)
      return 'persisted'
    case 'not_available':
      logger.info({ ticker }, 'ticker not covered by Barchart IVR')
      return 'not_available'
    case 'parse_error':
    case 'network_error':
    case 'rate_limited':
    case 'invalid_input':
      logger.warn({ ticker, error: result.error }, 'IVR collection failed for ticker')
      return 'failed'
  }
}

export async function collectIVRSnapshots({
  db,
  logger = defaultLogger,
  fetchIvr = fetchIVR,
  clock = DEFAULT_CLOCK,
  marketDataProvider,
  signal,
  trigger = 'scheduled'
}: CollectIVRSnapshotsInput): Promise<CollectIVRSnapshotsResult> {
  const now = clock.now()
  // Best effort, and deliberately before the read: a provider outage must leave the
  // batch to run on whatever is already cached rather than skip it.
  if (marketDataProvider !== undefined) {
    await refreshTradingCalendar(db, marketDataProvider, now)
  }

  const etDate = etDateOf(now)
  const calendar = readTradingCalendar(db, now)
  const session = getTradingSession(calendar, etDate)
  logger.debug({ etDate, calendarStatus: session.status }, 'ivr_collection_calendar_verdict')

  if (session.status === 'unavailable') {
    logger.warn({ etDate }, 'IVR collection calendar coverage unavailable; continuing best effort')
  }

  if (session.status === 'closed') {
    if (trigger === 'scheduled') {
      logger.info({ etDate }, 'Skipping IVR collection because market is closed')
      return {
        successCount: 0,
        errorCount: 0,
        skippedCount: 0,
        skippedReason: 'market_closed'
      }
    }
    logger.info(
      { etDate, trigger },
      'IVR collection proceeding on a closed day at explicit request'
    )
  }

  const underlyings = listCollectionTargets(db)
  logger.debug({ underlyings }, 'ivr_collection_targets_loaded')

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  // Request pacing is the scraper's job: `fetchIVR` awaits its own 1 req/s rate
  // limiter before every Barchart call, so the loop adds no sleep of its own.
  for (const ticker of underlyings) {
    if (signal?.aborted) {
      logger.info(
        { successCount, errorCount, skippedCount, remaining: underlyings.length },
        'IVR snapshot collection aborted before completion'
      )
      break
    }

    switch (await collectTicker({ db, logger, fetchIvr, calendar, ticker })) {
      case 'persisted':
        successCount++
        break
      case 'not_available':
        skippedCount++
        break
      case 'failed':
        errorCount++
        break
    }
  }

  logger.info({ successCount, errorCount, skippedCount }, 'IVR snapshot collection completed')

  return {
    successCount,
    errorCount,
    skippedCount,
    skippedReason: null
  }
}
