// [US-50] Evaluation orchestration service — integration tests against an
// in-memory DB (makeTestDb) with an injected `now`, invoked the way the
// scheduler handler invokes evaluateAlerts.

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { addDays, format } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchNextEarnings } from '../integrations/finnhub-earnings'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { makeSpyLogger, makeTestDb } from '../test-utils'
import { dismissAlert, listOpenAlerts } from './alerts'
import { evaluateAlerts } from './evaluate-alerts'
import {
  LATER,
  LATER_ISO,
  NOW,
  NOW_ISO,
  TWO_DAYS_LATER,
  TWO_DAYS_LATER_ISO,
  expirationForDte,
  inertEarnings,
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

    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    const firstRow = readAlertRows(db)[0]

    const result = await evaluateAlerts({
      db,
      now: TWO_DAYS_LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

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

    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    db.prepare(`DELETE FROM legs WHERE position_id = ?`).run('pos-aapl')

    const result = await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

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

    const first = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    expect(first.createdCount).toBe(2)
    expect(first.updatedCount).toBe(0)
    expect(first.resolvedCount).toBe(0)

    const second = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    const [afterFirst] = readAlertRows(db)
    expect(afterFirst.triggered_at).toBe(NOW_ISO)
    expect(afterFirst.last_evaluated_at).toBe(NOW_ISO)

    await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    expect(listOpenAlerts(db)).toHaveLength(1)

    // Move the active leg out to 29 DTE — no longer in the management window.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )

    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
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

    const logger = makeSpyLogger()
    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings(),
      logger
    })

    // AAPL alert is still persisted.
    const open = listOpenAlerts(db)
    expect(open).toHaveLength(1)
    expect(open[0].positionId).toBe('pos-aapl')
    expect(open[0].ruleCode).toBe('EXPIRATION_IMMINENT')

    // No row for the skipped position; no partial writes.
    expect(open.some((a) => a.positionId === 'pos-skip')).toBe(false)
    expect(readAlertRows(db)).toHaveLength(1)

    // The skip is logged at DEBUG with its reason. With no resolvable expiration
    // the position skips the DTE-dependent rules (missing_dte, incl.
    // EARNINGS_PROXIMITY) and PROFIT_TARGET (no OCC symbol →
    // missing_option_mark) — four skips in total.
    expect(result.skippedRuleCount).toBe(4)
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
    const logger = makeSpyLogger()

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

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

    const open = listOpenAlerts(db)
    // The healthy position is evaluated and persisted.
    expect(open.find((a) => a.positionId === 'pos-healthy')?.ruleCode).toBe('EXPIRATION_IMMINENT')
    // The malformed leg still gets its OCC-independent DTE alert (no throw).
    expect(open.find((a) => a.positionId === 'pos-badstrike')?.ruleCode).toBe('EXPIRATION_IMMINENT')
  })

  // ---------------------------------------------------------------------------
  // [US-59] Dismissal-aware evaluation — clearStaleDismissals wired into the
  // persist transaction alongside resolveAlertsNotIn.
  // ---------------------------------------------------------------------------

  it('keeps a dismissed MANAGEMENT_WINDOW alert hidden across a re-run where the position is still inside the window', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(12)
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    const [seeded] = readAlertRows(db)
    dismissAlert(db, seeded.id, LATER_ISO)

    const result = await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

    expect(result.createdCount).toBe(0)
    expect(result.updatedCount).toBe(0)
    expect(listOpenAlerts(db)).toEqual([])

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('dismissed')
  })

  it('re-opens a dismissed MANAGEMENT_WINDOW alert with a new triggered_at after the position leaves and re-enters the window', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      expiration: expirationForDte(12)
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    const [seeded] = readAlertRows(db)
    dismissAlert(db, seeded.id, NOW_ISO)

    // Rolled out to 30 DTE — outside the management window. The dismissed row
    // must clear to resolved, not linger as a stale dismissal.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(30),
      'pos-aapl'
    )
    const clearResult = await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

    const afterClear = readAlertRows(db).find((r) => r.id === seeded.id)
    expect(afterClear?.status).toBe('resolved')
    expect(listOpenAlerts(db)).toEqual([])
    // A dismissal clearing to resolved must be counted in resolvedCount, same
    // as an open alert resolving — both are "the row is no longer active".
    expect(clearResult.resolvedCount).toBe(1)

    // Back inside the window — a brand-new open row with a later triggered_at.
    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(14, TWO_DAYS_LATER),
      'pos-aapl'
    )
    await evaluateAlerts({
      db,
      now: TWO_DAYS_LATER,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

    const open = listOpenAlerts(db)
    expect(open).toHaveLength(1)
    expect(open[0].ruleCode).toBe('MANAGEMENT_WINDOW')
    expect(new Date(open[0].triggeredAt).getTime()).toBeGreaterThan(new Date(NOW_ISO).getTime())
  })

  it('still resolves an open (non-dismissed) alert when its condition clears, unaffected by clearStaleDismissals', async () => {
    seedEvaluablePosition(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '300.0000',
      expiration: expirationForDte(17)
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })
    expect(listOpenAlerts(db)).toHaveLength(1)

    db.prepare(`UPDATE legs SET expiration = ? WHERE position_id = ?`).run(
      expirationForDte(29),
      'pos-msft'
    )

    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings()
    })

    expect(result.resolvedCount).toBe(1)
    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('resolved')
    expect(listOpenAlerts(db)).toHaveLength(0)
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
    const logger = makeSpyLogger()
    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider,
      fetchEarnings: inertEarnings(),
      logger
    })

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

