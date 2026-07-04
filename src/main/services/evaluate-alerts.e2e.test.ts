// [US-50] Acceptance tests for the scheduled alert-evaluation job.
//
// One test per US-50 acceptance scenario; the `it()` names mirror the Gherkin
// scenario titles directly. These run against an in-memory DB (makeTestDb) with
// an injected `now`, invoking evaluateAlerts exactly the way the scheduler
// handler in src/main/index.ts does (`evaluateAlerts({ db })`, plus an injected
// clock for determinism).

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestDb } from '../test-utils'
import { listOpenAlerts } from './alerts'
import { evaluateAlerts } from './evaluate-alerts'
import {
  LATER,
  LATER_ISO,
  NOW,
  NOW_ISO,
  expirationForDte,
  inertProvider,
  occFor,
  readAlertRows,
  seedPosition,
  seedShortOptionAtPremium,
  stubProvider
} from './evaluate-alerts-test-utils'

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

describe('US-50 acceptance', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('AC: Scheduled evaluation creates open alerts for triggered rules', async () => {
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

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

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

  it('AC: Re-evaluation updates an existing open alert instead of duplicating it', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      dte: 17
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    const [afterFirst] = readAlertRows(db)
    expect(afterFirst.triggered_at).toBe(NOW_ISO)

    // Same 17 DTE relative to the original NOW, evaluated a day later.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(17, NOW),
      'pos-msft'
    )
    await evaluateAlerts({ db, now: LATER, provider: inertProvider() })

    const rows = readAlertRows(db).filter((r) => r.rule_code === 'MANAGEMENT_WINDOW')
    expect(rows).toHaveLength(1)
    expect(rows[0].triggered_at).toBe(NOW_ISO)
    expect(rows[0].last_evaluated_at).toBe(LATER_ISO)
  })

  it('AC: Cleared conditions resolve the alert', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      dte: 17
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    expect(listOpenAlerts(db)).toHaveLength(1)

    // MSFT rolled out to 29 DTE before the next evaluation.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )
    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(rows[0].resolved_at).toBe(NOW_ISO)
    expect(listOpenAlerts(db)).toHaveLength(0)
  })

  it('AC: Positions without an active option leg are skipped', async () => {
    seedPosition(db, { id: 'pos-tsla', ticker: 'TSLA', phase: 'HOLDING_SHARES' })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    expect(readAlertRows(db).some((r) => r.position_id === 'pos-tsla')).toBe(false)
  })

  it('AC: Missing data for one rule does not fail the whole evaluation job', async () => {
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
    await evaluateAlerts({ db, now: NOW, provider: inertProvider(), logger })

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

/**
 * Seeds the standard AAPL $180 CSP fixture shared by the US-54/US-55 scenarios
 * (entry $3.50, 1 contract, 30 DTE — outside both DTE windows) and returns its
 * OCC symbol so the test can stub the option mid.
 */
function seedAaplCsp(db: Database.Database): { occ: string } {
  const expiration = expirationForDte(30)
  seedShortOptionAtPremium(db, {
    id: 'pos-aapl',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    strike: '180.0000',
    contracts: 1,
    entryPremium: '3.5000',
    expiration
  })
  return { occ: occFor({ ticker: 'AAPL', expiration, strike: '180.0000', instrumentType: 'PUT' }) }
}

describe('US-53 acceptance — MANAGEMENT_WINDOW', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('AC: Alert fires when a position enters the 21-DTE window', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      dte: 21
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-msft' && a.ruleCode === 'MANAGEMENT_WINDOW'
    )
    expect(alert?.urgency).toBe('medium')
    expect(alert?.summary).toBe('21 DTE remaining — review for roll or close')
  })

  it('AC: Alert remains open while the position stays between 6 and 21 DTE', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      dte: 21
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    const [afterFirst] = readAlertRows(db).filter((r) => r.rule_code === 'MANAGEMENT_WINDOW')
    expect(afterFirst.triggered_at).toBe(NOW_ISO)

    // MSFT now has 12 DTE remaining as of the later evaluation.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(12, LATER),
      'pos-msft'
    )
    await evaluateAlerts({ db, now: LATER, provider: inertProvider() })

    const rows = readAlertRows(db).filter((r) => r.rule_code === 'MANAGEMENT_WINDOW')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('open')
    expect(rows[0].triggered_at).toBe(NOW_ISO)
    expect(rows[0].summary).toBe('12 DTE remaining — review for roll or close')
  })

  it('AC: Alert does not fire outside the threshold', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      dte: 22
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'MANAGEMENT_WINDOW')).toBe(false)
  })

  it('AC: Expiration-imminent takes precedence inside 5 DTE', async () => {
    seedActiveLegAtDte(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      dte: 4
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    const codes = listOpenAlerts(db)
      .filter((a) => a.positionId === 'pos-msft')
      .map((a) => a.ruleCode)
    expect(codes).toContain('EXPIRATION_IMMINENT')
    expect(codes).not.toContain('MANAGEMENT_WINDOW')
  })
})

