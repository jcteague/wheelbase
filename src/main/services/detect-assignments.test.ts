// [US-35] detect-assignments service
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrokerActivity, BrokerProvider } from '../integrations/broker-provider'
import { BrokerError } from '../integrations/broker-provider'
import { buildOccSymbol } from '../core/option-symbol'
import { logger } from '../logger'
import { makeTestDb } from '../test-utils'
import { createPosition } from './positions'
import { detectAssignments } from './detect-assignments'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

function makeBroker(activities: BrokerActivity[] = []): BrokerProvider {
  return {
    getAccountInfo: vi.fn(),
    getActivities: vi.fn().mockResolvedValue(activities),
    getMarketStatus: vi.fn()
  } as unknown as BrokerProvider
}

function makeActivity(symbol: string, activityId = 'act-001'): BrokerActivity {
  return {
    activityId,
    activityType: 'OPASN',
    symbol,
    qty: 100,
    price: '180.0000',
    transactionTime: '2026-01-19T20:00:00.000Z'
  }
}

const AAPL_SYMBOL = buildOccSymbol({
  ticker: 'AAPL',
  expiration: '2026-01-19',
  strike: '180.0000',
  instrumentType: 'PUT'
})

function makeAaplPosition(db: ReturnType<typeof makeTestDb>): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: '2026-01-19',
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: '2026-01-03'
  })
}