// ---------------------------------------------------------------------------
// [US-56] Earnings boundary fetch — third concurrent feed + input mapping.
// ---------------------------------------------------------------------------

describe('evaluateAlerts — earnings boundary fetch (US-56)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('fires EARNINGS_PROXIMITY with the exact summary when earnings are 6 days out and expiration 13 days out', async () => {
    const expiration = expirationForDte(13)
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: expirationForDte(6) } })
    })

    const earnings = listOpenAlerts(db).find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')
    expect(earnings).toEqual(
      expect.objectContaining({
        positionId: 'pos-nvda',
        urgency: 'medium',
        summary: `Earnings in 6 days before your ${expiration} expiration`,
        quickAction: 'Review position',
        status: 'open'
      })
    )
  })

  it('skips the rule (missing_earnings_date) and still persists the DTE rules when no earnings date is available', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(6)
    })

    const logger = makeSpyLogger()
    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({}),
      logger
    })

    const codes = listOpenAlerts(db).map((a) => a.ruleCode)
    expect(codes).not.toContain('EARNINGS_PROXIMITY')
    expect(codes).toContain('MANAGEMENT_WINDOW')
    expect(result.skippedRuleCount).toBe(1)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-nvda',
        ruleCode: 'EARNINGS_PROXIMITY',
        reason: 'missing_earnings_date'
      }),
      'alert_rule_skipped'
    )
  })

  it('degrades with a WARN and leaves the DTE rules unaffected when the earnings fetch throws', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(6)
    })

    const logger = makeSpyLogger()
    const result = await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: vi.fn(async () => {
        throw new Error('earnings feed outage')
      }),
      logger
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
      'alert_evaluation_earnings_unavailable'
    )
    expect(result.createdCount).toBe(1)
    expect(listOpenAlerts(db).map((a) => a.ruleCode)).toContain('MANAGEMENT_WINDOW')
  })

  it('keeps the alert open with its original triggered_at across a transient earnings-data gap', async () => {
    const expiration = expirationForDte(13)
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })

    // Run 1: earnings present → alert fires.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: expirationForDte(6) } })
    })
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toBe(true)

    // Run 2: earnings feed comes back empty → skip keeps the row open, untouched.
    await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({})
    })

    const earnings = listOpenAlerts(db).find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')
    expect(earnings).toEqual(
      expect.objectContaining({ status: 'open', triggeredAt: NOW_ISO, resolvedAt: null })
    )
  })

  it('treats a malformed earnings date as missing (skip) instead of resolving the open alert', async () => {
    const expiration = expirationForDte(13)
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })

    // Run 1: valid earnings date → alert fires.
    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: expirationForDte(6) } })
    })
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toBe(true)

    // Run 2: the feed returns a non-ISO date. Without validation this becomes a
    // NaN daysToEarnings that neither matches nor skips, wrongly resolving the
    // still-valid alert. It must skip as missing data and keep the row open.
    const logger = makeSpyLogger()
    await evaluateAlerts({
      db,
      now: LATER,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: 'TBD' } }),
      logger
    })

    const earnings = listOpenAlerts(db).find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')
    expect(earnings).toEqual(
      expect.objectContaining({ status: 'open', triggeredAt: NOW_ISO, resolvedAt: null })
    )
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-nvda',
        ruleCode: 'EARNINGS_PROXIMITY',
        reason: 'missing_earnings_date'
      }),
      'alert_rule_skipped'
    )
  })

  it('resolves the alert once the (lookback) earnings date is behind now', async () => {
    const expiration = expirationForDte(13)
    const earningsDate = expirationForDte(6)
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: earningsDate } })
    })
    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toBe(true)

    // Eight days later the same (now lookback) event is behind us → predicate is
    // false → the open alert resolves rather than freezing.
    const afterEarnings = addDays(NOW, 8)
    await evaluateAlerts({
      db,
      now: afterEarnings,
      provider: inertProvider(),
      fetchEarnings: stubEarnings({ NVDA: { status: 'found', date: earningsDate } })
    })

    const row = readAlertRows(db).find((r) => r.rule_code === 'EARNINGS_PROXIMITY')
    expect(row).toEqual(
      expect.objectContaining({ status: 'resolved', resolved_at: afterEarnings.toISOString() })
    )
  })

  it('calls the batch earnings read once per run with the deduped ticker set and US-56’s 30-day horizon', async () => {
    const expiration = expirationForDte(13)
    for (const [id, ticker] of [
      ['pos-nvda-1', 'NVDA'],
      ['pos-nvda-2', 'NVDA'],
      ['pos-aapl', 'AAPL']
    ] as const) {
      seedShortOptionAtPremium(db, {
        id,
        ticker,
        phase: 'CSP_OPEN',
        strike: '100.0000',
        contracts: 1,
        entryPremium: '3.5000',
        expiration
      })
    }

    const fetchEarnings = inertEarnings()
    const logger = makeSpyLogger()
    await evaluateAlerts({ db, now: NOW, provider: inertProvider(), fetchEarnings, logger })

    expect(fetchEarnings).toHaveBeenCalledTimes(1)
    const [calledTickers, calledOpts] = (fetchEarnings as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string[], { now?: Date; horizon?: Date }]
    expect(calledTickers).toHaveLength(2)
    expect(new Set(calledTickers)).toEqual(new Set(['NVDA', 'AAPL']))
    // [US-70] Persistence changed where the answer comes from, not how far ahead
    // the alert looks: the store is asked for exactly US-56's 30-day horizon, as
    // a date (the store takes a date, never a day count).
    expect(calledOpts).toEqual({ now: NOW, horizon: addDays(NOW, 30) })
  })
})

