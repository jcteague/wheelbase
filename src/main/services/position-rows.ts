// Shared row writer for the opening services (createPosition, createPmccPosition).
// Inserts the `positions` row and returns the matching PositionRecord, narrowed to the
// strategy and phase the caller opened with.

import Database from 'better-sqlite3'
import type { StrategyType, WheelPhase } from '../core/types'
import type { PositionRecord } from '../schemas'

export interface NewPositionRow<S extends StrategyType, P extends WheelPhase> {
  id: string
  ticker: string
  strategyType: S
  phase: P
  openedDate: string
  accountId: string | null
  notes: string | null
  thesis: string | null
  now: string
}

export type OpenedPositionRecord<S extends StrategyType, P extends WheelPhase> = PositionRecord & {
  strategyType: S
  phase: P
  status: 'ACTIVE'
  closedDate: null
}

const INSERT_POSITION_SQL = `INSERT INTO positions
  (id, ticker, strategy_type, status, phase, opened_date, account_id, notes, thesis, tags, created_at, updated_at)
 VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, '[]', ?, ?)`

export function insertPosition<S extends StrategyType, P extends WheelPhase>(
  db: Database.Database,
  row: NewPositionRow<S, P>
): OpenedPositionRecord<S, P> {
  db.prepare(INSERT_POSITION_SQL).run(
    row.id,
    row.ticker,
    row.strategyType,
    row.phase,
    row.openedDate,
    row.accountId,
    row.notes,
    row.thesis,
    row.now,
    row.now
  )
  return {
    id: row.id,
    ticker: row.ticker,
    phase: row.phase,
    status: 'ACTIVE',
    strategyType: row.strategyType,
    openedDate: row.openedDate,
    closedDate: null,
    accountId: row.accountId,
    notes: row.notes,
    thesis: row.thesis,
    tags: [],
    profitTargetPercent: null,
    managementWindowDteOverride: null,
    createdAt: row.now,
    updatedAt: row.now
  }
}
