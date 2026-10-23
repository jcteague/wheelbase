// Service layer — alert evaluation orchestration. Loads evaluable positions,
// runs the pure rule engine over each, and persists the resulting alert set
// atomically (upsert open matches + resolve cleared conditions).
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import { addDays } from 'date-fns'
import {
  DEFAULT_MANAGEMENT_WINDOW_DTE,
  evaluatePosition,
  type AlertEvaluationInput,
  type AlertMatch
} from '../core/alerts'
import { DEFAULT_PROFIT_TARGET_PERCENT } from '../core/profit-target'
import { computeDte } from '../core/dte'
import type { EarningsLookup } from '../core/screener'
import type { WheelPhase } from '../core/types'
import { marketDataFactory } from '../integrations/market-data-factory'
import type { MarketDataProvider, OptionSnapshot } from '../integrations/market-data-provider'
import { logger as defaultLogger, type LoggerLike } from '../logger'
import type { EvaluateAlertsResult, LegRecord } from '../schemas'
import { buildOccSymbol } from '../../shared/option-symbol'
import { activeLegSubquery } from './active-leg-sql'
import { alertKey, clearStaleDismissals, resolveAlertsNotIn, upsertOpenAlert } from './alerts'
import { getEarnings } from './earnings-dates'
import { readLegsByPosition } from './leg-rows'
import { fetchOptionSnapshots, fetchStockQuotes, type IpcStockQuote } from './market-data'
import { currentShortCallLeg } from './pmcc-ledger'

export const ALERT_EVAL_JOB_NAME = 'alert-evaluation'

/** How far ahead the earnings store is asked to answer. EARNINGS_PROXIMITY only
 *  warns inside 10 days, but US-56 has always looked 30 days out; [US-70]
 *  persistence changed where the answer comes from, not how far ahead it looks. */
const EARNINGS_HORIZON_DAYS = 30

// ---------------------------------------------------------------------------
// Evaluable-position selection — positions with an active short option leg.
// An inner JOIN on the phase-aware active-leg subquery drops positions with no
// open option leg (e.g. HOLDING_SHARES without a covered call).
// ---------------------------------------------------------------------------

interface EvaluableRow {
  positionId: string
  ticker: string
  phase: WheelPhase
  profitTargetPercent: number | null
  managementWindowDteOverride: number | null
  instrumentType: 'PUT' | 'CALL'
  strike: string | null
  expiration: string | null
  premiumPerContract: string | null
  contracts: number | null
}

const EVALUABLE_QUERY = `
  SELECT
    p.id                             AS positionId,
    p.ticker,
    p.phase,
    p.profit_target_percent          AS profitTargetPercent,
    p.management_window_dte_override AS managementWindowDteOverride,
    l.instrument_type                AS instrumentType,
    l.strike,
    l.expiration,
    l.premium_per_contract           AS premiumPerContract,
    l.contracts
  FROM positions p
  JOIN legs l ON l.id = (
    ${activeLegSubquery()}
  )
  WHERE p.status = 'ACTIVE'
    AND p.phase IN ('CSP_OPEN', 'CC_OPEN')
    AND l.instrument_type IN ('PUT', 'CALL')
`

// ---------------------------------------------------------------------------
// [US-106] PMCC selection — a PMCC is evaluated through its current short call,
// never the LEAPS. The short is found by replaying the position's leg history
// (rolls, expirations, closes, assignments), not by the wheel SQL subquery.
// ---------------------------------------------------------------------------

type PmccCandidateRow = Pick<
  EvaluableRow,
  'positionId' | 'ticker' | 'profitTargetPercent' | 'managementWindowDteOverride'
> & { phase: 'PMCC_OPEN' }

const PMCC_CANDIDATE_QUERY = `
  SELECT
    id                             AS positionId,
    ticker,
    phase,
    profit_target_percent          AS profitTargetPercent,
    management_window_dte_override AS managementWindowDteOverride
  FROM positions
  WHERE status = 'ACTIVE'
    AND strategy_type = 'PMCC'
    AND phase = 'PMCC_OPEN'
`

/** Evaluable rows for every PMCC with an open short call. A PMCC with no open
 *  short contributes nothing (so its alerts resolve); a PMCC whose history can't
 *  be read or replayed is logged and added to `heldIds` instead, so its alerts
 *  are kept rather than treated as cleared. */
function loadPmccEvaluableRows({
  db,
  heldIds,
  logger
}: {
  db: Database.Database
  heldIds: Set<string>
  logger: LoggerLike
}): EvaluableRow[] {
  const candidates = db.prepare(PMCC_CANDIDATE_QUERY).all() as PmccCandidateRow[]
  if (candidates.length === 0) return []

  const positionIds = candidates.map((candidate) => candidate.positionId)
  let legsByPosition: Map<string, LegRecord[]>
  try {
    legsByPosition = readLegsByPosition(db, positionIds)
  } catch (error) {
    logger.error({ positionIds, error }, 'alert_evaluation_failed')
    positionIds.forEach((id) => heldIds.add(id))
    return []
  }

  return candidates.flatMap((candidate): EvaluableRow[] => {
    try {
      const short = currentShortCallLeg(legsByPosition.get(candidate.positionId) ?? [])
      if (short === null) return []
      // The ledger picks the short by role (SHORT_CALL_OPEN / short-side ROLL_TO), so it is a call.
      const { strike, expiration, premiumPerContract, contracts } = short
      return [
        { ...candidate, instrumentType: 'CALL', strike, expiration, premiumPerContract, contracts }
      ]
    } catch (error) {
      logger.error({ positionId: candidate.positionId, error }, 'alert_evaluation_failed')
      heldIds.add(candidate.positionId)
      return []
    }
  })
}

