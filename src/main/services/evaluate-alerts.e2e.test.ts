// [US-50] Acceptance tests for the scheduled alert-evaluation job.
//
// One test per US-50 acceptance scenario; the `it()` names mirror the Gherkin
// scenario titles directly. These run against an in-memory DB (makeTestDb) with
// an injected `now`, invoking evaluateAlerts exactly the way the scheduler
// handler in src/main/index.ts does (`evaluateAlerts({ db })`, plus an injected
// clock for determinism).

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { parseISO } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSpyLogger, makeTestDb } from '../test-utils'
import { getAlertDefaults, saveAlertDefaults } from './alert-defaults'
import { listOpenAlerts } from './alerts'
import { evaluateAlerts } from './evaluate-alerts'
import { getPosition } from './get-position'
import { savePositionAlertOverrides } from './save-position-alert-overrides'
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
  seedShortOptionWithOcc,
  stubEarnings,
  stubProvider
} from './evaluate-alerts-test-utils'

// Default-reader guard: tests that don't inject `fetchEarnings` read through the
// real `earnings_date` store, which must never reach the live Finnhub module
// (that would hit the network whenever a key is present in the shell env). The
// mock mirrors the no-key behavior: an empty record, i.e. nothing known.
vi.mock('../integrations/finnhub-earnings', () => ({
  fetchNextEarnings: vi.fn(async () => ({}))
}))

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

    const logger = makeSpyLogger()
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
    const logger = makeSpyLogger()
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

describe('US-56 acceptance — EARNINGS_PROXIMITY', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Seeds the story's NVDA covered call with an absolute expiration date. */
  function seedNvdaCc(expiration: string): void {
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })
  }

  it('fires a medium-urgency EARNINGS_PROXIMITY alert when earnings are within 10 calendar days and before expiration', async () => {
    // Today 2026-08-08; earnings 08-14 (6 days out); expiration 08-21 (13 dte).
    // parseISO keeps `now` on the same local-day basis computeDte uses for the
    // YYYY-MM-DD fixture dates, so the day counts hold in every timezone.
    seedNvdaCc('2026-08-21')

    await evaluateAlerts({
      db,
      now: parseISO('2026-08-08'),
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: '2026-08-14' } })
    })

    const earnings = listOpenAlerts(db).filter((a) => a.ruleCode === 'EARNINGS_PROXIMITY')
    expect(earnings).toHaveLength(1)
    expect(earnings[0]).toEqual(
      expect.objectContaining({
        positionId: 'pos-nvda',
        urgency: 'medium',
        summary: 'Earnings in 6 days before your 2026-08-21 expiration',
        status: 'open'
      })
    )
  })

  it('does not fire when earnings are more than 10 days away', async () => {
    // Today 2026-08-08; earnings 08-21 (13 days out); expiration 08-27.
    seedNvdaCc('2026-08-27')

    await evaluateAlerts({
      db,
      now: parseISO('2026-08-08'),
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: '2026-08-21' } })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toBe(false)
  })

  it('does not fire when earnings occur after the option expires', async () => {
    // Today 2026-08-10; expiration 08-15 (5 dte); earnings 08-18 (8 days out, after expiry).
    seedNvdaCc('2026-08-15')

    await evaluateAlerts({
      db,
      now: parseISO('2026-08-10'),
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: '2026-08-18' } })
    })

    const codes = listOpenAlerts(db).map((a) => a.ruleCode)
    expect(codes).not.toContain('EARNINGS_PROXIMITY')
    // The 5-dte EXPIRATION_IMMINENT alert co-exists — earnings staying silent is
    // its own rule's decision, not a suppression of the others.
    expect(codes).toContain('EXPIRATION_IMMINENT')
  })

  it('skips the rule without failing the run when no earnings date is available', async () => {
    // 6 dte → MANAGEMENT_WINDOW persists, proving the run completed normally.
    seedNvdaCc(expirationForDte(6))

    const logger = makeSpyLogger()
    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({}),
      logger
    })

    const codes = listOpenAlerts(db).map((a) => a.ruleCode)
    expect(codes).not.toContain('EARNINGS_PROXIMITY')
    expect(codes).toContain('MANAGEMENT_WINDOW')
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-nvda',
        ruleCode: 'EARNINGS_PROXIMITY',
        reason: 'missing_earnings_date'
      }),
      'alert_rule_skipped'
    )
  })
})

