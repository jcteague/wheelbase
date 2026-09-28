// [US-100/US-121] The single-ticker collection path a watchlist add or a new position fires.
//
// Every test here pins a guarantee the callers depend on but cannot observe: `collect`
// is detached with `void`, so a rejection would become an unhandled rejection and the
// add it was fired from would look broken for a reason the trader could not see.
import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeMarketDataProvider, setFakeIvSeries } from '../integrations/fake-market-data'
import { MarketDataError, type MarketDataProvider } from '../integrations/market-data-provider'
import { logger } from '../logger'
import { makeTestDb, seedTradingCalendar, seedWatchlist } from '../test-utils'
import { collectIvHistory, type IvHistoryTickerOutcome } from './iv-history'
import { createIvRunState, type IvRunState } from './iv-run-state'
import { createIvrOnDemand, type IvrOnDemand } from './ivr-on-demand'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./iv-history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./iv-history')>()
  return { ...actual, collectIvHistory: vi.fn(actual.collectIvHistory) }
})

/** Friday 2026-09-25 17:30 ET — after the close, so Friday is the newest completed session. */
const FRIDAY_EVENING = '2026-09-25T21:30:00.000Z'

function makeDb(): Database.Database {
  const db = makeTestDb()
  seedTradingCalendar(db, '2025-06-01', '2027-12-31')
  return db
}

type PortHarness = {
  port: IvrOnDemand
  runState: IvRunState
  onSettled: ReturnType<typeof vi.fn>
}

function makePort(
  db: Database.Database,
  opts: { getProvider?: () => MarketDataProvider } = {}
): PortHarness {
  const onSettled = vi.fn()
  const runState = createIvRunState()
  const port = createIvrOnDemand({
    db,
    logger,
    runState,
    getProvider: opts.getProvider ?? (() => new FakeMarketDataProvider()),
    clock: { now: () => new Date(FRIDAY_EVENING) },
    onSettled
  })
  return { port, runState, onSettled }
}

function programOutcome(outcome: IvHistoryTickerOutcome): void {
  vi.mocked(collectIvHistory).mockResolvedValueOnce(outcome)
}

beforeEach(() => {
  vi.clearAllMocks()
  setFakeIvSeries({})
})

describe('createIvrOnDemand', () => {
  it('collects exactly the given ticker and fires onSettled once it settles', async () => {
    const db = makeDb()
    const { port, onSettled } = makePort(db)
    programOutcome({ status: 'collected', readings: 253, gaps: 0 })

    await port.collect('msft')

    expect(collectIvHistory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(collectIvHistory).mock.calls[0][0]).toMatchObject({
      ticker: 'MSFT',
      now: new Date(FRIDAY_EVENING)
    })
    expect(onSettled).toHaveBeenCalledWith('MSFT')
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'MSFT' }),
      'ivr_on_demand_collected'
    )
  })

  // Every settle can change the card: pending → reading, → insufficient_history (an up-to-date
  // but sparse series), → failed, → no_market_data. Without the push the card stays on "…".
  it.each<IvHistoryTickerOutcome>([
    { status: 'up_to_date' },
    { status: 'failed' },
    { status: 'no_market_data' }
  ])('fires onSettled on $status too', async (outcome) => {
    const db = makeDb()
    const { port, onSettled } = makePort(db)
    programOutcome(outcome)

    await port.collect('MSFT')

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('MSFT')
  })

  it('never touches the batch targets', async () => {
    const db = makeDb()
    seedWatchlist(db, ['KO'])
    const { port } = makePort(db)

    await port.collect('AAPL')

    expect(vi.mocked(collectIvHistory).mock.calls.map(([input]) => input.ticker)).toEqual(['AAPL'])
  })

  it('awaits the calendar refresh before collecting on a fresh install', async () => {
    const db = makeTestDb()
    const provider = new FakeMarketDataProvider()
    const getMarketCalendar = vi.spyOn(provider, 'getMarketCalendar')
    const { port } = makePort(db, { getProvider: () => provider })

    await port.collect('MSFT')

    expect(getMarketCalendar).toHaveBeenCalled()
    expect(getMarketCalendar.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(collectIvHistory).mock.invocationCallOrder[0]
    )
    expect(vi.mocked(collectIvHistory).mock.calls[0][0].calendar.sessions.length).toBeGreaterThan(
      253
    )
  })

  it('resolves and logs an error when the collection rejects', async () => {
    const db = makeDb()
    const { port, runState, onSettled } = makePort(db)
    db.exec('DROP TABLE iv30_reading')

    await expect(port.collect('MSFT')).resolves.toBeUndefined()

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('MSFT')
    expect(runState.get('MSFT')).toBe('failed')
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'MSFT', err: expect.any(Error) }),
      'ivr_on_demand_failed'
    )
  })
})

describe('createIvrOnDemand — run state', () => {
  it('marks the ticker pending synchronously, before the first await', () => {
    const db = makeDb()
    const { port, runState } = makePort(db)

    const pending = port.collect('msft')

    expect(runState.get('MSFT')).toBe('pending')
    return pending
  })

  it.each<[IvHistoryTickerOutcome, string | undefined]>([
    [{ status: 'collected', readings: 1, gaps: 0 }, undefined],
    [{ status: 'up_to_date' }, undefined],
    [{ status: 'failed' }, 'failed'],
    [{ status: 'no_market_data' }, 'no_market_data']
  ])('settles %o to %s', async (outcome, expected) => {
    const db = makeDb()
    const { port, runState } = makePort(db)
    programOutcome(outcome)

    await port.collect('MSFT')

    expect(runState.get('MSFT')).toBe(expected)
  })

  it('settles no_market_data when the provider cannot be built, without rejecting', async () => {
    const db = makeDb()
    const { port, runState, onSettled } = makePort(db, {
      getProvider: () => {
        throw new Error('no market-data credentials')
      }
    })

    await expect(port.collect('MSFT')).resolves.toBeUndefined()

    expect(runState.get('MSFT')).toBe('no_market_data')
    expect(collectIvHistory).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledExactlyOnceWith('MSFT')
  })

  it('settles no_market_data when a fresh install cannot fetch the calendar for want of credentials', async () => {
    // No cached calendar: without credentials the calendar fetch is the first call to fail.
    const db = makeTestDb()
    const provider = new FakeMarketDataProvider()
    vi.spyOn(provider, 'getMarketCalendar').mockRejectedValue(
      new MarketDataError('auth_failed', 'no market-data credentials')
    )
    const { port, runState, onSettled } = makePort(db, { getProvider: () => provider })

    await port.collect('MSFT')

    expect(runState.get('MSFT')).toBe('no_market_data')
    expect(collectIvHistory).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledExactlyOnceWith('MSFT')
  })
})
