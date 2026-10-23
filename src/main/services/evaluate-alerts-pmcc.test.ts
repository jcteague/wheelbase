// [US-106] PMCC short-call alert evaluation — the current short call (never the LEAPS) is the
// evaluated leg, so PMCC_ASSIGNMENT_RISK and the generic short-leg rules see its strike,
// expiration and premium. Integration tests against an in-memory DB with an injected `now`.
// Calendar basis is America/New_York (run with TZ=America/New_York, as quickstart.md says).

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataError, type MarketDataProvider } from '../integrations/market-data-provider'
import type { LegRecord } from '../schemas'
import { makeSpyLogger, makeTestDb } from '../test-utils'
import { dismissAlert, listManagementQueue } from './alerts'
import { evaluateAlerts, type FetchEarnings } from './evaluate-alerts'
import {
  inertEarnings,
  occFor,
  readAlertRows,
  seedShortOptionAtPremium,
  stubEarnings,
  stubProvider,
  type AlertRow
} from './evaluate-alerts-test-utils'
import { rollPmccShortCallPosition } from './roll-pmcc-short-call-position'
import { insertLegs, makePmccLeg } from './test-fixtures/pmcc-legs'

const { bulkRead } = vi.hoisted(() => ({ bulkRead: { fail: false } }))

vi.mock('./leg-rows', async (importOriginal) => {
  const original = await importOriginal<typeof import('./leg-rows')>()
  return {
    ...original,
    readLegsByPosition: (...args: Parameters<typeof original.readLegsByPosition>) => {
      if (bulkRead.fail) throw new Error('simulated bulk leg read failure')
      return original.readLegsByPosition(...args)
    }
  }
})

beforeEach(() => {
  bulkRead.fail = false
})

// ── Background ──────────────────────────────────────────────────────────────────
// Valuation 2026-09-28 (New York noon). XYZ PMCC: $80 LEAPS expiring 2027-09-17 bought at $25,
// $110 short call expiring 2026-10-16 sold at $2.00, 1 contract — 18 DTE on the short.

const NOW = new Date('2026-09-28T16:00:00.000Z')
const LATER = new Date('2026-09-29T16:00:00.000Z')
const TWO_DAYS_LATER = new Date('2026-09-30T16:00:00.000Z')
const FOUR_DTE_NOW = new Date('2026-10-12T16:00:00.000Z')

const PMCC_ID = 'pos-xyz-pmcc'
const RULE = 'PMCC_ASSIGNMENT_RISK'
const SHORT_EXPIRATION = '2026-10-16'
const LEAPS_EXPIRATION = '2027-09-17'
const SHORT_OCC = occFor({
  ticker: 'XYZ',
  expiration: SHORT_EXPIRATION,
  strike: '110.0000',
  instrumentType: 'CALL'
})
const LEAPS_OCC = occFor({
  ticker: 'XYZ',
  expiration: LEAPS_EXPIRATION,
  strike: '80.0000',
  instrumentType: 'CALL'
})

const ABOVE_112_53 =
  'Stock is 2.3% above the $110.00 short-call strike — in the money, LEAPS would have to cover'

function seedPmccPosition(
  db: Database.Database,
  { id = PMCC_ID, status = 'ACTIVE' }: { id?: string; status?: string } = {}
): void {
  db.prepare(
    `INSERT INTO positions
       (id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at)
     VALUES (?, 'XYZ', 'PMCC', ?, 'PMCC_OPEN', '2026-09-14',
             '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z')`
  ).run(id, status)
}

/** The Background's opening legs: the $80 LEAPS and the $110 short call. */
function openingLegs(positionId: string): LegRecord[] {
  return [
    makePmccLeg(
      positionId,
      {
        legRole: 'LEAPS_OPEN',
        action: 'BUY',
        strike: '80.0000',
        expiration: LEAPS_EXPIRATION,
        fillDate: '2026-09-14',
        premiumPerContract: '25.0000'
      },
      0
    ),
    makePmccLeg(
      positionId,
      {
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: '110.0000',
        expiration: SHORT_EXPIRATION,
        fillDate: '2026-09-14',
        premiumPerContract: '2.0000'
      },
      1
    )
  ]
}

function seedBackground(db: Database.Database, id = PMCC_ID): void {
  seedPmccPosition(db, { id })
  insertLegs(db, openingLegs(id))
}