describe('detectAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('watermark handling', () => {
    it('defaults watermark to approximately 24h ago when no app_settings entry exists', async () => {
      const db = makeTestDb()
      const broker = makeBroker([])

      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      const since = (broker.getActivities as ReturnType<typeof vi.fn>).mock.calls[0][0].since
      const sinceMs = new Date(since).getTime()
      const now = Date.now()
      expect(sinceMs).toBeGreaterThanOrEqual(now - 24 * 60 * 60 * 1000 - 5000)
      expect(sinceMs).toBeLessThanOrEqual(now - 24 * 60 * 60 * 1000 + 5000)
    })

    it('uses stored watermark from app_settings when available', async () => {
      const db = makeTestDb()
      const watermark = '2026-01-15T10:00:00.000Z'
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('assignments_last_poll_at:paper', ?, ?)`
      ).run(watermark, new Date().toISOString())

      const broker = makeBroker([])
      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(broker.getActivities).toHaveBeenCalledWith({ type: 'OPASN', since: watermark })
    })

    it('calls brokerProvider.getActivities with type: OPASN', async () => {
      const db = makeTestDb()
      const broker = makeBroker([])

      await detectAssignments({ db, brokerProvider: broker, env: 'live' })

      expect(broker.getActivities).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPASN' }))
    })
  })

  describe('activity matching', () => {
    it('creates a pending_assignments row when activity symbol matches an open CSP leg', async () => {
      const db = makeTestDb()
      const { position, leg } = makeAaplPosition(db)
      const broker = makeBroker([makeActivity(AAPL_SYMBOL)])

      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(1)
      expect(result.skipped).toBe(0)

      const row = db
        .prepare(`SELECT * FROM pending_assignments WHERE activity_id = 'act-001'`)
        .get() as Record<string, unknown>
      expect(row).toBeTruthy()
      expect(row.position_id).toBe(position.id)
      expect(row.leg_id).toBe(leg.id)
      expect(row.status).toBe('pending')
      expect(row.broker_symbol).toBe(AAPL_SYMBOL)
    })

    it('logs INFO "Assignment detected" when a match is found', async () => {
      const db = makeTestDb()
      makeAaplPosition(db)
      const broker = makeBroker([makeActivity(AAPL_SYMBOL)])

      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'AAPL' }),
        expect.stringContaining('Assignment detected')
      )
    })

    it('skips activity with no matching CSP leg and logs DEBUG', async () => {
      const db = makeTestDb()
      const unknownSymbol = 'GOOG260119P00150000'
      const broker = makeBroker([makeActivity(unknownSymbol)])

      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(0)
      expect(result.skipped).toBe(1)
      const rows = db.prepare(`SELECT * FROM pending_assignments`).all()
      expect(rows).toHaveLength(0)
      expect(vi.mocked(logger.debug)).toHaveBeenCalled()
    })

    it('is a no-op when the same activity_id is submitted a second time', async () => {
      const db = makeTestDb()
      makeAaplPosition(db)
      const broker = makeBroker([makeActivity(AAPL_SYMBOL)])

      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })
      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(0)
      const rows = db.prepare(`SELECT * FROM pending_assignments`).all()
      expect(rows).toHaveLength(1)
    })

    it('creates one pending row per matching position when two CSPs share the same OCC symbol', async () => {
      // A trader may legitimately hold two CSP positions on the same
      // ticker/strike/expiration (e.g. two sub-strategies, partial fills tracked
      // separately). A single OPASN must produce a pending_assignments row for
      // each matching open leg — losing the duplicate silently breaks the wheel.
      const db = makeTestDb()
      const first = makeAaplPosition(db)
      const second = makeAaplPosition(db)
      expect(first.position.id).not.toBe(second.position.id)

      const broker = makeBroker([makeActivity(AAPL_SYMBOL, 'act-shared')])
      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(2)
      expect(result.skipped).toBe(0)

      const rows = db
        .prepare(`SELECT position_id, leg_id FROM pending_assignments WHERE activity_id = ?`)
        .all('act-shared') as Array<{ position_id: string; leg_id: string }>
      expect(rows).toHaveLength(2)

      const positionIds = rows.map((r) => r.position_id).sort()
      expect(positionIds).toEqual([first.position.id, second.position.id].sort())

      const legIds = rows.map((r) => r.leg_id).sort()
      expect(legIds).toEqual([first.leg.id, second.leg.id].sort())
    })

    it('creates multiple rows for multiple OPASN events in one batch', async () => {
      const db = makeTestDb()
      makeAaplPosition(db)
      createPosition(db, {
        ticker: 'TSLA',
        strike: 200,
        expiration: '2026-01-19',
        contracts: 1,
        premiumPerContract: 5.0,
        fillDate: '2026-01-03'
      })

      const tslaSymbol = buildOccSymbol({
        ticker: 'TSLA',
        expiration: '2026-01-19',
        strike: '200.0000',
        instrumentType: 'PUT'
      })

      const broker = makeBroker([
        makeActivity(AAPL_SYMBOL, 'act-001'),
        makeActivity(tslaSymbol, 'act-002')
      ])

      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(2)
      expect(result.skipped).toBe(0)
      const rows = db.prepare(`SELECT * FROM pending_assignments`).all()
      expect(rows).toHaveLength(2)
    })
  })

  describe('watermark update', () => {
    it('updates watermark to approximately now after a successful batch even when some activities are skipped', async () => {
      const db = makeTestDb()
      makeAaplPosition(db)
      const broker = makeBroker([
        makeActivity(AAPL_SYMBOL, 'act-001'),
        makeActivity('UNKNOWN260119P00100000', 'act-002')
      ])

      const before = Date.now()
      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })
      const after = Date.now()

      const row = db
        .prepare(`SELECT value FROM app_settings WHERE key = 'assignments_last_poll_at:paper'`)
        .get() as { value: string } | undefined
      expect(row).toBeTruthy()
      const watermarkMs = new Date(row!.value).getTime()
      expect(watermarkMs).toBeGreaterThanOrEqual(before - 100)
      expect(watermarkMs).toBeLessThanOrEqual(after + 100)
    })

    it('uses poll-start time as the watermark — activities arriving during the await are not skipped on next poll', async () => {
      // Race protection: an OPASN whose transactionTime falls between pollStart
      // and the moment getActivities() returns must be visible to the NEXT
      // poll. That requires the watermark to be the pre-await timestamp, not
      // wall clock after the response lands.
      const db = makeTestDb()
      makeAaplPosition(db)

      const BROKER_LATENCY_MS = 30
      const broker = {
        getAccountInfo: vi.fn(),
        getActivities: vi.fn().mockImplementation(
          () =>
            new Promise<BrokerActivity[]>((resolve) => {
              // Simulate broker latency: real wall clock advances during the await.
              setTimeout(() => resolve([]), BROKER_LATENCY_MS)
            })
        ),
        getMarketStatus: vi.fn()
      } as unknown as BrokerProvider

      const pollStartCeilingMs = Date.now()
      await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      const row = db
        .prepare(`SELECT value FROM app_settings WHERE key = 'assignments_last_poll_at:paper'`)
        .get() as { value: string } | undefined
      expect(row).toBeTruthy()
      const watermarkMs = new Date(row!.value).getTime()

      // Bug exposure: if the watermark is captured AFTER the await, it would be
      // pollStartCeilingMs + ~BROKER_LATENCY_MS. Any OPASN whose transactionTime
      // landed during that window would be permanently skipped on the next poll.
      // A small tolerance (5ms) absorbs scheduler jitter while still catching
      // anything close to the 30ms latency we injected.
      expect(watermarkMs).toBeLessThanOrEqual(pollStartCeilingMs + 5)
    })
  })

  describe('error handling', () => {
    it('logs WARN, inserts no rows, and does not update watermark on BrokerError(network_error)', async () => {
      const db = makeTestDb()
      const broker = {
        getAccountInfo: vi.fn(),
        getActivities: vi.fn().mockRejectedValue(new BrokerError('network_error', 'Network error')),
        getMarketStatus: vi.fn()
      } as unknown as BrokerProvider

      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(0)
      expect(result.skipped).toBe(0)
      expect(vi.mocked(logger.warn)).toHaveBeenCalled()
      const rows = db.prepare(`SELECT * FROM pending_assignments`).all()
      expect(rows).toHaveLength(0)
      const watermark = db
        .prepare(`SELECT value FROM app_settings WHERE key = 'assignments_last_poll_at:paper'`)
        .get()
      expect(watermark).toBeUndefined()
    })

    it('surfaces BrokerError(auth_failed) as a typed result for scheduler back-off decisions', async () => {
      const db = makeTestDb()
      const broker = {
        getAccountInfo: vi.fn(),
        getActivities: vi.fn().mockRejectedValue(new BrokerError('auth_failed', 'Unauthorized')),
        getMarketStatus: vi.fn()
      } as unknown as BrokerProvider

      const result = await detectAssignments({ db, brokerProvider: broker, env: 'paper' })

      expect(result.detected).toBe(0)
      expect(result.skipped).toBe(0)
      expect((result as Record<string, unknown>).brokerError).toBeDefined()
      expect(((result as Record<string, unknown>).brokerError as BrokerError).code).toBe(
        'auth_failed'
      )
    })
  })
})
