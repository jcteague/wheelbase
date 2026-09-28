import { describe, expect, it } from 'vitest'

import { createIvRunState } from './iv-run-state'

// [US-121] Process-only absence reasons: pending / failed / no_market_data. Never persisted.
describe('createIvRunState', () => {
  it('knows nothing about a ticker on a fresh instance', () => {
    expect(createIvRunState().get('AAPL')).toBeUndefined()
  })

  it('upper-cases tickers on write and read', () => {
    const state = createIvRunState()
    state.markPending('aapl')
    expect(state.get('AAPL')).toBe('pending')
    expect(state.get('aapl')).toBe('pending')
  })

  it('clears the entry when a run collects', () => {
    const state = createIvRunState()
    state.markPending('AAPL')
    state.settle('AAPL', { status: 'collected', readings: 3, gaps: 0 })
    expect(state.get('AAPL')).toBeUndefined()
  })

  it('clears the entry when a run finds the series up to date', () => {
    const state = createIvRunState()
    state.markPending('AAPL')
    state.settle('AAPL', { status: 'up_to_date' })
    expect(state.get('AAPL')).toBeUndefined()
  })

  it('records a failed run', () => {
    const state = createIvRunState()
    state.markPending('AAPL')
    state.settle('AAPL', { status: 'failed' })
    expect(state.get('AAPL')).toBe('failed')
  })

  it('records a run with no market-data credentials', () => {
    const state = createIvRunState()
    state.markPending('AAPL')
    state.settle('AAPL', { status: 'no_market_data' })
    expect(state.get('AAPL')).toBe('no_market_data')
  })

  it('marks every remaining target when the batch loses market data, and a new run supersedes it', () => {
    const state = createIvRunState()
    state.markNoMarketData(['MSFT', 'nvda'])
    expect(state.get('MSFT')).toBe('no_market_data')
    expect(state.get('NVDA')).toBe('no_market_data')

    state.markPending('MSFT')
    expect(state.get('MSFT')).toBe('pending')

    state.settle('MSFT', { status: 'collected', readings: 1, gaps: 0 })
    expect(state.get('MSFT')).toBeUndefined()
    expect(state.get('NVDA')).toBe('no_market_data')
  })

  it('keeps separate state per instance', () => {
    const first = createIvRunState()
    const second = createIvRunState()
    first.markPending('AAPL')
    expect(second.get('AAPL')).toBeUndefined()
  })
})