/** A roll pair under one chain; `side: 'short'` buys back the old leg, `'leaps'` sells it. */
function rollLegs(
  positionId: string,
  roll: {
    chain: string
    side: 'short' | 'leaps'
    from: { strike: string; expiration: string }
    to: { strike: string; expiration: string }
    fillDate: string
  }
): LegRecord[] {
  const short = roll.side === 'short'
  return [
    makePmccLeg(
      positionId,
      {
        legRole: 'ROLL_FROM',
        action: short ? 'BUY' : 'SELL',
        ...roll.from,
        fillDate: roll.fillDate,
        premiumPerContract: '3.0000',
        rollChainId: roll.chain
      },
      0
    ),
    makePmccLeg(
      positionId,
      {
        legRole: 'ROLL_TO',
        action: short ? 'SELL' : 'BUY',
        ...roll.to,
        fillDate: roll.fillDate,
        premiumPerContract: '2.5000',
        rollChainId: roll.chain
      },
      1
    )
  ]
}

interface RunInput {
  db: Database.Database
  now?: Date
  price?: string
  provider?: MarketDataProvider
  midBySymbol?: Record<string, string>
  fetchEarnings?: FetchEarnings
  logger?: ReturnType<typeof makeSpyLogger>
}

function run({
  db,
  now = NOW,
  price,
  provider,
  midBySymbol = {},
  fetchEarnings = inertEarnings(),
  logger = makeSpyLogger()
}: RunInput): Promise<unknown> {
  return evaluateAlerts({
    db,
    now,
    provider:
      provider ??
      stubProvider({ midBySymbol, priceByTicker: price === undefined ? {} : { XYZ: price } }),
    fetchEarnings,
    logger
  })
}

const rowsFor = (db: Database.Database, positionId: string, ruleCode?: string): AlertRow[] =>
  readAlertRows(db).filter(
    (r) => r.position_id === positionId && (ruleCode === undefined || r.rule_code === ruleCode)
  )

const openRule = (db: Database.Database, ruleCode = RULE): AlertRow | undefined =>
  rowsFor(db, PMCC_ID, ruleCode).find((r) => r.status === 'open')

