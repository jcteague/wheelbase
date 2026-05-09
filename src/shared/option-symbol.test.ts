import { describe, it, expect } from 'vitest'
import { buildOccSymbol } from './option-symbol'

describe('buildOccSymbol', () => {
  it('returns standard OCC string for whole-dollar PUT', () => {
    const symbol = buildOccSymbol({
      ticker: 'AAPL',
      expiration: '2026-05-16',
      strike: 180,
      instrumentType: 'PUT'
    })
    expect(symbol).toBe('AAPL260516P00180000')
  })

  it('returns standard OCC string for whole-dollar CALL', () => {
    const symbol = buildOccSymbol({
      ticker: 'MSFT',
      expiration: '2026-05-02',
      strike: 420,
      instrumentType: 'CALL'
    })
    expect(symbol).toBe('MSFT260502C00420000')
  })

  it('formats fractional strikes', () => {
    const symbol = buildOccSymbol({
      ticker: 'AAPL',
      expiration: '2026-05-16',
      strike: 180.5,
      instrumentType: 'PUT'
    })
    expect(symbol).toContain('00180500')
  })

  it('formats four-decimal strikes', () => {
    const symbol = buildOccSymbol({
      ticker: 'AAPL',
      expiration: '2026-05-16',
      strike: '180.0050',
      instrumentType: 'PUT'
    })
    expect(symbol).toContain('00180005')
  })

  it('uppercases the ticker', () => {
    const symbol = buildOccSymbol({
      ticker: 'aapl',
      expiration: '2026-05-16',
      strike: 180,
      instrumentType: 'PUT'
    })
    expect(symbol.startsWith('AAPL')).toBe(true)
  })

  it('trims surrounding whitespace from ticker', () => {
    const symbol = buildOccSymbol({
      ticker: '  AAPL  ',
      expiration: '2026-05-16',
      strike: 180,
      instrumentType: 'PUT'
    })
    expect(symbol.startsWith('AAPL')).toBe(true)
    expect(symbol.startsWith('  AAPL')).toBe(false)
  })

  it('throws on empty ticker', () => {
    expect(() =>
      buildOccSymbol({
        ticker: '',
        expiration: '2026-05-16',
        strike: 180,
        instrumentType: 'PUT'
      })
    ).toThrow()
  })

  it('throws on malformed expiration', () => {
    expect(() =>
      buildOccSymbol({
        ticker: 'AAPL',
        expiration: '2026/05/16',
        strike: 180,
        instrumentType: 'PUT'
      })
    ).toThrow()
  })

  it('throws on zero strike', () => {
    expect(() =>
      buildOccSymbol({
        ticker: 'AAPL',
        expiration: '2026-05-16',
        strike: 0,
        instrumentType: 'PUT'
      })
    ).toThrow()
  })

  it('throws on negative strike', () => {
    expect(() =>
      buildOccSymbol({
        ticker: 'AAPL',
        expiration: '2026-05-16',
        strike: -1,
        instrumentType: 'PUT'
      })
    ).toThrow()
  })

  it('throws on instrumentType STOCK', () => {
    expect(() =>
      buildOccSymbol({
        ticker: 'AAPL',
        expiration: '2026-05-16',
        strike: 180,
        instrumentType: 'STOCK'
      })
    ).toThrow()
  })
})
