// Property test: the OCC symbol builder and parser are inverses for any contract whose
// strike is representable in thousandths.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { buildOccSymbol, parseOccSymbol } from './option-symbol'
import { isoDay, ticker } from './test-fixtures/arbitraries'

const OCC_SUFFIX_LENGTH = 15 // YYMMDD + P|C + 8-digit strike

/** Strikes in whole thousandths — the resolution the OCC format encodes. */
const occStrike = fc
  .integer({ min: 1, max: 5_000_000 })
  .map((n) => new Decimal(n).div(1000).toString())

describe('buildOccSymbol ∘ parseOccSymbol', () => {
  it('round-trips ticker, expiration, strike and contract type', () => {
    fc.assert(
      fc.property(
        ticker,
        isoDay,
        occStrike,
        fc.constantFrom('PUT', 'CALL'),
        (symbol, expiration, strike, instrumentType) => {
          const occ = buildOccSymbol({ ticker: symbol, expiration, strike, instrumentType })
          expect(occ).toHaveLength(symbol.length + OCC_SUFFIX_LENGTH)
          expect(parseOccSymbol(occ)).toEqual({
            underlying: symbol,
            contractId: occ,
            strike: new Decimal(strike).toFixed(4),
            expiration,
            contractType: instrumentType === 'PUT' ? 'put' : 'call'
          })
        }
      )
    )
  })

  it('builds the same symbol for a ticker regardless of case and surrounding whitespace', () => {
    fc.assert(
      fc.property(
        ticker,
        isoDay,
        occStrike,
        fc.constantFrom('PUT', 'CALL'),
        (symbol, expiration, strike, instrumentType) => {
          const canonical = buildOccSymbol({ ticker: symbol, expiration, strike, instrumentType })
          const sloppy = buildOccSymbol({
            ticker: ` ${symbol.toLowerCase()} `,
            expiration,
            strike,
            instrumentType
          })
          expect(sloppy).toBe(canonical)
        }
      )
    )
  })

  it('parsing any string either returns null or an identity that rebuilds the same symbol', () => {
    const nearMiss = fc
      .tuple(
        ticker,
        isoDay,
        occStrike,
        fc.constantFrom('PUT', 'CALL'),
        fc.nat(),
        fc.string({ minLength: 1, maxLength: 1 })
      )
      .map(([symbol, expiration, strike, instrumentType, at, replacement]) => {
        const occ = buildOccSymbol({ ticker: symbol, expiration, strike, instrumentType })
        const index = at % occ.length
        return occ.slice(0, index) + replacement + occ.slice(index + 1)
      })
    fc.assert(
      fc.property(fc.oneof(fc.string(), nearMiss), (candidate) => {
        const parsed = parseOccSymbol(candidate)
        if (parsed === null) return
        expect(
          buildOccSymbol({
            ticker: parsed.underlying,
            expiration: parsed.expiration,
            strike: parsed.strike,
            instrumentType: parsed.contractType === 'put' ? 'PUT' : 'CALL'
          })
        ).toBe(candidate)
      })
    )
  })
})