describe('US-62 acceptance — COVERED_CALL_BREACH', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Seeds the story's MSFT $420 covered call at 30 DTE (outside both DTE
   *  windows, so only the breach rule can fire). No option mid is stubbed, so
   *  PROFIT_TARGET simply skips and does not confound. */
  function seedMsftCc(): void {
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30)
    })
  }

  it('fires a medium COVERED_CALL_BREACH alert when the stock rises above the call strike', async () => {
    seedMsftCc()

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { MSFT: '427.40' } })
    })

    const breach = listOpenAlerts(db).filter((a) => a.ruleCode === 'COVERED_CALL_BREACH')
    expect(breach).toHaveLength(1)
    expect(breach[0]).toEqual(
      expect.objectContaining({
        positionId: 'pos-msft',
        urgency: 'medium',
        summary: 'Stock is 1.8% above the $420.00 call strike — shares may be called away',
        status: 'open'
      })
    )
  })

  it('does not create a COVERED_CALL_BREACH alert while the stock is below the call strike', async () => {
    seedMsftCc()

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { MSFT: '416.00' } })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'COVERED_CALL_BREACH')).toBe(false)
  })

  it('resolves the COVERED_CALL_BREACH alert when the stock falls back below the strike', async () => {
    seedMsftCc()

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { MSFT: '427.40' } })
    })
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'COVERED_CALL_BREACH')).toBe(true)

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { MSFT: '415.00' } })
    })

    const rows = readAlertRows(db).filter((r) => r.rule_code === 'COVERED_CALL_BREACH')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'COVERED_CALL_BREACH')).toBe(false)
  })

  it('does not create a COVERED_CALL_BREACH alert for a cash-secured put', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(30)
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { AAPL: '185.00' } })
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'COVERED_CALL_BREACH')).toBe(false)
  })

  it('does not evaluate a holding-shares position with no open covered call', async () => {
    seedPosition(db, { id: 'pos-tsla', ticker: 'TSLA', phase: 'HOLDING_SHARES' })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({ priceByTicker: { TSLA: '250.00' } })
    })

    expect(readAlertRows(db).some((r) => r.position_id === 'pos-tsla')).toBe(false)
  })
})

describe('US-57 acceptance', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('applies the saved global defaults to future evaluations of positions without overrides', async () => {
    saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })

    // 18 DTE and 45% captured, no per-position override.
    const occ = seedShortOptionWithOcc(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(18)
    })

    const { profitTargetPercent, managementWindowDte } = getAlertDefaults(db)
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '2.2000' },
        priceByTicker: { AAPL: '200.00' }
      }),
      managementWindowDte,
      profitTargetPercentDefault: profitTargetPercent
    })

    const codes = listOpenAlerts(db).map((a) => a.ruleCode)
    // Saved default of 14 DTE applies (18 > 14) — the old hardcoded 21 DTE
    // default would have fired at 18 DTE, so this proves the saved value won.
    expect(codes).not.toContain('MANAGEMENT_WINDOW')
    // Saved default of 40% applies (45% >= 40%) — the old hardcoded 50% default
    // would not have fired at 45% captured, so this proves the saved value won.
    expect(codes).toContain('PROFIT_TARGET')
  })

  it('saves new global defaults and future alert evaluations use them for positions without overrides', async () => {
    saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 30 })

    // 25 DTE, no per-position override — outside the old hardcoded 21-DTE
    // default, but inside the newly saved 30-DTE default.
    seedActiveLegAtDte(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      dte: 25
    })

    const { profitTargetPercent, managementWindowDte } = getAlertDefaults(db)
    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      managementWindowDte,
      profitTargetPercentDefault: profitTargetPercent
    })

    const alert = listOpenAlerts(db).find(
      (a) => a.positionId === 'pos-aapl' && a.ruleCode === 'MANAGEMENT_WINDOW'
    )
    expect(alert).toBeDefined()
  })

  it('rejects invalid global default values without saving them', () => {
    saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })

    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 14 })
    ).toThrow('Profit target must be between 1 and 99')
    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 100 })
    ).toThrow('Management window must be between 6 and 45 DTE')

    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 40, managementWindowDte: 14 })
  })

  it('does not overwrite an existing per-position override when global defaults are saved', () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30),
      profitTargetPercent: 25
    })

    saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })

    expect(getPosition(db, 'pos-msft')?.position.profitTargetPercent).toBe(25)
  })
})

