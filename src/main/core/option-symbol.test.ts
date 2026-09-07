import { describe, it, expect } from 'vitest'
import { buildOccSymbol, parseOccSymbol } from '../../shared/option-symbol'

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

describe('parseOccSymbol', () => {
  it('parses a put symbol into its identity fields', () => {
    expect(parseOccSymbol('AAPL261009P00320000')).toEqual({
      underlying: 'AAPL',
      contractId: 'AAPL261009P00320000',
      strike: '320.0000',
      expiration: '2026-10-09',
      contractType: 'put'
    })
  })

  it('parses a call symbol', () => {
    expect(parseOccSymbol('SPY260604C00750000')).toEqual({
      underlying: 'SPY',
      contractId: 'SPY260604C00750000',
      strike: '750.0000',
      expiration: '2026-06-04',
      contractType: 'call'
    })
  })

  it('parses fractional strikes to four decimals', () => {
    expect(parseOccSymbol('NVDA261016P00012500')?.strike).toBe('12.5000')
  })

  it('returns null for a non-OCC string', () => {
    expect(parseOccSymbol('NOT_AN_OCC')).toBeNull()
  })

  it('returns null for a prefixed OCC string', () => {
    expect(parseOccSymbol('O:AAPL261009P00320000')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseOccSymbol('')).toBeNull()
  })
})
