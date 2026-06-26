// [US-50] Acceptance tests for the scheduled alert-evaluation job.
//
// One test per US-50 acceptance scenario; the `it()` names mirror the Gherkin
// scenario titles directly. These run against an in-memory DB (makeTestDb) with
// an injected `now`, invoking evaluateAlerts exactly the way the scheduler
// handler in src/main/index.ts does (`evaluateAlerts({ db })`, plus an injected
// clock for determinism).

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { addDays, format } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestDb } from '../test-utils'
import { listOpenAlerts } from './alerts'
import { evaluateAlerts } from './evaluate-alerts'

const NOW = new Date('2026-06-25T16:00:00.000Z')
const NOW_ISO = NOW.toISOString()
const LATER = new Date('2026-06-26T16:00:00.000Z')
const LATER_ISO = LATER.toISOString()

/** A `YYYY-MM-DD` expiration that is `dte` calendar days after `from`. */
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

/**
 * Seeds an evaluable CSP/CC position with an active option leg at `dte` calendar
 * days from `now`. Pass `dte: null` to seed a leg with no resolvable expiration
 * (drives the missing-data skip path).
 */
function seedActiveLegAtDte(
  db: Database.Database,
  input: {
    id: string
    ticker: string
    phase: 'CSP_OPEN' | 'CC_OPEN'
    strike: string
    dte: number | null
    now?: Date
  }
): void {
  seedPosition(db, { id: input.id, ticker: input.ticker, phase: input.phase })
  const isCc = input.phase === 'CC_OPEN'
  const expiration = input.dte === null ? '' : expirationForDte(input.dte, input.now ?? NOW)
  db.prepare(
    `INSERT INTO legs
       (id, position_id, leg_role, action, instrument_type, strike, expiration,
        contracts, premium_per_contract, fill_date, created_at, updated_at)
     VALUES (?, ?, ?, 'SELL', ?, ?, ?, 1, '2.5000', '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(
    randomUUID(),
    input.id,
    isCc ? 'CC_OPEN' : 'CSP_OPEN',
    isCc ? 'CALL' : 'PUT',
    input.strike,
    expiration
  )
}

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
}

function readAlertRows(db: Database.Database): AlertRow[] {
  return db.prepare('SELECT * FROM alerts ORDER BY rowid').all() as AlertRow[]
}

describe('US-50 acceptance', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('AC: Scheduled evaluation creates open alerts for triggered rules', () => {
    seedActiveLegAtDte(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      dte: 4
    })
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      dte: 17
    })

    evaluateAlerts({ db, now: NOW })

    const open = listOpenAlerts(db)
    const aapl = open.find((a) => a.positionId === 'pos-aapl')
    const msft = open.find((a) => a.positionId === 'pos-msft')

    expect(aapl?.ruleCode).toBe('EXPIRATION_IMMINENT')
    expect(msft?.ruleCode).toBe('MANAGEMENT_WINDOW')

    // Each alert record stores all eight fields named in the AC.
    expect(aapl).toEqual(
      expect.objectContaining({
        positionId: 'pos-aapl',
        ruleCode: 'EXPIRATION_IMMINENT',
        urgency: 'high',
        summary: expect.stringContaining('Expires in 4 days'),
        quickAction: expect.any(String),
        status: 'open',
        triggeredAt: NOW_ISO,
        lastEvaluatedAt: NOW_ISO
      })
    )
    expect(aapl?.quickAction.length).toBeGreaterThan(0)
  })

  it('AC: Re-evaluation updates an existing open alert instead of duplicating it', () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      dte: 17
    })

    evaluateAlerts({ db, now: NOW })
    const [afterFirst] = readAlertRows(db)
    expect(afterFirst.triggered_at).toBe(NOW_ISO)

    // Same 17 DTE relative to the original NOW, evaluated a day later.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(17, NOW),
      'pos-msft'
    )
    evaluateAlerts({ db, now: LATER })

    const rows = readAlertRows(db).filter((r) => r.rule_code === 'MANAGEMENT_WINDOW')
    expect(rows).toHaveLength(1)
    expect(rows[0].triggered_at).toBe(NOW_ISO)
    expect(rows[0].last_evaluated_at).toBe(LATER_ISO)
  })

  it('AC: Cleared conditions resolve the alert', () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      dte: 17
    })

    evaluateAlerts({ db, now: NOW })
    expect(listOpenAlerts(db)).toHaveLength(1)

    // MSFT rolled out to 29 DTE before the next evaluation.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )
    evaluateAlerts({ db, now: NOW })

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(rows[0].resolved_at).toBe(NOW_ISO)
    expect(listOpenAlerts(db)).toHaveLength(0)
  })

  it('AC: Positions without an active option leg are skipped', () => {
    seedPosition(db, { id: 'pos-tsla', ticker: 'TSLA', phase: 'HOLDING_SHARES' })

    evaluateAlerts({ db, now: NOW })

    expect(readAlertRows(db).some((r) => r.position_id === 'pos-tsla')).toBe(false)
  })

  it('AC: Missing data for one rule does not fail the whole evaluation job', () => {
    seedActiveLegAtDte(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      dte: 4
    })
    // NVDA position whose DTE cannot be resolved → its rules are skipped.
    seedActiveLegAtDte(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '500.0000',
      dte: null
    })

    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    evaluateAlerts({ db, now: NOW, logger })

    // The AAPL alert is still persisted.
    const open = listOpenAlerts(db)
    expect(open).toHaveLength(1)
    expect(open[0].positionId).toBe('pos-aapl')

    // The skipped rule produced a DEBUG log entry and no row; no partial writes.
    expect(readAlertRows(db).some((r) => r.position_id === 'pos-nvda')).toBe(false)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: 'pos-nvda', reason: 'missing_dte' }),
      expect.any(String)
    )
  })
})
