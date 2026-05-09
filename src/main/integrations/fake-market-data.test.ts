import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FakeMarketDataProvider } from './fake-market-data'
import type { OptionSnapshot } from './market-data-provider'

describe('FakeMarketDataProvider.getOptionSnapshots', () => {
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

  it('returns entries from WHEELBASE_MOCK_OPTION_SNAPSHOTS env var', async () => {
    const snapshot: OptionSnapshot = {
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
        vega: '0.12',
        iv: '0.28'
      },
      timestamp: '2026-04-29T15:30:00Z'
    }
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      AAPL260516P00180000: snapshot
    })

    const provider = new FakeMarketDataProvider()
    const result = await provider.getOptionSnapshots(['AAPL260516P00180000'])

    expect(result.size).toBe(1)
    expect(result.get('AAPL260516P00180000')).toEqual(snapshot)
  })

  it('omits unknown symbols', async () => {
    const snapshot: OptionSnapshot = {
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
        vega: '0.12',
        iv: '0.28'
      },
      timestamp: '2026-04-29T15:30:00Z'
    }
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      AAPL260516P00180000: snapshot
    })

    const provider = new FakeMarketDataProvider()
    const result = await provider.getOptionSnapshots(['AAPL260516P00180000', 'ZZZZ260516P00100000'])

    expect(result.size).toBe(1)
    expect(result.has('AAPL260516P00180000')).toBe(true)
    expect(result.has('ZZZZ260516P00100000')).toBe(false)
  })

  it('returns empty Map when env var is unset', async () => {
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS

    const provider = new FakeMarketDataProvider()
    const result = await provider.getOptionSnapshots(['AAPL260516P00180000'])

    expect(result.size).toBe(0)
  })
})
