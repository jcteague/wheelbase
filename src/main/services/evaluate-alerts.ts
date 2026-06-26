// Service layer — alert evaluation orchestration. Loads evaluable positions,
// runs the pure rule engine over each, and persists the resulting alert set
// atomically (upsert open matches + resolve cleared conditions).
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import type { Logger } from 'pino'
import {
  DEFAULT_MANAGEMENT_WINDOW_DTE,
  evaluatePosition,
  type AlertEvaluationInput,
  type AlertMatch
} from '../core/alerts'
import { computeDte } from '../core/dte'
import type { WheelPhase } from '../core/types'
import { logger as defaultLogger } from '../logger'
import type { EvaluateAlertsResult } from '../schemas'
import { activeLegSubquery } from './active-leg-sql'
import { alertKey, resolveAlertsNotIn, upsertOpenAlert } from './alerts'

export const ALERT_EVAL_JOB_NAME = 'alert-evaluation'

// ---------------------------------------------------------------------------
// Evaluable-position selection — positions with an active short option leg.
// An inner JOIN on the phase-aware active-leg subquery drops positions with no
// open option leg (e.g. HOLDING_SHARES without a covered call).
// ---------------------------------------------------------------------------

interface EvaluableRow {
  position_id: string
  phase: WheelPhase
  instrument_type: 'PUT' | 'CALL' | 'STOCK' | null
  strike: string | null
  expiration: string | null
}

const EVALUABLE_QUERY = `
  SELECT
    p.id   AS position_id,
    p.phase,
    l.instrument_type,
    l.strike,
    l.expiration
  FROM positions p
  JOIN legs l ON l.id = (
    ${activeLegSubquery()}
  )
  WHERE p.status = 'ACTIVE'
    AND p.phase IN ('CSP_OPEN', 'CC_OPEN')
`

function toEvaluationInput(
  row: EvaluableRow,
  now: Date,
  managementWindowDte: number
): AlertEvaluationInput {
  return {
    positionId: row.position_id,
    phase: row.phase,
    instrumentType: row.instrument_type === 'STOCK' ? null : row.instrument_type,
    strike: row.strike,
    dte: computeDte(row.expiration, now),
    managementWindowDte
  }
}

type EvaluateAlertsInput = {
  db: Database.Database
  now?: Date
  managementWindowDte?: number
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
}

export function evaluateAlerts({
  db,
  now = new Date(),
  managementWindowDte = DEFAULT_MANAGEMENT_WINDOW_DTE,
  logger = defaultLogger
}: EvaluateAlertsInput): EvaluateAlertsResult {
  const nowIso = now.toISOString()
  logger.debug({ now: nowIso, managementWindowDte }, 'alert_evaluation_start')

  const rows = db.prepare(EVALUABLE_QUERY).all() as EvaluableRow[]
  logger.debug({ count: rows.length }, 'alert_evaluation_targets_loaded')

  // Compute phase — pure, per-position, isolated so one failure can't abort
  // the others or leave partial writes (persistence happens in one transaction).
  const matches: Array<{ positionId: string; match: AlertMatch }> = []
  let skippedRuleCount = 0

  for (const row of rows) {
    try {
      const evaluation = evaluatePosition(toEvaluationInput(row, now, managementWindowDte))
      evaluation.matches.forEach((match) => matches.push({ positionId: row.position_id, match }))
      evaluation.skipped.forEach((skip) => {
        skippedRuleCount++
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
  // open alert whose condition no longer matches this run.
  let createdCount = 0
  let updatedCount = 0
  let resolvedCount = 0

  db.transaction(() => {
    const matchedKeys = new Set<string>()
    for (const { positionId, match } of matches) {
      if (upsertOpenAlert(db, match, positionId, nowIso) === 'inserted') createdCount++
      else updatedCount++
      matchedKeys.add(alertKey(positionId, match.ruleCode))
    }
    resolvedCount = resolveAlertsNotIn(db, matchedKeys, nowIso)
  })()

  logger.info(
    { createdCount, updatedCount, resolvedCount, skippedRuleCount },
    'alert_evaluation_completed'
  )

  return { createdCount, updatedCount, resolvedCount, skippedRuleCount }
}