describe('evaluateAlerts — PMCC short call is the evaluated leg (US-106)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  it('fires a medium PMCC_ASSIGNMENT_RISK alert from the short call and requests only its OCC', async () => {
    seedBackground(db)
    const provider = stubProvider({ priceByTicker: { XYZ: '112.53' } })

    await run({ db, provider })

    expect(openRule(db)).toMatchObject({ urgency: 'medium', summary: ABOVE_112_53 })
    expect(openRule(db, 'MANAGEMENT_WINDOW')?.summary).toBe(
      '18 DTE remaining — review for roll or close'
    )
    const requested = vi.mocked(provider.getOptionSnapshot).mock.calls.map(([symbol]) => symbol)
    expect(requested).toEqual([SHORT_OCC])
    expect(requested).not.toContain(LEAPS_OCC)
  })

  it('does not fire while the stock is more than 2% below the short strike', async () => {
    seedBackground(db)

    await run({ db, price: '107.70' })

    expect(rowsFor(db, PMCC_ID, RULE)).toEqual([])
    expect(openRule(db, 'MANAGEMENT_WINDOW')).toBeDefined()
  })

  it('evaluates EXPIRATION_IMMINENT on the 4-DTE short alongside assignment risk, never the LEAPS', async () => {
    seedBackground(db)

    await run({ db, now: FOUR_DTE_NOW, price: '112.53' })

    expect(openRule(db, 'EXPIRATION_IMMINENT')).toMatchObject({
      urgency: 'high',
      summary: 'Expires in 4 days at $110.00 strike'
    })
    expect(openRule(db)).toBeDefined()
    for (const row of rowsFor(db, PMCC_ID)) {
      expect(row.summary).not.toContain('$80.00')
      expect(row.summary).not.toContain(LEAPS_EXPIRATION)
    }
  })

  it('measures PROFIT_TARGET against the short entry premium: $2.00 sold, $0.80 mid → 60.0%', async () => {
    seedBackground(db)

    await run({ db, price: '100.00', midBySymbol: { [SHORT_OCC]: '0.8000' } })

    expect(openRule(db, 'PROFIT_TARGET')?.summary).toBe(
      '60.0% of max profit captured — consider closing'
    )
  })

  it('fires EARNINGS_PROXIMITY for earnings on or before the short expiration', async () => {
    seedBackground(db)

    await run({
      db,
      now: FOUR_DTE_NOW,
      price: '100.00',
      fetchEarnings: stubEarnings({ XYZ: { status: 'found', date: '2026-10-15' } })
    })

    expect(openRule(db, 'EARNINGS_PROXIMITY')?.summary).toBe(
      'Earnings in 3 days before your 2026-10-16 expiration'
    )
  })

  it('ignores earnings after the short expiration even though they fall before the LEAPS expiration', async () => {
    seedBackground(db)

    await run({
      db,
      now: FOUR_DTE_NOW,
      price: '100.00',
      fetchEarnings: stubEarnings({ XYZ: { status: 'found', date: '2026-10-20' } })
    })

    expect(openRule(db, 'EARNINGS_PROXIMITY')).toBeUndefined()
  })

  it('resolves without refiring when the short call is rolled to $115 / 2026-11-20 (US-104 service)', async () => {
    seedBackground(db)
    await run({ db, price: '112.53' })
    const fired = openRule(db)

    rollPmccShortCallPosition(db, PMCC_ID, {
      positionId: PMCC_ID,
      costToClosePerContract: 4.0,
      newPremiumPerContract: 3.5,
      newStrike: 115,
      newExpiration: '2026-11-20',
      fillDate: '2026-09-28'
    })
    await run({ db, now: LATER, price: '112.53' })

    const rows = rowsFor(db, PMCC_ID, RULE)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: fired?.id, status: 'resolved' })
    expect(rows[0].resolved_at).not.toBeNull()
  })

  it('follows the latest short-side roll through repeated rolls and a later LEAPS roll', async () => {
    seedBackground(db)
    insertLegs(db, [
      ...rollLegs(PMCC_ID, {
        chain: 'rc-short-1',
        side: 'short',
        from: { strike: '110.0000', expiration: SHORT_EXPIRATION },
        to: { strike: '115.0000', expiration: '2026-11-20' },
        fillDate: '2026-09-20'
      }),
      ...rollLegs(PMCC_ID, {
        chain: 'rc-short-2',
        side: 'short',
        from: { strike: '115.0000', expiration: '2026-11-20' },
        to: { strike: '111.0000', expiration: '2026-12-18' },
        fillDate: '2026-09-24'
      }),
      ...rollLegs(PMCC_ID, {
        chain: 'rc-leaps-1',
        side: 'leaps',
        from: { strike: '80.0000', expiration: LEAPS_EXPIRATION },
        to: { strike: '85.0000', expiration: '2028-01-21' },
        fillDate: '2026-09-26'
      })
    ])
    const provider = stubProvider({ priceByTicker: { XYZ: '112.53' } })

    await run({ db, provider })

    expect(openRule(db)?.summary).toBe(
      'Stock is 1.4% above the $111.00 short-call strike — in the money, LEAPS would have to cover'
    )
    expect(vi.mocked(provider.getOptionSnapshot).mock.calls.map(([symbol]) => symbol)).toEqual([
      occFor({
        ticker: 'XYZ',
        expiration: '2026-12-18',
        strike: '111.0000',
        instrumentType: 'CALL'
      })
    ])
  })

  it.each([
    ['SHORT_CALL_EXPIRED', 'EXPIRE'],
    ['SHORT_CALL_CLOSE', 'BUY'],
    ['SHORT_CALL_ASSIGNED', 'ASSIGN']
  ] as const)(
    'excludes a PMCC whose short call was closed by %s and resolves its prior alerts',
    async (legRole, action) => {
      seedBackground(db)
      await run({ db, price: '112.53' })
      expect(openRule(db)).toBeDefined()

      insertLegs(db, [
        makePmccLeg(PMCC_ID, {
          legRole,
          action,
          strike: '110.0000',
          expiration: SHORT_EXPIRATION,
          fillDate: '2026-09-28',
          premiumPerContract: '0.0000'
        })
      ])
      const provider = stubProvider({ priceByTicker: { XYZ: '118.80' } })
      await run({ db, now: LATER, provider })

      expect(rowsFor(db, PMCC_ID).every((r) => r.status === 'resolved')).toBe(true)
      expect(rowsFor(db, PMCC_ID, RULE)).toHaveLength(1)
      expect(provider.getOptionSnapshot).not.toHaveBeenCalled()
    }
  )

  it('becomes evaluable again when a later short call is opened', async () => {
    seedBackground(db)
    insertLegs(db, [
      makePmccLeg(PMCC_ID, {
        legRole: 'SHORT_CALL_EXPIRED',
        action: 'EXPIRE',
        strike: '110.0000',
        expiration: SHORT_EXPIRATION,
        fillDate: '2026-09-20',
        premiumPerContract: '0.0000'
      }),
      makePmccLeg(PMCC_ID, {
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: '120.0000',
        expiration: '2026-11-20',
        fillDate: '2026-09-25',
        premiumPerContract: '1.5000'
      })
    ])

    await run({ db, price: '118.80' })

    expect(openRule(db)?.summary).toBe(
      'Stock is 1.0% below the $120.00 short-call strike — approaching assignment'
    )
  })

  it('excludes an inactive PMCC position', async () => {
    seedPmccPosition(db, { status: 'CLOSED' })
    insertLegs(db, openingLegs(PMCC_ID))

    await run({ db, price: '118.80' })

    expect(rowsFor(db, PMCC_ID)).toEqual([])
  })

  it('skips a PMCC with no recorded legs without logging an error', async () => {
    seedPmccPosition(db)
    const logger = makeSpyLogger()

    await run({ db, price: '118.80', logger })

    expect(rowsFor(db, PMCC_ID)).toEqual([])
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('evaluateAlerts — PMCC_ASSIGNMENT_RISK lifecycle (US-106)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
    seedBackground(db)
  })

  it('dedupes while open, resolves on retreat to $106, and refires with a fresh id', async () => {
    await run({ db, price: '112.53' })
    const first = openRule(db)!
    await run({ db, now: LATER, price: '118.80' })

    const updated = openRule(db)!
    expect(rowsFor(db, PMCC_ID, RULE)).toHaveLength(1)
    expect(updated.id).toBe(first.id)
    expect(updated.triggered_at).toBe(first.triggered_at)
    expect(updated.summary).toBe(
      'Stock is 8.0% above the $110.00 short-call strike — in the money, LEAPS would have to cover'
    )

    await run({ db, now: TWO_DAYS_LATER, price: '106.00' })
    expect(rowsFor(db, PMCC_ID, RULE)).toEqual([
      expect.objectContaining({ id: first.id, status: 'resolved', resolved_at: expect.any(String) })
    ])

    const reentry = new Date('2026-10-01T16:00:00.000Z')
    await run({ db, now: reentry, price: '108.35' })
    const refired = openRule(db)!
    expect(refired.id).not.toBe(first.id)
    expect(refired.triggered_at).toBe(reentry.toISOString())
  })

  it('stays suppressed after dismissal while the condition holds, and rearms after it clears', async () => {
    await run({ db, price: '112.53' })
    const fired = openRule(db)!
    dismissAlert(db, fired.id, NOW.toISOString())

    await run({ db, now: LATER, price: '112.53' })
    expect(openRule(db)).toBeUndefined()
    expect(rowsFor(db, PMCC_ID, RULE)).toHaveLength(1)

    await run({ db, now: TWO_DAYS_LATER, price: '105.00' })
    await run({ db, now: new Date('2026-10-01T16:00:00.000Z'), price: '112.53' })
    expect(openRule(db)?.id).not.toBe(fired.id)
  })

  it.each([
    ['omitted', undefined],
    ['malformed', 'N/A']
  ])(
    'keeps the alert open with its previous summary when the quote is %s, and logs the skip',
    async (_label, price) => {
      await run({ db, price: '112.53' })
      const fired = openRule(db)!
      const logger = makeSpyLogger()

      await run({ db, now: LATER, price, logger })

      expect(openRule(db)).toMatchObject({ id: fired.id, summary: ABOVE_112_53 })
      expect(logger.debug).toHaveBeenCalledWith(
        { positionId: PMCC_ID, ruleCode: RULE, reason: 'missing_underlying_price' },
        'alert_rule_skipped'
      )
      expect(openRule(db, 'MANAGEMENT_WINDOW')?.summary).toBe(
        '17 DTE remaining — review for roll or close'
      )
    }
  )

  it('keeps the alert open when the quote fetch rejects', async () => {
    await run({ db, price: '112.53' })
    const fired = openRule(db)!
    const provider = stubProvider()
    vi.mocked(provider.getStockQuotes).mockRejectedValue(
      new MarketDataError('network_error', 'down')
    )

    await run({ db, now: LATER, provider })

    expect(openRule(db)).toMatchObject({ id: fired.id, summary: ABOVE_112_53 })
  })
})

