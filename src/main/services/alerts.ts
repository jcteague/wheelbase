// Service layer — alert persistence primitives. Owns the `alerts` table reads
// and writes; takes plain values + engine matches and returns plain records.
// No Electron or broker imports here.

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { AlertMatch, AlertUrgency } from '../core/alerts'
import type { WheelPhase } from '../core/types'
import { logger } from '../logger'
import type { AlertRecord, ManagementQueueItem } from '../schemas'

// ---------------------------------------------------------------------------
// Internal DB row type
// ---------------------------------------------------------------------------

interface AlertRow {
  id: string
  position_id: string
  rule_code: string
  urgency: string
  summary: string
  quick_action: string
  status: string
  triggered_at: string
  last_evaluated_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable identity for an alert across runs: one open alert per (position, rule). */
export function alertKey(positionId: string, ruleCode: string): string {
  return `${positionId}::${ruleCode}`
}

function mapAlertRow(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    positionId: row.position_id,
    ruleCode: row.rule_code,
    urgency: row.urgency as AlertRecord['urgency'],
    summary: row.summary,
    quickAction: row.quick_action,
    status: row.status as AlertRecord['status'],
    triggeredAt: row.triggered_at,
    lastEvaluatedAt: row.last_evaluated_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ---------------------------------------------------------------------------
// Write primitives
// ---------------------------------------------------------------------------

export type UpsertOutcome = 'inserted' | 'updated'

/**
 * Inserts a new open alert for `(positionId, match.ruleCode)`, or updates the
 * existing open one in place — preserving `triggered_at`, advancing
 * `last_evaluated_at`, and refreshing the live `summary`/`urgency`/quick action.
 */
export function upsertOpenAlert(
  db: Database.Database,
  match: AlertMatch,
  positionId: string,
  now: string
): UpsertOutcome {
  const existing = db
    .prepare(`SELECT id FROM alerts WHERE position_id = ? AND rule_code = ? AND status = 'open'`)
    .get(positionId, match.ruleCode) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE alerts
         SET summary = ?, urgency = ?, quick_action = ?, last_evaluated_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(match.summary, match.urgency, match.quickAction, now, now, existing.id)
    logger.debug({ positionId, ruleCode: match.ruleCode, alertId: existing.id }, 'alert_updated')
    return 'updated'
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO alerts
       (id, position_id, rule_code, urgency, summary, quick_action,
        status, triggered_at, last_evaluated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
  ).run(
    id,
    positionId,
    match.ruleCode,
    match.urgency,
    match.summary,
    match.quickAction,
    now,
    now,
    now,
    now
  )
  logger.debug({ positionId, ruleCode: match.ruleCode, alertId: id }, 'alert_inserted')
  return 'inserted'
}

/**
 * Marks every currently-open alert whose `(positionId, ruleCode)` key is absent
 * from `keepOpenKeys` as resolved. Alerts whose key is present stay open — this
 * covers both rules that matched this run and rules that were skipped for missing
 * data (a skipped rule wasn't evaluated, so it must not be treated as cleared).
 * Already-resolved / dismissed rows are untouched. Returns the number resolved.
 */
export function resolveAlertsNotIn(
  db: Database.Database,
  keepOpenKeys: Set<string>,
  now: string
): number {
  const openRows = db
    .prepare(`SELECT id, position_id, rule_code FROM alerts WHERE status = 'open'`)
    .all() as Array<{ id: string; position_id: string; rule_code: string }>

  const toResolve = openRows.filter(
    (row) => !keepOpenKeys.has(alertKey(row.position_id, row.rule_code))
  )

  const update = db.prepare(
    `UPDATE alerts SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?`
  )
  toResolve.forEach((row) => update.run(now, now, row.id))

  logger.debug({ resolvedCount: toResolve.length }, 'alerts_resolved')
  return toResolve.length
}

// ---------------------------------------------------------------------------
// Read primitives
// ---------------------------------------------------------------------------

export function listOpenAlerts(db: Database.Database): AlertRecord[] {
  const rows = db
    .prepare(`SELECT * FROM alerts WHERE status = 'open' ORDER BY rowid`)
    .all() as AlertRow[]
  return rows.map(mapAlertRow)
}

// ---------------------------------------------------------------------------
// Management queue read path (US-51)
// ---------------------------------------------------------------------------

// Joined alerts→positions row backing a `ManagementQueueItem`. `phase` and
// `urgency` carry their domain types (the DB columns are constrained to those
// values), so the mapper is a pure snake→camel rename.
interface QueueRow {
  alert_id: string
  position_id: string
  ticker: string
  phase: WheelPhase
  urgency: AlertUrgency
  summary: string
  quick_action: string
  triggered_at: string
}

function mapQueueRow(row: QueueRow): ManagementQueueItem {
  return {
    alertId: row.alert_id,
    positionId: row.position_id,
    ticker: row.ticker,
    phase: row.phase,
    urgency: row.urgency,
    summary: row.summary,
    quickAction: row.quick_action,
    triggeredAt: row.triggered_at
  }
}

/**
 * Returns every open alert enriched with its position's ticker and phase,
 * sorted by urgency tier (high → medium → low) then `triggered_at` ascending,
 * for the dashboard management queue.
 */
export function listManagementQueue(db: Database.Database): ManagementQueueItem[] {
  const rows = db
    .prepare(
      `SELECT
         a.id           AS alert_id,
         a.position_id  AS position_id,
         p.ticker       AS ticker,
         p.phase        AS phase,
         a.urgency      AS urgency,
         a.summary      AS summary,
         a.quick_action AS quick_action,
         a.triggered_at AS triggered_at
       FROM alerts a
       JOIN positions p ON p.id = a.position_id
       WHERE a.status = 'open'
       ORDER BY
         CASE a.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
         a.triggered_at ASC`
    )
    .all() as QueueRow[]

  const items = rows.map(mapQueueRow)
  logger.debug({ count: items.length }, 'management_queue_listed')
  return items
}