/** OCC symbol for a row's active option leg, or null when the leg data can't
 *  form a valid symbol (logged, never thrown — so one bad leg can't abort the
 *  whole batch or suppress its OCC-independent DTE rules). */
function occSymbolForRow(row: EvaluableRow, logger: LoggerLike): string | null {
  if (row.strike === null || !row.expiration) return null
  try {
    return buildOccSymbol({
      ticker: row.ticker,
      expiration: row.expiration,
      strike: row.strike,
      instrumentType: row.instrumentType
    })
  } catch (error) {
    logger.warn({ positionId: row.positionId, error }, 'alert_evaluation_occ_symbol_invalid')
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
  earningsByTicker: Map<string, EarningsLookup>
}

/** The plain nullable date the pure EARNINGS_PROXIMITY rule takes — the store's
 *  lookup union stays out of `src/main/core/`. A ticker the store had no answer
 *  for (`none`/`unavailable`, or absent entirely) reads as unknown, which the
 *  rule's own missing-data guard already skips on. */
function earningsDateFor(
  earningsByTicker: Map<string, EarningsLookup>,
  ticker: string
): string | null {
  const lookup = earningsByTicker.get(ticker)
  return lookup?.status === 'found' ? lookup.date : null
}

function toEvaluationInput({
  row,
  now,
  managementWindowDte,
  profitTargetPercentDefault,
  occ,
  priceByTicker,
  midByOccSymbol,
  earningsByTicker
}: ToEvaluationInputParams): AlertEvaluationInput {
  return {
    positionId: row.positionId,
    phase: row.phase,
    instrumentType: row.instrumentType,
    strike: row.strike,
    dte: computeDte(row.expiration, now),
    managementWindowDte,
    managementWindowDteOverride: row.managementWindowDteOverride,
    entryPremiumPerContract: row.premiumPerContract,
    contracts: row.contracts,
    currentOptionMid: occ ? (midByOccSymbol[occ]?.mid ?? null) : null,
    profitTargetPercentOverride: row.profitTargetPercent,
    profitTargetPercentDefault,
    currentUnderlyingPrice: priceByTicker[row.ticker]?.price ?? null,
    daysToEarnings: computeDte(earningsDateFor(earningsByTicker, row.ticker), now),
    expiration: row.expiration
  }
}

/** Injection seam for the earnings read (defaults to the read-through
 *  `earnings_date` store, which owns when the Finnhub feed is actually called). */
export type FetchEarnings = (
  tickers: string[],
  opts: { horizon: Date; now: Date }
) => Promise<Map<string, EarningsLookup>>

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
  fetchEarnings = (tickers, opts) => getEarnings(db, tickers, opts)
}: EvaluateAlertsInput): Promise<EvaluateAlertsResult> {
  const nowIso = now.toISOString()
  logger.debug({ now: nowIso, managementWindowDte }, 'alert_evaluation_start')

  // Positions whose selection or evaluation fails this run — every alert of theirs
  // is kept as-is, since a failure says nothing about whether a rule cleared.
  const heldPositionIds = new Set<string>()
  const rows = [
    ...(db.prepare(EVALUABLE_QUERY).all() as EvaluableRow[]),
    ...loadPmccEvaluableRows({ db, heldIds: heldPositionIds, logger })
  ]
  logger.debug({ count: rows.length }, 'alert_evaluation_targets_loaded')

  // Build each row's OCC symbol once (non-throwing) so a single malformed leg
  // can't abort the batch when collecting the symbol set below or mapping inputs.
  const occByPositionId = new Map(rows.map((row) => [row.positionId, occSymbolForRow(row, logger)]))

  // Pre-fetch live market data once for the whole batch (US-54/US-55/US-56).
  // All three feeds run concurrently and each degrades to empty on failure, so a
  // provider outage still lets the DTE rules evaluate. Awaited before the persist
  // transaction, so US-50 write atomicity is unchanged.
  const tickers = [...new Set(rows.map((row) => row.ticker))]
  const symbols = [...new Set([...occByPositionId.values()].filter((s): s is string => s !== null))]
  const [priceByTicker, { snapshots: midByOccSymbol }, earningsByTicker] = await Promise.all([
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
      () => fetchEarnings(tickers, { horizon: addDays(now, EARNINGS_HORIZON_DAYS), now }),
      new Map<string, EarningsLookup>(),
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
          occ: occByPositionId.get(row.positionId) ?? null,
          priceByTicker,
          midByOccSymbol,
          earningsByTicker
        })
      )
      evaluation.matches.forEach((match) => matches.push({ positionId: row.positionId, match }))
      evaluation.skipped.forEach((skip) => {
        skippedRuleCount++
        skippedKeys.add(alertKey(row.positionId, skip.ruleCode))
        logger.debug(
          { positionId: row.positionId, ruleCode: skip.ruleCode, reason: skip.reason },
          'alert_rule_skipped'
        )
      })
    } catch (error) {
      logger.error({ positionId: row.positionId, error }, 'alert_evaluation_failed')
      heldPositionIds.add(row.positionId)
    }
  }

  // Persist phase — single transaction: upsert every match, then resolve any
  // open or dismissed alert whose condition no longer matches this run, except
  // those of held positions.
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
    const keep = { keys: keepOpenKeys, positionIds: heldPositionIds }
    resolvedCount = resolveAlertsNotIn(db, keep, nowIso)
    resolvedCount += clearStaleDismissals(db, keep, nowIso)
  })()

  logger.info(
    { createdCount, updatedCount, resolvedCount, skippedRuleCount },
    'alert_evaluation_completed'
  )

  return { createdCount, updatedCount, resolvedCount, skippedRuleCount }
}
