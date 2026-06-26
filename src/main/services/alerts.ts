// Service layer — alert persistence primitives. Owns the `alerts` table reads
// and writes; takes plain values + engine matches and returns plain records.
// No Electron or broker imports here.

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { AlertMatch } from '../core/alerts'
import { logger } from '../logger'
import type { AlertRecord } from '../schemas'

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
 * from `matchedKeys` as resolved. Matched alerts stay open; already-resolved /
 * dismissed rows are untouched. Returns the number of alerts resolved.
 */
export function resolveAlertsNotIn(
  db: Database.Database,
  matchedKeys: Set<string>,
  now: string
): number {
  const openRows = db
    .prepare(`SELECT id, position_id, rule_code FROM alerts WHERE status = 'open'`)
    .all() as Array<{ id: string; position_id: string; rule_code: string }>

  const toResolve = openRows.filter(
    (row) => !matchedKeys.has(alertKey(row.position_id, row.rule_code))
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