// ---------------------------------------------------------------------------
// [US-70] Earnings read through the persisted `earnings_date` store. The feed's
// four-state lookup replaces the bare date, and a stored row answers the alert
// run with no HTTP call — the cross-consumer win the old process-local success
// cache lost on every restart.
// ---------------------------------------------------------------------------

describe('evaluateAlerts — earnings read through the persisted store (US-70)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
    vi.mocked(fetchNextEarnings).mockClear()
  })

  /** A row the store can answer from: checked through the alert's 30-day horizon,
   *  as of `now`, so none of the refresh triggers fire. */
  function seedEarningsRow(ticker: string, nextEarnings: string | null): void {
    db.prepare(
      `INSERT INTO earnings_date (ticker, next_earnings, checked_through, checked_at, source)
       VALUES (?, ?, ?, ?, 'finnhub')`
    ).run(ticker, nextEarnings, format(addDays(NOW, 30), 'yyyy-MM-dd'), NOW_ISO)
  }

  /**
   * Two positions in one run: AAPL, whose earnings land inside the window, and
   * NVDA at 6 DTE with a mid and a near-the-money price, so its MANAGEMENT_WINDOW,
   * PROFIT_TARGET and STRIKE_PROXIMITY rules all fire. Whatever the earnings
   * lookup says about NVDA, those three and AAPL's alert must survive it.
   */
  function seedIsolationFixture(): { provider: MarketDataProvider; aaplExpiration: string } {
    const aaplExpiration = expirationForDte(13)
    const aaplOcc = seedShortOptionWithOcc(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: aaplExpiration
    })
    const nvdaOcc = seedShortOptionWithOcc(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CSP_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration: expirationForDte(6)
    })

    return {
      aaplExpiration,
      // AAPL: mid == entry (0% captured) and price far from strike, so only its
      // earnings rule fires. NVDA: 52.5% captured and 0.4% above strike.
      provider: stubProvider({
        midBySymbol: { [aaplOcc]: '3.5000', [nvdaOcc]: '1.9000' },
        priceByTicker: { AAPL: '200.00', NVDA: '502.00' }
      })
    }
  }

  it('serves a stored earnings date to the alert run without asking the feed', async () => {
    const expiration = expirationForDte(13)
    seedShortOptionAtPremium(db, {
      id: 'pos-nvda',
      ticker: 'NVDA',
      phase: 'CC_OPEN',
      strike: '500.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration
    })
    seedEarningsRow('NVDA', expirationForDte(6))

    // No injected reader — the run goes through the real store.
    await evaluateAlerts({ db, now: NOW, provider: inertProvider() })

    expect(listOpenAlerts(db).find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toEqual(
      expect.objectContaining({
        positionId: 'pos-nvda',
        urgency: 'medium',
        summary: `Earnings in 6 days before your ${expiration} expiration`,
        status: 'open'
      })
    )
    expect(vi.mocked(fetchNextEarnings)).not.toHaveBeenCalled()
  })

  it('skips EARNINGS_PROXIMITY for an unavailable lookup while every other rule and ticker still evaluates', async () => {
    const { provider, aaplExpiration } = seedIsolationFixture()
    const logger = makeSpyLogger()

    await evaluateAlerts({
      db,
      now: NOW,
      provider,
      fetchEarnings: stubEarnings({
        NVDA: { status: 'unavailable' },
        AAPL: { status: 'found', date: expirationForDte(6) }
      }),
      logger
    })

    const open = listOpenAlerts(db)
    const nvdaCodes = open.filter((a) => a.positionId === 'pos-nvda').map((a) => a.ruleCode)
    // Unavailable behaves exactly as a missing ticker did: the rule skips…
    expect(nvdaCodes).not.toContain('EARNINGS_PROXIMITY')
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-nvda',
        ruleCode: 'EARNINGS_PROXIMITY',
        reason: 'missing_earnings_date'
      }),
      'alert_rule_skipped'
    )
    // …and suppresses nothing else — neither NVDA's other rules…
    expect(nvdaCodes).toEqual(
      expect.arrayContaining(['MANAGEMENT_WINDOW', 'PROFIT_TARGET', 'STRIKE_PROXIMITY'])
    )
    // …nor the other ticker's earnings answer.
    expect(open.find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toEqual(
      expect.objectContaining({
        positionId: 'pos-aapl',
        summary: `Earnings in 6 days before your ${aaplExpiration} expiration`
      })
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('skips EARNINGS_PROXIMITY without error for a none lookup while every other rule and ticker still evaluates', async () => {
    const { provider, aaplExpiration } = seedIsolationFixture()
    const logger = makeSpyLogger()

    await evaluateAlerts({
      db,
      now: NOW,
      provider,
      fetchEarnings: stubEarnings({
        NVDA: { status: 'none' },
        AAPL: { status: 'found', date: expirationForDte(6) }
      }),
      logger
    })

    const open = listOpenAlerts(db)
    const nvdaCodes = open.filter((a) => a.positionId === 'pos-nvda').map((a) => a.ruleCode)
    expect(nvdaCodes).not.toContain('EARNINGS_PROXIMITY')
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'pos-nvda',
        ruleCode: 'EARNINGS_PROXIMITY',
        reason: 'missing_earnings_date'
      }),
      'alert_rule_skipped'
    )
    expect(nvdaCodes).toEqual(
      expect.arrayContaining(['MANAGEMENT_WINDOW', 'PROFIT_TARGET', 'STRIKE_PROXIMITY'])
    )
    expect(open.find((a) => a.ruleCode === 'EARNINGS_PROXIMITY')).toEqual(
      expect.objectContaining({
        positionId: 'pos-aapl',
        summary: `Earnings in 6 days before your ${aaplExpiration} expiration`
      })
    )
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('evaluateAlerts — resolved thresholds (US-57/58 wiring)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('creates a MANAGEMENT_WINDOW alert when the per-position override widens the batch default', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CC_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(16),
      managementWindowDteOverride: 30
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings(),
      managementWindowDte: 21
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'MANAGEMENT_WINDOW')).toBe(true)
  })

  it('does not create a MANAGEMENT_WINDOW alert when the per-position override narrows the batch default', async () => {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CC_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: expirationForDte(16),
      managementWindowDteOverride: 10
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider: inertProvider(),
      fetchEarnings: inertEarnings(),
      managementWindowDte: 21
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'MANAGEMENT_WINDOW')).toBe(false)
  })

  it('creates a PROFIT_TARGET alert using the batch profitTargetPercentDefault when no override is set', async () => {
    const expiration = expirationForDte(30)
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration,
      profitTargetPercent: null
    })
    const occ = occFor({ ticker: 'AAPL', expiration, strike: '180.0000', instrumentType: 'PUT' })
    // entry 4.00, mid 2.60 -> 35% captured
    const provider = stubProvider({
      midBySymbol: { [occ]: '2.6000' },
      priceByTicker: { AAPL: '1.00' }
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider,
      fetchEarnings: inertEarnings(),
      profitTargetPercentDefault: 30
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(true)
  })

  it('does not create a PROFIT_TARGET alert when the per-position override is higher than the batch default', async () => {
    const expiration = expirationForDte(30)
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '4.0000',
      expiration,
      profitTargetPercent: 60
    })
    const occ = occFor({ ticker: 'AAPL', expiration, strike: '180.0000', instrumentType: 'PUT' })
    // entry 4.00, mid 2.60 -> 35% captured
    const provider = stubProvider({
      midBySymbol: { [occ]: '2.6000' },
      priceByTicker: { AAPL: '1.00' }
    })

    await evaluateAlerts({
      db,
      now: NOW,
      provider,
      fetchEarnings: inertEarnings(),
      profitTargetPercentDefault: 30
    })

    expect(listOpenAlerts(db).some((a) => a.ruleCode === 'PROFIT_TARGET')).toBe(false)
  })
})
