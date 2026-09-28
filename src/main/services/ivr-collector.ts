// [US-44/US-100/US-121] The `ivr-collect` batch: brings every collection target's IV30 series
// up to date through `collectIvHistory`, isolating one ticker's failure from the rest and
// keeping the in-memory run state in step so the bench can say why a rank is absent.
//
// There is no closed-day guard: a run on a weekend or holiday finds no missing sessions and
// reports every ticker `up_to_date` without a bar request (research.md, "The closed-day guard
// is removed").
import Database from 'better-sqlite3'
import type { Clock } from '../dates'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { logger as defaultLogger } from '../logger'
import { collectIvHistory, type CollectorLogger, type IvHistoryTickerOutcome } from './iv-history'
import type { IvRunState } from './iv-run-state'
import { readTradingCalendar, refreshTradingCalendar } from './trading-calendar-store'

export const IVR_COLLECT_JOB_NAME = 'ivr-collect'

export type CollectIvHistoryBatchResult = {
  successCount: number // tickers with status 'collected'
  errorCount: number // 'failed'
  skippedCount: number // 'up_to_date'
  skippedReason: 'market_data_unavailable' | null
}

type CollectIvHistoryBatchInput = {
  db: Database.Database
  /** Serves the exchange calendar (refreshed before the run reads it) and the daily bars. */
  marketDataProvider: MarketDataProvider
  runState: IvRunState
  logger?: CollectorLogger
  clock?: Clock
  /** Aborts the run at the next ticker boundary — set by the app's before-quit hook so
   *  a watchlist-sized batch does not stall shutdown for the scheduler's drain timeout. */
  signal?: AbortSignal
  /** Fired once when the run ends, however it ends, so an open bench refetches. Once, not
   *  per ticker: each refetch re-runs the screener, whose chain pulls share the rate limit
   *  this run's bar requests need. */
  onCompleted?: () => void
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

const MARKET_DATA_UNAVAILABLE: CollectIvHistoryBatchResult = {
  successCount: 0,
  errorCount: 0,
  skippedCount: 0,
  skippedReason: 'market_data_unavailable'
}

function listCollectionTargets(db: Database.Database): string[] {
  const rows = db.prepare(COLLECTION_TARGETS_QUERY).all() as Array<{ ticker: string }>

  return [...new Set(rows.map((row) => row.ticker.toUpperCase()))].sort((a, b) =>
    a.localeCompare(b)
  )
}

export async function collectIvHistoryBatch(
  input: CollectIvHistoryBatchInput
): Promise<CollectIvHistoryBatchResult> {
  try {
    return await runBatch(input)
  } finally {
    input.onCompleted?.()
  }
}

async function runBatch({
  db,
  marketDataProvider,
  runState,
  logger = defaultLogger,
  clock = DEFAULT_CLOCK,
  signal
}: CollectIvHistoryBatchInput): Promise<CollectIvHistoryBatchResult> {
  const now = clock.now()
  // Best effort, and deliberately before the read: a provider outage must leave the
  // batch to run on whatever is already cached rather than skip it.
  const refresh = await refreshTradingCalendar(db, marketDataProvider, now)
  const calendar = readTradingCalendar(db, now)

  const targets = listCollectionTargets(db)
  logger.debug({ targets }, 'ivr_collection_targets_loaded')

  // No credentials refuse the calendar exactly as they would every bar request, so the run
  // is the same configuration state the per-ticker `no_market_data` abort reports.
  if (refresh.status === 'no_market_data') {
    runState.markNoMarketData(targets)
    logger.info({ targets }, 'ivr_collection_skipped_no_market_data')
    return MARKET_DATA_UNAVAILABLE
  }

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  for (const [index, ticker] of targets.entries()) {
    if (signal?.aborted) {
      logger.info(
        { successCount, errorCount, skippedCount, remaining: targets.length - index },
        'iv_history_collection_aborted'
      )
      break
    }

    runState.markPending(ticker)
    let outcome: IvHistoryTickerOutcome
    // Per-ticker isolation: `collectIvHistory` already turns provider and engine errors into
    // outcomes, and this catch backstops anything else so one ticker cannot lose the rest of
    // the batch. A DB error is systemic (read-only file, bad migration) and is rethrown —
    // downgrading it would report a broken run as "completed with N errors".
    try {
      outcome = await collectIvHistory({
        db,
        provider: marketDataProvider,
        calendar,
        now,
        ticker,
        logger
      })
    } catch (err) {
      if (err instanceof Database.SqliteError) throw err
      // `err`, not `error`: pino's Error serializer is bound to the `err` key.
      logger.warn({ ticker, err }, 'ivr_collection_ticker_failed')
      outcome = { status: 'failed' }
    }
    runState.settle(ticker, outcome)
    logger.debug({ ticker, status: outcome.status }, 'iv_run_state_settled')

    switch (outcome.status) {
      case 'collected':
        successCount++
        break
      case 'up_to_date':
        skippedCount++
        break
      case 'failed':
        errorCount++
        break
      case 'no_market_data':
        // No credentials fail every ticker identically: report a configuration state, not
        // a broken run, and mark every remaining target so its card can say so.
        runState.markNoMarketData(targets.slice(index))
        logger.info({ ticker }, 'ivr_collection_skipped_no_market_data')
        return MARKET_DATA_UNAVAILABLE
    }
  }

  logger.info({ successCount, errorCount, skippedCount }, 'iv_history_collection_completed')

  return {
    successCount,
    errorCount,
    skippedCount,
    skippedReason: null
  }
}
