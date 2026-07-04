// [US-50] Evaluation orchestration service — integration tests against an
// in-memory DB (makeTestDb) with an injected `now`, invoked the way the
// scheduler handler invokes evaluateAlerts.

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
  TWO_DAYS_LATER,
  TWO_DAYS_LATER_ISO,
  expirationForDte,
  inertProvider,
  occFor,
  readAlertRows,
  seedPosition,
  seedShortOptionAtPremium,
  stubProvider
} from './evaluate-alerts-test-utils'

// ---------------------------------------------------------------------------
// Fixtures + raw-insert seed helpers (fully deterministic DTE control)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

describe('evaluateAlerts', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('creates an open EXPIRATION_IMMINENT alert for an active CSP at 5 dte', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(5)
    })

    const result = await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    expect(result).toEqual({
      createdCount: 1,
      updatedCount: 0,
      resolvedCount: 0,
      skippedRuleCount: 0
    })
    expect(listOpenAlerts(db)).toEqual([
      expect.objectContaining({
        positionId: 'pos-aapl',
        ruleCode: 'EXPIRATION_IMMINENT',
        urgency: 'high',
        summary: 'Expires in 5 days at $180.00 strike',
        quickAction: 'Review position',
        status: 'open',
        triggeredAt: NOW_ISO,
        lastEvaluatedAt: NOW_ISO,
        resolvedAt: null
      })
    ])
  })

  it('keeps the existing expiration-imminent row open and refreshes the summary from 5 dte to 3 dte', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(5)
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    const firstRow = readAlertRows(db)[0]

    const result = await evaluateAlerts({ db, now: TWO_DAYS_LATER, provider: inertProvider() })

    expect(result).toEqual({
      createdCount: 0,
      updatedCount: 1,
      resolvedCount: 0,
      skippedRuleCount: 0
    })

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      ...firstRow,
      summary: 'Expires in 3 days at $180.00 strike',
      quick_action: 'Review position',
      triggered_at: NOW_ISO,
      last_evaluated_at: TWO_DAYS_LATER_ISO,
      updated_at: TWO_DAYS_LATER_ISO,
      resolved_at: null
    })
  })

  it('does not create an expiration-imminent alert when the active leg has 6 dte', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(6)
    })

    const result = await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    expect(result).toEqual({
      createdCount: 1,
      updatedCount: 0,
      resolvedCount: 0,
      skippedRuleCount: 0
    })
    expect(listOpenAlerts(db)).toEqual([
      expect.objectContaining({
        positionId: 'pos-aapl',
        ruleCode: 'MANAGEMENT_WINDOW'
      })
    ])
    expect(listOpenAlerts(db).some((alert) => alert.ruleCode === 'EXPIRATION_IMMINENT')).toBe(false)
  })

  it('resolves the open expiration-imminent alert when the short leg is closed before the next evaluation', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(5)
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    db.prepare(`DELETE FROM legs WHERE position_id = ?`).run('pos-aapl')

    const result = await evaluateAlerts({ db, now: LATER, provider: inertProvider() })

    expect(result).toEqual({
      createdCount: 0,
      updatedCount: 0,
      resolvedCount: 1,
      skippedRuleCount: 0
    })

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(rows[0].resolved_at).toBe(LATER_ISO)
    expect(listOpenAlerts(db)).toEqual([])
  })

  it('persists alerts only for evaluable positions, skipping those without an active option leg', async () => {
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

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    const open = listOpenAlerts(db)
    expect(open).toHaveLength(2)
    expect(open.find((a) => a.positionId === 'pos-aapl')?.ruleCode).toBe('EXPIRATION_IMMINENT')
    expect(open.find((a) => a.positionId === 'pos-msft')?.ruleCode).toBe('MANAGEMENT_WINDOW')
    expect(open.some((a) => a.positionId === 'pos-tsla')).toBe(false)
  })

  it('returns created counts on the first run and update counts (no new rows) on an unchanged re-run', async () => {
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

    const first = await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    expect(first.createdCount).toBe(2)
    expect(first.updatedCount).toBe(0)
    expect(first.resolvedCount).toBe(0)

    const second = await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    expect(second.createdCount).toBe(0)
    expect(second.updatedCount).toBe(2)
    expect(second.resolvedCount).toBe(0)

    expect(readAlertRows(db)).toHaveLength(2)
  })

  it('preserves triggered_at and advances last_evaluated_at when an alert re-matches', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    const [afterFirst] = readAlertRows(db)
    expect(afterFirst.triggered_at).toBe(NOW_ISO)
    expect(afterFirst.last_evaluated_at).toBe(NOW_ISO)

    await evaluateAlerts({ db, now: LATER, provider: inertProvider() })
    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].triggered_at).toBe(NOW_ISO)
    expect(rows[0].last_evaluated_at).toBe(LATER_ISO)
  })

  it('resolves an alert whose condition has cleared and drops it from the open list', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      expiration: expirationForDte(17)
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    expect(listOpenAlerts(db)).toHaveLength(1)

    // Move the active leg out to 29 DTE — no longer in the management window.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )

    const result = await evaluateAlerts({ db, now: NOW, provider: inertProvider() })
    expect(result.resolvedCount).toBe(1)

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(rows[0].resolved_at).toBe(NOW_ISO)
    expect(listOpenAlerts(db)).toHaveLength(0)
  })

  it('isolates a skipped rule: persists other positions, logs the skip at DEBUG, writes no partial rows', async () => {
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
    const result = await evaluateAlerts({ db, now: NOW, provider: inertProvider(), logger })

    // AAPL alert is still persisted.
    const open = listOpenAlerts(db)
    expect(open).toHaveLength(1)
    expect(open[0].positionId).toBe('pos-aapl')
    expect(open[0].ruleCode).toBe('EXPIRATION_IMMINENT')

    // No row for the skipped position; no partial writes.
    expect(open.some((a) => a.positionId === 'pos-skip')).toBe(false)
    expect(readAlertRows(db)).toHaveLength(1)

    // The skip is logged at DEBUG with its reason. With no resolvable expiration
    // the position skips both DTE rules (missing_dte) and PROFIT_TARGET (no OCC
    // symbol → missing_option_mark) — three skips in total.
    expect(result.skippedRuleCount).toBe(3)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: 'pos-skip', reason: 'missing_dte' }),
      expect.any(String)
    )
  })

  it('still evaluates DTE rules when the market-data provider fails', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })

    // Both feeds reject (provider outage). The DTE-only alert must still persist.
    const provider = inertProvider()
    ;(provider.getStockQuotes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('outage'))
    ;(provider.getOptionSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('outage'))
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await evaluateAlerts({ db, now: NOW, provider, logger })

    const open = listOpenAlerts(db)
    expect(open.find((a) => a.positionId === 'pos-aapl')?.ruleCode).toBe('EXPIRATION_IMMINENT')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('does not abort the batch when one leg yields an invalid OCC symbol', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-healthy',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(4)
    })
    // A zero strike makes buildOccSymbol throw; it must not abort the run.
    seedEvaluablePosition(db, {
      id: 'pos-badstrike',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '0.0000',
      expiration: expirationForDte(4)
    })

    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    const open = listOpenAlerts(db)
    // The healthy position is evaluated and persisted.
    expect(open.find((a) => a.positionId === 'pos-healthy')?.ruleCode).toBe('EXPIRATION_IMMINENT')
    // The malformed leg still gets its OCC-independent DTE alert (no throw).
    expect(open.find((a) => a.positionId === 'pos-badstrike')?.ruleCode).toBe('EXPIRATION_IMMINENT')
  })
})

