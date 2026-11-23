import { describe, expect, it } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import {
  LEAPS_PRESET,
  SHORT_PRESET,
  chainNoticeMessage,
  chainWindow,
  deriveChainNotice,
  filterCallChain,
  formatContractOption,
  strikeBounds,
  type ShortCallChainBounds
} from './pmcc-entry'

const TODAY = new Date(2026, 8, 14)
const NOW = new Date('2026-09-14T15:00:00Z')

function quote(overrides: Partial<OptionChainQuote> & { delta?: string | null }): OptionChainQuote {
  const { delta = '0.80', ...rest } = overrides
  return {
    contractId: 'XYZ270917C00080000',
    strike: '80.0000',
    expiration: '2027-09-17',
    contractType: 'call',
    bid: '24.80',
    ask: '25.20',
    mid: '25.00',
    lastTrade: '25.00',
    openInterest: 100,
    volume: 10,
    ...(delta === null
      ? {}
      : { greeks: { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.3000' } }),
    timestamp: '2026-09-14T14:59:00Z',
    ...rest
  }
}

const LEAPS_FIXTURE = quote({})

const LEAPS_BOUNDS: ShortCallChainBounds = {
  expirationBefore: '2028-01-21',
  strikeAbove: '85.0000'
}

describe('filterCallChain', () => {
  it('keeps a Δ 0.80 call for the LEAPS preset and drops 0.60 and 0.90', () => {
    const kept = quote({ contractId: 'KEEP', delta: '0.80' })
    const low = quote({ contractId: 'LOW', delta: '0.60' })
    const high = quote({ contractId: 'HIGH', delta: '0.90' })

    expect(filterCallChain([low, kept, high], LEAPS_PRESET).map((q) => q.contractId)).toEqual([
      'KEEP'
    ])
  })

  it('keeps a contract without greeks, after the in-band contracts', () => {
    const noGreeks = quote({ contractId: 'NO_GREEKS', delta: null })
    const kept = quote({ contractId: 'KEEP', delta: '0.75' })

    expect(filterCallChain([noGreeks, kept], LEAPS_PRESET).map((q) => q.contractId)).toEqual([
      'KEEP',
      'NO_GREEKS'
    ])
  })

  it('reads a negative delta by its absolute value', () => {
    const oddlySigned = quote({ contractId: 'NEG', delta: '-0.30' })

    expect(filterCallChain([oddlySigned], SHORT_PRESET).map((q) => q.contractId)).toEqual(['NEG'])
  })

  it('retains an out-of-band Δ 0.60 call in place only when it is the kept contract', () => {
    const low = quote({ contractId: 'LOW', delta: '0.60' })
    const kept = quote({ contractId: 'KEEP', delta: '0.80' })

    expect(filterCallChain([low, kept], LEAPS_PRESET).map((q) => q.contractId)).toEqual(['KEEP'])
    expect(
      filterCallChain([low, kept], LEAPS_PRESET, { keepContractId: 'LOW' }).map((q) => q.contractId)
    ).toEqual(['LOW', 'KEEP'])
  })

  it('drops an adjusted-root contract whose OCC root is not the underlying', () => {
    const standard = quote({ contractId: 'XYZ270917C00080000' })
    const adjusted = quote({ contractId: 'XYZ1270917C00080000' })
    const unparseable = quote({ contractId: 'NOT-AN-OCC-SYMBOL' })

    expect(
      filterCallChain([adjusted, standard, unparseable], LEAPS_PRESET, {
        underlying: 'XYZ'
      }).map((q) => q.contractId)
    ).toEqual(['XYZ270917C00080000'])
  })

  it('drops an adjusted-root contract even when it is the kept contract', () => {
    const adjusted = quote({ contractId: 'XYZ1270917C00080000' })

    expect(
      filterCallChain([adjusted], LEAPS_PRESET, {
        underlying: 'XYZ',
        keepContractId: 'XYZ1270917C00080000'
      })
    ).toEqual([])
  })
})

describe('filterCallChain with LEAPS bounds', () => {
  const inBounds = { strike: '118.0000', expiration: '2027-08-20', delta: '0.30' }

  it('drops a strike at or below the LEAPS strike and keeps one above it', () => {
    const atLeaps = quote({ ...inBounds, contractId: 'AT', strike: '85.0000' })
    const belowLeaps = quote({ ...inBounds, contractId: 'BELOW', strike: '80.0000' })
    const above = quote({ ...inBounds, contractId: 'ABOVE' })

    expect(
      filterCallChain([atLeaps, belowLeaps, above], SHORT_PRESET, { bounds: LEAPS_BOUNDS }).map(
        (q) => q.contractId
      )
    ).toEqual(['ABOVE'])
  })

  it('drops an expiration on or after the LEAPS expiration and keeps one before it', () => {
    const onLeaps = quote({ ...inBounds, contractId: 'ON', expiration: '2028-01-21' })
    const afterLeaps = quote({ ...inBounds, contractId: 'AFTER', expiration: '2028-02-18' })
    const before = quote({ ...inBounds, contractId: 'BEFORE' })

    expect(
      filterCallChain([onLeaps, afterLeaps, before], SHORT_PRESET, { bounds: LEAPS_BOUNDS }).map(
        (q) => q.contractId
      )
    ).toEqual(['BEFORE'])
  })

  it('drops the kept contract when it breaks a bound', () => {
    const kept = quote({ ...inBounds, contractId: 'KEPT', strike: '80.0000' })

    expect(
      filterCallChain([kept], SHORT_PRESET, { keepContractId: 'KEPT', bounds: LEAPS_BOUNDS })
    ).toEqual([])
  })

  it('drops a contract without greeks when it breaks a bound', () => {
    const noGreeks = quote({ ...inBounds, contractId: 'NO_GREEKS', delta: null })
    const pastLeaps = quote({
      ...inBounds,
      contractId: 'PAST',
      expiration: '2028-02-18',
      delta: null
    })

    expect(
      filterCallChain([pastLeaps, noGreeks], SHORT_PRESET, { bounds: LEAPS_BOUNDS }).map(
        (q) => q.contractId
      )
    ).toEqual(['NO_GREEKS'])
  })
})

describe('deriveChainNotice', () => {
  const fresh = quote({ timestamp: '2026-09-14T14:59:00Z' })
  const stale = quote({ timestamp: '2026-09-14T14:54:00Z' })

  it('is loading while pending', () => {
    expect(deriveChainNotice({ status: 'pending', contracts: [], now: NOW })).toBe('loading')
  })

  it('shows nothing while idle (no valid ticker, nothing requested)', () => {
    expect(deriveChainNotice({ status: 'idle', contracts: [], now: NOW })).toBeNull()
  })

  it('is unavailable on error', () => {
    expect(deriveChainNotice({ status: 'error', contracts: [], now: NOW })).toBe('unavailable')
  })

  it('is empty on a successful empty chain', () => {
    expect(deriveChainNotice({ status: 'success', contracts: [], now: NOW })).toBe('empty')
  })

  it('is stale when the selected quote is 6 minutes old', () => {
    expect(
      deriveChainNotice({ status: 'success', contracts: [stale], selected: stale, now: NOW })
    ).toBe('stale')
  })

  it('is null when the selected quote is 1 minute old', () => {
    expect(
      deriveChainNotice({ status: 'success', contracts: [fresh], selected: fresh, now: NOW })
    ).toBeNull()
  })

  it('ranks pending above stale', () => {
    expect(
      deriveChainNotice({ status: 'pending', contracts: [stale], selected: stale, now: NOW })
    ).toBe('loading')
  })
})

describe('chainNoticeMessage', () => {
  it.each([
    ['loading', 'Loading call contracts…'],
    ['unavailable', 'Quotes unavailable. Enter your filled trade manually.'],
    ['empty', 'No matching calls. Adjust filters or enter manually.'],
    ['stale', 'Quote is stale. Verify against your actual fill.']
  ] as const)('maps %s to its copy', (kind, copy) => {
    expect(chainNoticeMessage(kind)).toBe(copy)
  })

  it('maps null to null', () => {
    expect(chainNoticeMessage(null)).toBeNull()
  })
})

describe('chainWindow', () => {
  it('opens the LEAPS window 180 days out with no upper bound', () => {
    expect(chainWindow(LEAPS_PRESET, TODAY)).toEqual({ expirationFrom: '2027-03-13' })
  })

  it('bounds the short window to 20–45 days out', () => {
    expect(chainWindow(SHORT_PRESET, TODAY)).toEqual({
      expirationFrom: '2026-10-04',
      expirationTo: '2026-10-29'
    })
  })

  describe('with LEAPS bounds', () => {
    const leapsExpiring = (expirationBefore: string): ShortCallChainBounds => ({
      expirationBefore,
      strikeAbove: '85.0000'
    })

    it('ends the short window the day before a LEAPS 35 days out', () => {
      expect(chainWindow(SHORT_PRESET, TODAY, leapsExpiring('2026-10-19'))).toEqual({
        expirationFrom: '2026-10-04',
        expirationTo: '2026-10-18'
      })
    })

    it('ends the short window the day before a LEAPS 45 days out', () => {
      expect(chainWindow(SHORT_PRESET, TODAY, leapsExpiring('2026-10-29'))).toEqual({
        expirationFrom: '2026-10-04',
        expirationTo: '2026-10-28'
      })
    })

    it('keeps the 45-day end for a LEAPS 47 days out', () => {
      expect(chainWindow(SHORT_PRESET, TODAY, leapsExpiring('2026-10-30'))).toEqual({
        expirationFrom: '2026-10-04',
        expirationTo: '2026-10-29'
      })
    })

    it('keeps the 45-day end for a LEAPS 182 days out', () => {
      expect(chainWindow(SHORT_PRESET, TODAY, leapsExpiring('2027-03-15'))).toEqual({
        expirationFrom: '2026-10-04',
        expirationTo: '2026-10-29'
      })
    })

    it('ends an open-ended window the day before the LEAPS', () => {
      expect(chainWindow(LEAPS_PRESET, TODAY, leapsExpiring('2027-09-17'))).toEqual({
        expirationFrom: '2027-03-13',
        expirationTo: '2027-09-16'
      })
    })
  })
})

describe('strikeBounds', () => {
  it('caps LEAPS strikes at the underlying price', () => {
    expect(strikeBounds(LEAPS_PRESET, '100.00')).toEqual({ strikeTo: '100.00' })
  })

  it('floors short strikes at the underlying price', () => {
    expect(strikeBounds(SHORT_PRESET, '100.00')).toEqual({ strikeFrom: '100.00' })
  })

  it('is unbounded without a price', () => {
    expect(strikeBounds(LEAPS_PRESET, null)).toEqual({})
  })
})

describe('formatContractOption', () => {
  it('labels the LEAPS fixture with expiration, strike, DTE, delta and mid', () => {
    expect(formatContractOption(LEAPS_FIXTURE, TODAY)).toBe(
      'Sep 17, 2027 · $80.00 · 368 DTE · Δ 0.80 · mid $25.00'
    )
  })

  it('shows Δ — when the contract has no greeks', () => {
    expect(formatContractOption(quote({ delta: null }), TODAY)).toBe(
      'Sep 17, 2027 · $80.00 · 368 DTE · Δ — · mid $25.00'
    )
  })
})
