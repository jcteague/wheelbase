// [US-116] scheduler-instance — the app's single polling scheduler, wired to the
// market-data port for the exchange session rather than to an optional broker.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type MarketStatus,
  type MarketStatusSource
} from '../integrations/market-data-provider'
import { decideNextCadenceMs, type CadencePolicy } from './polling-scheduler'
import { logger } from '../logger'

const { mockCreatePollingScheduler, mockMarketDataCreate, mockBrokerCreate } = vi.hoisted(() => ({
  mockCreatePollingScheduler: vi.fn(),
  mockMarketDataCreate: vi.fn(),
  mockBrokerCreate: vi.fn()
}))

vi.mock('./polling-scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./polling-scheduler')>()),
  createPollingScheduler: mockCreatePollingScheduler
}))

vi.mock('../integrations/market-data-factory', () => ({
  marketDataFactory: { create: mockMarketDataCreate }
}))

vi.mock('../integrations/broker-factory', () => ({
  brokerFactory: { create: mockBrokerCreate }
}))

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

/** A job that has no closed-market cadence: it parks until the next open. */
const PARKING_CADENCE: CadencePolicy = {
  kind: 'interval',
  marketOpenMs: 60_000,
  marketClosedMs: null
}

function providerRejecting(err: unknown): MarketStatusSource {
  return { getMarketStatus: vi.fn().mockRejectedValue(err) }
}

// The module wires its status source once, at import; the provider behind it is resolved
// per call, so one import serves every case. Re-importing under `vi.resetModules()` would
// hand the module a second copy of `MarketDataError` and break the `instanceof` it turns on.
let getStatusSource: () => MarketStatusSource

beforeAll(async () => {
  await import('./scheduler-instance')
  getStatusSource = mockCreatePollingScheduler.mock.calls[0][0] as () => MarketStatusSource
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scheduler-instance status source', () => {
  it('passes a live market status through unchanged', async () => {
    const status: MarketStatus = {
      isOpen: true,
      session: 'regular',
      nextOpen: '2026-01-02T14:30:00Z',
      nextClose: '2026-01-01T21:00:00Z'
    }
    mockMarketDataCreate.mockReturnValue({ getMarketStatus: vi.fn().mockResolvedValue(status) })

    expect(await getStatusSource().getMarketStatus()).toEqual(status)
  })

  it('degrades an unconfigured provider to a closed session, so jobs park instead of spinning', async () => {
    mockMarketDataCreate.mockReturnValue(
      providerRejecting(new MarketDataError('auth_failed', 'Alpaca credentials not configured'))
    )

    const status = await getStatusSource().getMarketStatus()

    expect(status).toMatchObject({ isOpen: false, session: 'closed' })
    expect(decideNextCadenceMs(PARKING_CADENCE, status)).toBeNull()
  })

  it('logs the degradation at debug, so an unconfigured install does not spam warnings', async () => {
    mockMarketDataCreate.mockReturnValue(
      providerRejecting(new MarketDataError('auth_failed', 'Alpaca credentials not configured'))
    )

    await getStatusSource().getMarketStatus()

    expect(logger.debug).toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('propagates a network failure, leaving the scheduler its own fallback branch', async () => {
    mockMarketDataCreate.mockReturnValue(
      providerRejecting(new MarketDataError('network_error', 'offline'))
    )

    await expect(getStatusSource().getMarketStatus()).rejects.toMatchObject({
      code: 'network_error'
    })
  })

  it('propagates a non-MarketDataError rather than reporting the market closed', async () => {
    mockMarketDataCreate.mockReturnValue(providerRejecting(new Error('boom')))

    await expect(getStatusSource().getMarketStatus()).rejects.toThrow('boom')
  })

  it('never constructs a broker — the session is a market fact', async () => {
    mockMarketDataCreate.mockReturnValue(
      providerRejecting(new MarketDataError('auth_failed', 'Alpaca credentials not configured'))
    )

    await getStatusSource().getMarketStatus()

    expect(mockBrokerCreate).not.toHaveBeenCalled()
  })
})