// ---------------------------------------------------------------------------
// [US-54 / US-55] Live market-data enrichment — async pre-fetch + input mapping.
// ---------------------------------------------------------------------------

describe('evaluateAlerts — live market-data enrichment', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('returns a promise', () => {
    const result = evaluateAlerts({ db, now: NOW, provider: stubProvider() })
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('fetches stock quotes for the distinct evaluable tickers', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl-1',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(30)
    })
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CSP_OPEN',
      strike: '300.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(30)
    })
    // Duplicate ticker — must not produce a duplicate quote request.
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl-2',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '175.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(30)
    })

    const provider = stubProvider()
    await evaluateAlerts({ db, now: NOW, provider })

    expect(provider.getStockQuotes).toHaveBeenCalledTimes(1)
    const tickers = (provider.getStockQuotes as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(new Set(tickers)).toEqual(new Set(['AAPL', 'MSFT']))
  })

  it('builds OCC symbols and fetches option snapshots for evaluable legs', async () => {
    const aaplExp = expirationForDte(30)
    const msftExp = expirationForDte(30)
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: aaplExp
    })
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: msftExp
    })

    const provider = stubProvider()
    await evaluateAlerts({ db, now: NOW, provider })

    expect(provider.getOptionSnapshot).toHaveBeenCalledWith(
      occFor({ ticker: 'AAPL', expiration: aaplExp, strike: '180.0000', instrumentType: 'PUT' })
    )
    expect(provider.getOptionSnapshot).toHaveBeenCalledWith(
      occFor({ ticker: 'MSFT', expiration: msftExp, strike: '300.0000', instrumentType: 'CALL' })
    )
  })

  it('maps live mid and underlying price into the evaluation input', async () => {
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
    const occ = occFor({
      ticker: 'AAPL',
      expiration,
      strike: '180.0000',
      instrumentType: 'PUT'
    })

    const provider = stubProvider({
      midBySymbol: { [occ]: '1.7000' },
      priceByTicker: { AAPL: '181.20' }
    })
    await evaluateAlerts({ db, now: NOW, provider })

    const open = listOpenAlerts(db).filter((a) => a.positionId === 'pos-aapl')
    const codes = open.map((a) => a.ruleCode)
    expect(codes).toContain('PROFIT_TARGET')
    expect(codes).toContain('STRIKE_PROXIMITY')
  })

  it('logs a DEBUG skip when the option mark is missing', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(30)
    })

    // No snapshot for the symbol → currentOptionMid null → PROFIT_TARGET skips.
    // Price far from strike → STRIKE_PROXIMITY does not fire and is not skipped.
    const provider = stubProvider({ priceByTicker: { AAPL: '200.00' } })
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const result = await evaluateAlerts({ db, now: NOW, provider, logger })

    expect(result.skippedRuleCount).toBe(1)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-aapl',
        ruleCode: 'PROFIT_TARGET',
        reason: 'missing_option_mark'
      }),
      expect.any(String)
    )
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
  })

  it('preserves an open alert when its rule is skipped for missing data (transient outage)', async () => {
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
    const occ = occFor({
      ticker: 'AAPL',
      expiration,
      strike: '180.0000',
      instrumentType: 'PUT'
    })

    // First run: mid present → PROFIT_TARGET fires and opens. Price far from strike
    // so STRIKE_PROXIMITY stays silent and does not confound.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '1.7000' },
        priceByTicker: { AAPL: '200.00' }
      })
    })
    const [afterFirst] = readAlertRows(db).filter((r) => r.rule_code === 'PROFIT_TARGET')
    expect(afterFirst.status).toBe('open')
    expect(afterFirst.triggered_at).toBe(NOW_ISO)

    // Second run: the option snapshot is missing (transient outage) → PROFIT_TARGET
    // is skipped, not evaluated as cleared. The open alert must be preserved — not
    // resolved and re-opened with a fresh triggered_at.
    const result = await evaluateAlerts({
      db,
      now: LATER,
      provider: stubProvider({ priceByTicker: { AAPL: '200.00' } })
    })

    expect(result.resolvedCount).toBe(0)
    const rows = readAlertRows(db).filter((r) => r.rule_code === 'PROFIT_TARGET')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('open')
    expect(rows[0].triggered_at).toBe(NOW_ISO)
  })

  it('resolves an alert when the condition reverses on a later run', async () => {
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
    const occ = occFor({
      ticker: 'AAPL',
      expiration,
      strike: '180.0000',
      instrumentType: 'PUT'
    })

    // First run: mid 1.70 → 51.4% captured → PROFIT_TARGET fires. Price far from
    // strike so STRIKE_PROXIMITY stays silent and does not confound the assertion.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: stubProvider({
        midBySymbol: { [occ]: '1.7000' },
        priceByTicker: { AAPL: '200.00' }
      })
    })
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(true)

    // Second run: mid 2.40 → 31.4% captured → below target → PROFIT_TARGET resolves.
    const result = await evaluateAlerts({
      db,
      now: LATER,
      provider: stubProvider({
        midBySymbol: { [occ]: '2.4000' },
        priceByTicker: { AAPL: '200.00' }
      })
    })
    expect(result.resolvedCount).toBeGreaterThanOrEqual(1)
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
  })
})
