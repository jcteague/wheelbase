// Service layer — alert evaluation orchestration. Loads evaluable positions,
// runs the pure rule engine over each, and persists the resulting alert set
// atomically (upsert open matches + resolve cleared conditions).
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import {
  DEFAULT_MANAGEMENT_WINDOW_DTE,
  evaluatePosition,
  type AlertEvaluationInput,
  type AlertMatch
} from '../core/alerts'
import { DEFAULT_PROFIT_TARGET_PERCENT } from '../core/profit-target'
import { computeDte } from '../core/dte'
import type { WheelPhase } from '../core/types'
import { fetchNextEarningsDates } from '../integrations/finnhub-earnings'
import { marketDataFactory } from '../integrations/market-data-factory'
import type { MarketDataProvider, OptionSnapshot } from '../integrations/market-data-provider'
import { logger as defaultLogger, type LoggerLike } from '../logger'
import type { EvaluateAlertsResult } from '../schemas'
import { buildOccSymbol } from '../../shared/option-symbol'
import { activeLegSubquery } from './active-leg-sql'
import { alertKey, clearStaleDismissals, resolveAlertsNotIn, upsertOpenAlert } from './alerts'
import { fetchOptionSnapshots, fetchStockQuotes, type IpcStockQuote } from './market-data'

export const ALERT_EVAL_JOB_NAME = 'alert-evaluation'

// ---------------------------------------------------------------------------
// Evaluable-position selection — positions with an active short option leg.
// An inner JOIN on the phase-aware active-leg subquery drops positions with no
// open option leg (e.g. HOLDING_SHARES without a covered call).
// ---------------------------------------------------------------------------

interface EvaluableRow {
  position_id: string
  ticker: string
  phase: WheelPhase
  profit_target_percent: number | null
  management_window_dte_override: number | null
  instrument_type: 'PUT' | 'CALL' | 'STOCK' | null
  strike: string | null
  expiration: string | null
  premium_per_contract: string | null
  contracts: number | null
}

const EVALUABLE_QUERY = `
  SELECT
    p.id   AS position_id,
    p.ticker,
    p.phase,
    p.profit_target_percent,
    p.management_window_dte_override,
    l.instrument_type,
    l.strike,
    l.expiration,
    l.premium_per_contract,
    l.contracts
  FROM positions p
  JOIN legs l ON l.id = (
    ${activeLegSubquery()}
  )
  WHERE p.status = 'ACTIVE'
    AND p.phase IN ('CSP_OPEN', 'CC_OPEN')
`

/** OCC symbol for a row's active option leg, or null when it isn't an option or
 *  the leg data can't form a valid symbol (logged, never thrown — so one bad
 *  leg can't abort the whole batch or suppress its OCC-independent DTE rules). */
function occSymbolForRow(row: EvaluableRow, logger: LoggerLike): string | null {
  if (
    row.instrument_type === null ||
    row.instrument_type === 'STOCK' ||
    row.strike === null ||
    !row.expiration
  ) {
    return null
  }
  try {
    return buildOccSymbol({
      ticker: row.ticker,
      expiration: row.expiration,
      strike: row.strike,
      instrumentType: row.instrument_type
    })
  } catch (error) {
    logger.warn({ positionId: row.position_id, error }, 'alert_evaluation_occ_symbol_invalid')
    return null
  }
}

interface ToEvaluationInputParams {
  row: EvaluableRow
  now: Date
  managementWindowDte: number
  profitTargetPercentDefault: number
  occ: string | null
  priceByTicker: Record<string, IpcStockQuote>
  midByOccSymbol: Record<string, OptionSnapshot>
  earningsDateByTicker: Record<string, string>
}

function toEvaluationInput({
  row,
  now,
  managementWindowDte,
  profitTargetPercentDefault,
  occ,
  priceByTicker,
  midByOccSymbol,
  earningsDateByTicker
}: ToEvaluationInputParams): AlertEvaluationInput {
  return {
    positionId: row.position_id,
    phase: row.phase,
    instrumentType: row.instrument_type === 'STOCK' ? null : row.instrument_type,
    strike: row.strike,
    dte: computeDte(row.expiration, now),
    managementWindowDte,
    managementWindowDteOverride: row.management_window_dte_override,
    entryPremiumPerContract: row.premium_per_contract,
    contracts: row.contracts,
    currentOptionMid: occ ? (midByOccSymbol[occ]?.mid ?? null) : null,
    profitTargetPercentOverride: row.profit_target_percent,
    profitTargetPercentDefault,
    currentUnderlyingPrice: priceByTicker[row.ticker]?.price ?? null,
    daysToEarnings: computeDte(earningsDateByTicker[row.ticker] ?? null, now),
    expiration: row.expiration
  }
}

/** Injection seam for the earnings feed (defaults to the real Finnhub batch). */
export type FetchEarnings = (
  tickers: string[],
  opts?: { now?: Date; logger?: LoggerLike }
) => Promise<Record<string, string>>