describe('evaluateAlerts — PMCC selection failures are isolated (US-106)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Fill dates stored as BLOBs — SQLite's TEXT affinity keeps them as-is, so the ledger
   *  replay throws ordering them and the history no longer says whether the short is open. */
  function corruptLegs(positionId: string): void {
    db.prepare(`UPDATE legs SET fill_date = X'00' WHERE position_id = ?`).run(positionId)
  }

  function seedWheel(): void {
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: '2026-11-20'
    })
  }

  const priceByTicker = { XYZ: '112.53', ABC: '112.53', AAPL: '178.50' }

  it('preserves a broken PMCC’s open and dismissed alerts while healthy positions still evaluate', async () => {
    seedBackground(db)
    seedBackground(db, 'pos-abc-pmcc')
    db.prepare(`UPDATE positions SET ticker = 'ABC' WHERE id = 'pos-abc-pmcc'`).run()
    seedWheel()
    await run({ db, provider: stubProvider({ priceByTicker }) })
    const assignment = openRule(db)!
    const window = openRule(db, 'MANAGEMENT_WINDOW')!
    dismissAlert(db, window.id, NOW.toISOString())

    corruptLegs(PMCC_ID)
    const logger = makeSpyLogger()
    await run({ db, now: LATER, provider: stubProvider({ priceByTicker }), logger })

    expect(rowsFor(db, PMCC_ID, RULE)).toEqual([
      expect.objectContaining({ id: assignment.id, status: 'open' })
    ])
    expect(rowsFor(db, PMCC_ID, 'MANAGEMENT_WINDOW')).toEqual([
      expect.objectContaining({ id: window.id, status: 'dismissed', resolved_at: null })
    ])
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: PMCC_ID }),
      'alert_evaluation_failed'
    )
    expect(rowsFor(db, 'pos-abc-pmcc', RULE)).toEqual([
      expect.objectContaining({ status: 'open', summary: ABOVE_112_53 })
    ])
    expect(rowsFor(db, 'pos-aapl', 'STRIKE_PROXIMITY')).toEqual([
      expect.objectContaining({ status: 'open' })
    ])
  })

  it('keeps every PMCC’s alerts when the bulk leg read fails, while wheel positions proceed', async () => {
    seedBackground(db)
    seedWheel()
    await run({ db, provider: stubProvider({ priceByTicker }) })
    const assignment = openRule(db)!

    bulkRead.fail = true
    const logger = makeSpyLogger()
    await run({ db, now: LATER, provider: stubProvider({ priceByTicker }), logger })

    expect(rowsFor(db, PMCC_ID, RULE)).toEqual([
      expect.objectContaining({ id: assignment.id, status: 'open' })
    ])
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'alert_evaluation_failed')
    expect(rowsFor(db, 'pos-aapl', 'STRIKE_PROXIMITY')[0]).toMatchObject({
      status: 'open',
      last_evaluated_at: LATER.toISOString()
    })
  })
})

