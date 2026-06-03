import Database from 'better-sqlite3'
import { buildOccSymbol } from '../core/option-symbol'
import type { BrokerError, BrokerProvider } from '../integrations/broker-provider'
import { BrokerError as BrokerErrorClass } from '../integrations/broker-provider'
import { logger } from '../logger'
import { appSettings } from './app-settings'

export const DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'

type DetectResult = { detected: number; skipped: number; brokerError?: BrokerError }

interface OpenLegRow {
  position_id: string
  ticker: string
  leg_id: string
  strike: string
  expiration: string
  instrument_type: 'PUT' | 'CALL'
}

interface OpenLegMatch {
  positionId: string
  legId: string
  ticker: string
  strike: string
}

const OPEN_CSP_LEGS_QUERY = `
  SELECT p.id AS position_id, p.ticker, l.id AS leg_id, l.strike, l.expiration, l.instrument_type
  FROM positions p
  JOIN legs l ON l.id = (
    SELECT id FROM legs sub
    WHERE sub.position_id = p.id
      AND sub.leg_role IN ('CSP_OPEN', 'ROLL_TO')
    ORDER BY sub.fill_date DESC, sub.created_at DESC
    LIMIT 1
  )
  WHERE p.phase = 'CSP_OPEN' AND p.status = 'ACTIVE'
`

export function matchActivityToLeg(
  symbol: string,
  openLegMap: Map<string, OpenLegMatch>
): OpenLegMatch | undefined {
  return openLegMap.get(symbol)
}

function buildOpenLegMap(db: Database.Database): Map<string, OpenLegMatch> {
  const rows = db.prepare(OPEN_CSP_LEGS_QUERY).all() as OpenLegRow[]
  const map = new Map<string, OpenLegMatch>()
  for (const row of rows) {
    const symbol = buildOccSymbol({
      ticker: row.ticker,
      expiration: row.expiration,
      strike: row.strike,
      instrumentType: row.instrument_type
    })
    map.set(symbol, {
      positionId: row.position_id,
      legId: row.leg_id,
      ticker: row.ticker,
      strike: row.strike
    })
  }
  return map
}

export async function detectAssignments({
  db,
  brokerProvider,
  env
}: {
  db: Database.Database
  brokerProvider: BrokerProvider
  env: 'paper' | 'live'
}): Promise<DetectResult> {
  const watermarkKey = `assignments_last_poll_at:${env}`
  const since =
    appSettings.get(db, watermarkKey) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let activities
  try {
    activities = await brokerProvider.getActivities({ type: 'OPASN', since })
  } catch (err) {
    if (err instanceof BrokerErrorClass) {
      logger.warn({ err, code: err.code }, `detect_assignments_broker_error`)
      if (err.code === 'auth_failed') {
        return { detected: 0, skipped: 0, brokerError: err }
      }
      return { detected: 0, skipped: 0 }
    }
    throw err
  }

  const openLegMap = buildOpenLegMap(db)

  let detected = 0
  let skipped = 0

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO pending_assignments
      (position_id, leg_id, activity_id, broker_symbol, qty, transaction_time, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  )

  db.transaction(() => {
    for (const activity of activities) {
      const match = matchActivityToLeg(activity.symbol, openLegMap)
      if (!match) {
        logger.debug({ symbol: activity.symbol }, 'no_matching_csp_leg')
        skipped++
        continue
      }

      const result = insertStmt.run(
        match.positionId,
        match.legId,
        activity.activityId,
        activity.symbol,
        activity.qty,
        activity.transactionTime
      )

      if (result.changes > 0) {
        logger.info(
          { ticker: match.ticker, strike: match.strike },
          `Assignment detected for ${match.ticker} CSP at $${match.strike} strike`
        )
        detected++
      }
    }

    appSettings.set(db, watermarkKey, new Date().toISOString())
  })()

  return { detected, skipped }
}