type EvaluateAlertsInput = {
  db: Database.Database
  provider?: MarketDataProvider
  now?: Date
  managementWindowDte?: number
  profitTargetPercentDefault?: number
  logger?: LoggerLike
  fetchEarnings?: FetchEarnings
}

/** Runs a market-data fetch, degrading to `fallback` (with a WARN) on failure so
 *  a provider outage can't abort the market-data-independent DTE rules. */
async function fetchOrDegrade<T>(
  fetchFn: () => Promise<T>,
  fallback: T,
  logger: LoggerLike,
  event: string
): Promise<T> {
  try {
    return await fetchFn()
  } catch (error) {
    logger.warn({ error }, event)
    return fallback
  }
}

export async function evaluateAlerts({
  db,
  provider = marketDataFactory.create(),
  now = new Date(),
  managementWindowDte = DEFAULT_MANAGEMENT_WINDOW_DTE,
  profitTargetPercentDefault = DEFAULT_PROFIT_TARGET_PERCENT,
  logger = defaultLogger,
  fetchEarnings = fetchNextEarningsDates
}: EvaluateAlertsInput): Promise<EvaluateAlertsResult> {
  const nowIso = now.toISOString()
  logger.debug({ now: nowIso, managementWindowDte }, 'alert_evaluation_start')

  const rows = db.prepare(EVALUABLE_QUERY).all() as EvaluableRow[]
  logger.debug({ count: rows.length }, 'alert_evaluation_targets_loaded')

  // Build each row's OCC symbol once (non-throwing) so a single malformed leg
  // can't abort the batch when collecting the symbol set below or mapping inputs.
  const occByPositionId = new Map(
    rows.map((row) => [row.position_id, occSymbolForRow(row, logger)])
  )

  // Pre-fetch live market data once for the whole batch (US-54/US-55/US-56).
  // All three feeds run concurrently and each degrades to empty on failure, so a
  // provider outage still lets the DTE rules evaluate. Awaited before the persist
  // transaction, so US-50 write atomicity is unchanged.
  const tickers = [...new Set(rows.map((row) => row.ticker))]
  const symbols = [...new Set([...occByPositionId.values()].filter((s): s is string => s !== null))]
  const [priceByTicker, { snapshots: midByOccSymbol }, earningsDateByTicker] = await Promise.all([
    fetchOrDegrade(
      () => fetchStockQuotes(provider, tickers),
      {} as Record<string, IpcStockQuote>,
      logger,
      'alert_evaluation_stock_quotes_unavailable'
    ),
    fetchOrDegrade(
      () => fetchOptionSnapshots(provider, symbols),
      { snapshots: {}, unavailable: true },
      logger,
      'alert_evaluation_option_snapshots_unavailable'
    ),
    fetchOrDegrade(
      () => fetchEarnings(tickers, { now, logger }),
      {} as Record<string, string>,
      logger,
      'alert_evaluation_earnings_unavailable'
    )
  ])

  // Compute phase — pure, per-position, isolated so one failure can't abort
  // the others or leave partial writes (persistence happens in one transaction).
  const matches: Array<{ positionId: string; match: AlertMatch }> = []
  // Keys of rules skipped for missing data — kept open below, since a skipped
  // rule wasn't evaluated and must not be treated as cleared (US-54/55).
  const skippedKeys = new Set<string>()
  let skippedRuleCount = 0

  for (const row of rows) {
    try {
      const evaluation = evaluatePosition(
        toEvaluationInput({
          row,
          now,
          managementWindowDte,
          profitTargetPercentDefault,
          occ: occByPositionId.get(row.position_id) ?? null,
          priceByTicker,
          midByOccSymbol,
          earningsDateByTicker
        })
      )
      evaluation.matches.forEach((match) => matches.push({ positionId: row.position_id, match }))
      evaluation.skipped.forEach((skip) => {
        skippedRuleCount++
        skippedKeys.add(alertKey(row.position_id, skip.ruleCode))
        logger.debug(
          { positionId: row.position_id, ruleCode: skip.ruleCode, reason: skip.reason },
          'alert_rule_skipped'
        )
      })
    } catch (error) {
      logger.error({ positionId: row.position_id, error }, 'alert_evaluation_failed')
    }
  }

  // Persist phase — single transaction: upsert every match, then resolve any
  // open or dismissed alert whose condition no longer matches this run.
  let createdCount = 0
  let updatedCount = 0
  let resolvedCount = 0

  db.transaction(() => {
    const keepOpenKeys = new Set(skippedKeys)
    for (const { positionId, match } of matches) {
      const outcome = upsertOpenAlert(db, match, positionId, nowIso)
      if (outcome === 'inserted') createdCount++
      else if (outcome === 'updated') updatedCount++
      keepOpenKeys.add(alertKey(positionId, match.ruleCode))
    }
    resolvedCount = resolveAlertsNotIn(db, keepOpenKeys, nowIso)
    resolvedCount += clearStaleDismissals(db, keepOpenKeys, nowIso)
  })()

  logger.info(
    { createdCount, updatedCount, resolvedCount, skippedRuleCount },
    'alert_evaluation_completed'
  )

  return { createdCount, updatedCount, resolvedCount, skippedRuleCount }
}
