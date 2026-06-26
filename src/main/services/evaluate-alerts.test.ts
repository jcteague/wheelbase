// [US-50] Evaluation orchestration service — integration tests against an
// in-memory DB (makeTestDb) with an injected `now`, invoked the way the
// scheduler handler invokes evaluateAlerts.

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { addDays, format } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestDb } from '../test-utils'
import { listOpenAlerts } from './alerts'
import { evaluateAlerts } from './evaluate-alerts'

// ---------------------------------------------------------------------------
// Fixtures + raw-insert seed helpers (fully deterministic DTE control)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-25T16:00:00.000Z')
const NOW_ISO = NOW.toISOString()
const LATER = new Date('2026-06-26T16:00:00.000Z')
const LATER_ISO = LATER.toISOString()

/** A `YYYY-MM-DD` expiration that is `dte` calendar days after NOW. */
function expirationForDte(dte: number, from: Date = NOW): string {
  return format(addDays(from, dte), 'yyyy-MM-dd')
}

function seedPosition(
  db: Database.Database,
  input: { id: string; ticker: string; phase: string }
): void {
  db.prepare(
    `INSERT INTO positions
       (id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at)
     VALUES (?, ?, 'WHEEL', 'ACTIVE', ?, '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(input.id, input.ticker, input.phase)
}

function seedLeg(
  db: Database.Database,
  input: {
    positionId: string
    legRole: string
    instrumentType: 'PUT' | 'CALL' | 'STOCK'
    strike: string
    expiration: string
  }
): void {
  db.prepare(
    `INSERT INTO legs
       (id, position_id, leg_role, action, instrument_type, strike, expiration,
        contracts, premium_per_contract, fill_date, created_at, updated_at)
     VALUES (?, ?, ?, 'SELL', ?, ?, ?, 1, '2.5000', '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(
    randomUUID(),
    input.positionId,
    input.legRole,
    input.instrumentType,
    input.strike,
    input.expiration
  )
}

/** Seeds an evaluable CSP/CC position with an active option leg at `dte`. */
function seedEvaluablePosition(
  db: Database.Database,
  input: {
    id: string
    ticker: string
    phase: 'CSP_OPEN' | 'CC_OPEN'
    strike: string
    expiration: string
  }
): void {
  seedPosition(db, { id: input.id, ticker: input.ticker, phase: input.phase })
  const isCc = input.phase === 'CC_OPEN'
  seedLeg(db, {
    positionId: input.id,
    legRole: isCc ? 'CC_OPEN' : 'CSP_OPEN',
    instrumentType: isCc ? 'CALL' : 'PUT',
    strike: input.strike,
    expiration: input.expiration
  })
}

interface AlertRow {
  id: string
  position_id: string
  rule_code: string
  urgency: string
  status: string
  triggered_at: string
  last_evaluated_at: string
  resolved_at: string | null
}

function readAlertRows(db: Database.Database): AlertRow[] {
  return db.prepare('SELECT * FROM alerts ORDER BY rowid').all() as AlertRow[]
}

// ---------------------------------------------------------------------------

describe('evaluateAlerts', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('persists alerts only for evaluable positions, skipping those without an active option leg', () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })
    seedEvaluablePosition(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      expiration: expirationForDte(17)
    })
    // HOLDING_SHARES with no open covered call → no active option leg.
    seedPosition(db, { id: 'pos-tsla', ticker: 'TSLA', phase: 'HOLDING_SHARES' })

    evaluateAlerts({ db, now: NOW })

    const open = listOpenAlerts(db)
    expect(open).toHaveLength(2)
    expect(open.find((a) => a.positionId === 'pos-aapl')?.ruleCode).toBe('EXPIRATION_IMMINENT')
    expect(open.find((a) => a.positionId === 'pos-msft')?.ruleCode).toBe('MANAGEMENT_WINDOW')
    expect(open.some((a) => a.positionId === 'pos-tsla')).toBe(false)
  })

  it('returns created counts on the first run and update counts (no new rows) on an unchanged re-run', () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })
    seedEvaluablePosition(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      expiration: expirationForDte(17)
    })

    const first = evaluateAlerts({ db, now: NOW })
    expect(first.createdCount).toBe(2)
    expect(first.updatedCount).toBe(0)
    expect(first.resolvedCount).toBe(0)

    const second = evaluateAlerts({ db, now: NOW })
    expect(second.createdCount).toBe(0)
    expect(second.updatedCount).toBe(2)
    expect(second.resolvedCount).toBe(0)

    expect(readAlertRows(db)).toHaveLength(2)
  })

  it('preserves triggered_at and advances last_evaluated_at when an alert re-matches', () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })

    evaluateAlerts({ db, now: NOW })
    const [afterFirst] = readAlertRows(db)
    expect(afterFirst.triggered_at).toBe(NOW_ISO)
    expect(afterFirst.last_evaluated_at).toBe(NOW_ISO)

    evaluateAlerts({ db, now: LATER })
    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].triggered_at).toBe(NOW_ISO)
    expect(rows[0].last_evaluated_at).toBe(LATER_ISO)
  })

  it('resolves an alert whose condition has cleared and drops it from the open list', () => {
    seedEvaluablePosition(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      expiration: expirationForDte(17)
    })

    evaluateAlerts({ db, now: NOW })
    expect(listOpenAlerts(db)).toHaveLength(1)

    // Move the active leg out to 29 DTE — no longer in the management window.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )

    const result = evaluateAlerts({ db, now: NOW })
    expect(result.resolvedCount).toBe(1)

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(rows[0].resolved_at).toBe(NOW_ISO)
    expect(listOpenAlerts(db)).toHaveLength(0)
  })

  it('isolates a skipped rule: persists other positions, logs the skip at DEBUG, writes no partial rows', () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })
    // An evaluable position whose DTE cannot be resolved (empty expiration) → skipped.
    seedEvaluablePosition(db, {
      id: 'pos-skip',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '500.0000',
      expiration: ''
    })

    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const result = evaluateAlerts({ db, now: NOW, logger })

    // AAPL alert is still persisted.
    const open = listOpenAlerts(db)
    expect(open).toHaveLength(1)
    expect(open[0].positionId).toBe('pos-aapl')
    expect(open[0].ruleCode).toBe('EXPIRATION_IMMINENT')

    // No row for the skipped position; no partial writes.
    expect(open.some((a) => a.positionId === 'pos-skip')).toBe(false)
    expect(readAlertRows(db)).toHaveLength(1)

    // The skip is logged at DEBUG with its reason; both DTE rules are skipped.
    expect(result.skippedRuleCount).toBe(2)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: 'pos-skip', reason: 'missing_dte' }),
      expect.any(String)
    )
  })
})