describe('US-54 acceptance — PROFIT_TARGET', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('AC: Alert fires when unrealized profit reaches the default target', async () => {
    const { occ } = seedAaplCsp(db)

    // Price far from strike keeps STRIKE_PROXIMITY silent so it does not confound.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '1.7000' },
        priceByTicker: { AAPL: '200.00' }
      })
    })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-aapl' && a.ruleCode === 'PROFIT_TARGET'
    )
    expect(alert?.urgency).toBe('low')
    expect(alert?.summary).toBe('51.4% of max profit captured — consider closing')
  })

  it('AC: Alert fires for an open covered call that reaches the target', async () => {
    const expiration = expirationForDte(30)
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration
    })
    const occ = occFor({ ticker: 'MSFT', expiration, strike: '420.0000', instrumentType: 'CALL' })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '1.9000' },
        priceByTicker: { MSFT: '400.00' }
      })
    })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-msft' && a.ruleCode === 'PROFIT_TARGET'
    )
    expect(alert?.urgency).toBe('low')
    expect(alert?.summary).toBe('52.5% of max profit captured — consider closing')
  })

  it('AC: Alert does not fire before the target is reached', async () => {
    const { occ } = seedAaplCsp(db)

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '2.4000' },
        priceByTicker: { AAPL: '200.00' }
      })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
  })

  it('AC: Position without a live option mark is skipped', async () => {
    seedAaplCsp(db)

    // No snapshot for the symbol → mid null → PROFIT_TARGET skips. Price far from
    // strike so STRIKE_PROXIMITY neither fires nor skips.
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { AAPL: '200.00' } }),
      logger
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-aapl',
        ruleCode: 'PROFIT_TARGET',
        reason: 'missing_option_mark'
      }),
      expect.any(String)
    )
  })

  it('AC: Holding-shares positions do not receive profit-target alerts', async () => {
    // HOLDING_SHARES with no open option leg → no active option leg to evaluate.
    seedPosition(db, { id: 'pos-tsla', ticker: 'TSLA', phase: 'HOLDING_SHARES' })

    await evaluateAlerts({ db, now: NOW, provider: stubProvider() })

    expect(readAlertRows(db).some((r) => r.position_id === 'pos-tsla')).toBe(false)
  })
})

describe('US-55 acceptance — STRIKE_PROXIMITY', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('AC: Alert fires when price is within 1% above the CSP strike', async () => {
    const { occ } = seedAaplCsp(db)

    // Mid == entry keeps PROFIT_TARGET silent (0% captured).
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '3.5000' },
        priceByTicker: { AAPL: '181.20' }
      })
    })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-aapl' && a.ruleCode === 'STRIKE_PROXIMITY'
    )
    expect(alert?.urgency).toBe('medium')
    expect(alert?.summary).toBe('Stock is 0.7% above the $180.00 put strike')
  })

  it('AC: Alert fires when price is within 1% below the CSP strike', async () => {
    const { occ } = seedAaplCsp(db)

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '3.5000' },
        priceByTicker: { AAPL: '179.10' }
      })
    })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-aapl' && a.ruleCode === 'STRIKE_PROXIMITY'
    )
    expect(alert?.urgency).toBe('medium')
    expect(alert?.summary).toBe('Stock is 0.5% below the $180.00 put strike — now in the money')
  })

  it('AC: Alert does not fire when the stock is safely away from the strike', async () => {
    const { occ } = seedAaplCsp(db)

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '3.5000' },
        priceByTicker: { AAPL: '183.80' }
      })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'STRIKE_PROXIMITY')).toBe(false)
  })

  it('AC: Covered-call positions do not use this CSP strike-proximity rule', async () => {
    const expiration = expirationForDte(30)
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration
    })
    const occ = occFor({ ticker: 'MSFT', expiration, strike: '420.0000', instrumentType: 'CALL' })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '4.0000' },
        priceByTicker: { MSFT: '419.60' }
      })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'STRIKE_PROXIMITY')).toBe(false)
  })
})