describe('US-58 acceptance', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('saves per-position overrides and future evaluations for that position use them', async () => {
    const occ = seedShortOptionWithOcc(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(25)
    })

    savePositionAlertOverrides(db, 'pos-aapl', { profitTargetPercent: 25, managementWindowDte: 30 })

    // Batch defaults (50% / 21 DTE) would not fire either rule at 25 DTE / 30%
    // captured — only the per-position overrides (30 DTE / 25%) make them fire.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '2.8000' },
        priceByTicker: { AAPL: '200.00' }
      }),
      managementWindowDte: 21,
      profitTargetPercentDefault: 50
    })

    const codes = listOpenAlerts(db)
      .filter((a) => a.positionId === 'pos-aapl')
      .map((a) => a.ruleCode)
    expect(codes).toContain('MANAGEMENT_WINDOW')
    expect(codes).toContain('PROFIT_TARGET')
  })

  it('leaves other positions on the global defaults when one position has overrides', async () => {
    const aaplOcc = seedShortOptionWithOcc(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30)
    })
    savePositionAlertOverrides(db, 'pos-aapl', {
      profitTargetPercent: 25,
      managementWindowDte: null
    })

    const msftOcc = seedShortOptionWithOcc(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30)
    })

    // Both positions captured 30% — only AAPL's override (25%) fires; MSFT
    // stays on the 50% global default and does not fire.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [aaplOcc]: '2.8000', [msftOcc]: '2.8000' },
        priceByTicker: { AAPL: '200.00', MSFT: '400.00' }
      }),
      managementWindowDte: 21,
      profitTargetPercentDefault: 50
    })

    const aaplCodes = listOpenAlerts(db)
      .filter((a) => a.positionId === 'pos-aapl')
      .map((a) => a.ruleCode)
    const msftCodes = listOpenAlerts(db)
      .filter((a) => a.positionId === 'pos-msft')
      .map((a) => a.ruleCode)
    expect(aaplCodes).toContain('PROFIT_TARGET')
    expect(msftCodes).not.toContain('PROFIT_TARGET')
  })

  it('clears overrides and reverts the position to the global defaults', async () => {
    const occ = seedShortOptionWithOcc(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30),
      profitTargetPercent: 25
    })

    savePositionAlertOverrides(db, 'pos-aapl', {
      profitTargetPercent: null,
      managementWindowDte: null
    })

    // 30% captured no longer clears the (now-cleared) 25% override — the 50%
    // global default applies instead, so PROFIT_TARGET does not fire.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '2.8000' },
        priceByTicker: { AAPL: '200.00' }
      }),
      managementWindowDte: 21,
      profitTargetPercentDefault: 50
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
    expect(getPosition(db, 'pos-aapl')?.position.profitTargetPercent).toBeNull()
  })

  it('rejects invalid per-position override values without saving them', () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(30)
    })

    expect(() =>
      savePositionAlertOverrides(db, 'pos-aapl', {
        profitTargetPercent: 100,
        managementWindowDte: 14
      })
    ).toThrow('Profit target must be between 1 and 99')
    expect(() =>
      savePositionAlertOverrides(db, 'pos-aapl', {
        profitTargetPercent: 25,
        managementWindowDte: 60
      })
    ).toThrow('Management window must be between 6 and 45 DTE')

    const position = getPosition(db, 'pos-aapl')?.position
    expect(position?.profitTargetPercent).toBeNull()
    expect(position?.managementWindowDteOverride).toBeNull()
  })
})
