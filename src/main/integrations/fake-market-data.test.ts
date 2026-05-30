import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FakeMarketDataProvider } from './fake-market-data'
import type { OptionSnapshot } from './market-data-provider'

describe('FakeMarketDataProvider — interface shape', () => {
  it('no longer exposes broker methods (getAccountInfo, getActivities, getMarketStatus)', () => {
    const provider = new FakeMarketDataProvider()
    // These broker methods must not exist on the slimmed MarketDataProvider
    expect((provider as unknown as Record<string, unknown>)['getAccountInfo']).toBeUndefined()
    expect((provider as unknown as Record<string, unknown>)['getActivities']).toBeUndefined()
    expect((provider as unknown as Record<string, unknown>)['getMarketStatus']).toBeUndefined()
  })
})

const SNAPSHOT: OptionSnapshot = {
  bid: '2.10',
  ask: '2.20',
  mid: '2.15',
  lastTrade: '2.18',
  openInterest: 1234,
  volume: 567,
  greeks: {
    delta: '-0.32',
    gamma: '0.04',
    theta: '-0.05',
    vega: '0.12'
  },
  impliedVolatility: '0.28',
  timestamp: '2026-04-29T15:30:00Z'
}

describe('FakeMarketDataProvider.getOptionSnapshot', () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    } else {
      process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = originalEnv
    }
  })

  it('returns snapshot from WHEELBASE_MOCK_OPTION_SNAPSHOTS env var', async () => {
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      AAPL260516P00180000: SNAPSHOT
    })

    const provider = new FakeMarketDataProvider()
    const result = await provider.getOptionSnapshot('AAPL260516P00180000')

    expect(result).toEqual(SNAPSHOT)
  })

  it('throws MarketDataError when symbol is not in env var', async () => {
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS

    const provider = new FakeMarketDataProvider()
    await expect(provider.getOptionSnapshot('AAPL260516P00180000')).rejects.toMatchObject({
      code: 'unknown'
    })
  })
})