describe('evaluateAlerts — PMCC alongside wheel positions (US-106)', () => {
  it('enriches the queue with PMCC_OPEN, sorts HIGH before MED, and leaves wheel summaries unchanged', async () => {
    const db = makeTestDb()
    seedBackground(db)
    seedShortOptionAtPremium(db, {
      id: 'pos-aapl',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      strike: '180.0000',
      contracts: 1,
      entryPremium: '3.5000',
      expiration: '2026-11-20'
    })
    seedShortOptionAtPremium(db, {
      id: 'pos-msft',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.0000',
      contracts: 1,
      entryPremium: '5.0000',
      expiration: '2026-11-20'
    })

    await run({
      db,
      now: FOUR_DTE_NOW,
      provider: stubProvider({ priceByTicker: { XYZ: '112.53', AAPL: '178.50', MSFT: '415.00' } })
    })

    const xyz = listManagementQueue(db).filter((item) => item.ticker === 'XYZ')
    expect(xyz.map((item) => [item.phase, item.urgency])).toEqual([
      ['PMCC_OPEN', 'high'],
      ['PMCC_OPEN', 'medium']
    ])
    expect(rowsFor(db, 'pos-aapl').map((r) => [r.rule_code, r.summary])).toEqual([
      ['STRIKE_PROXIMITY', 'Stock is 0.8% below the $180.00 put strike — now in the money']
    ])
    expect(rowsFor(db, 'pos-msft')).toEqual([])
    expect(readAlertRows(db).filter((r) => r.rule_code === RULE)).toEqual([
      expect.objectContaining({ position_id: PMCC_ID })
    ])
  })
})
