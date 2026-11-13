// [US-110] pmcc-screener — PMCC diagonal scoring, the ticker/leg/pair filter funnel,
// best-pair choice and cross-ticker ranking. Valuation date Fri 2026-09-18.
import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import Decimal from 'decimal.js'
import type { CandidateStrike } from './candidate-chain'
import type { EarningsLookup, IvRank } from './screener'
import {
  DEFAULT_PMCC_SCREENING_CRITERIA,
  rankPmccCandidates,
  scorePmccPair,
  screenPmccTicker,
  toPmccLeg,
  type KnownDeltaStrike,
  type PmccLegQuote,
  type PmccPairInput,
  type PmccScreeningCriteria,
  type PmccTickerScreeningInput
} from './pmcc-screener'

// Mid-morning local time: DTE and the earnings window count calendar days, so the time of
// day must not matter.
const CURRENT_DATE = new Date(2026, 8, 18, 10, 0)
const SHORT_EXPIRY = '2026-10-23' // 35 DTE
const LEAPS_2028 = '2028-01-21' // 490 DTE
const LEAPS_2027 = '2027-09-17' // 364 DTE

// Noon UTC is Sep 17 in every US and European zone, so the reason's date label is a literal.
const IVR_OBSERVED_AT = '2026-09-17T12:00:00Z'

type CallSpec = Pick<KnownDeltaStrike, 'contractId' | 'strike' | 'expiration' | 'mark' | 'delta'> &
  Partial<KnownDeltaStrike>

/** A call quoted two cents either side of its mark, liquid enough to pass every default. */
function call(spec: CallSpec): KnownDeltaStrike {
  return {
    bid: new Decimal(spec.mark).minus('0.02').toFixed(2),
    ask: new Decimal(spec.mark).plus('0.02').toFixed(2),
    openInterest: 1500,
    volume: 300,
    timestamp: '2026-09-18T15:30:00Z',
    ...spec
  }
}

const XLF_LONG = call({
  contractId: 'XLF280121C00042000',
  strike: '42.00',
  expiration: LEAPS_2028,
  mark: '10.30',
  delta: '0.81'
})
const XLF_SHORT = call({
  contractId: 'XLF261023C00053000',
  strike: '53.00',
  expiration: SHORT_EXPIRY,
  mark: '0.64',
  delta: '0.29'
})

// An earnings print after the short call expires: a `clear` verdict.
const CLEAR_EARNINGS: EarningsLookup = { status: 'found', date: '2026-11-20' }

function ivRank(value: string): IvRank {
  return { value, observedAt: IVR_OBSERVED_AT }
}

function criteria(overrides: Partial<PmccScreeningCriteria> = {}): PmccScreeningCriteria {
  return { ...DEFAULT_PMCC_SCREENING_CRITERIA, ...overrides }
}

function pmccInput(overrides: Partial<PmccTickerScreeningInput> = {}): PmccTickerScreeningInput {
  return {
    ticker: 'XLF',
    longCalls: [XLF_LONG],
    shortCalls: [XLF_SHORT],
    ivRank: null,
    underlyingPrice: '51.20',
    earnings: CLEAR_EARNINGS,
    ...overrides
  }
}

function screen(
  overrides: Partial<PmccTickerScreeningInput> = {},
  criteriaOverrides: Partial<PmccScreeningCriteria> = {}
): ReturnType<typeof screenPmccTicker> {
  return screenPmccTicker(pmccInput(overrides), criteria(criteriaOverrides), CURRENT_DATE)
}

/** The XLF diagonal from the mockup: $42C LEAPS at 490 DTE, $53C short at 35 DTE. */
function xlfPair(overrides: Partial<PmccPairInput> = {}): PmccPairInput {
  return {
    ticker: 'XLF',
    long: { quote: XLF_LONG, dte: 490 },
    short: { quote: XLF_SHORT, dte: 35 },
    underlyingPrice: '51.20',
    ivRank: null,
    earnings: { status: 'clear' },
    ...overrides
  }
}

function withLong(fields: Partial<KnownDeltaStrike>, dte = 490): Pick<PmccPairInput, 'long'> {
  return { long: { quote: { ...XLF_LONG, ...fields }, dte } }
}

function withShort(fields: Partial<KnownDeltaStrike>, dte = 35): Pick<PmccPairInput, 'short'> {
  return { short: { quote: { ...XLF_SHORT, ...fields }, dte } }
}

describe('DEFAULT_PMCC_SCREENING_CRITERIA', () => {
  it('matches the story Background: 0.70–0.85 LEAPS, 0.25–0.35 short, 180–540 / 20–45 DTE', () => {
    expect(DEFAULT_PMCC_SCREENING_CRITERIA).toEqual({
      longDeltaMin: '0.70',
      longDeltaMax: '0.85',
      longDteMin: 180,
      longDteMax: 540,
      shortDeltaMin: '0.25',
      shortDeltaMax: '0.35',
      shortDteMin: 20,
      shortDteMax: 45,
      maxDebitToWidthPercent: '90',
      minOpenInterest: 200,
      maxSpreadPercent: '10',
      maxSpreadAbsolute: '0.10',
      minIvRank: null,
      maxIvRank: null,
      earningsHandling: 'exclude'
    })
  })
})

describe('toPmccLeg', () => {
  it('carries the quote with its DTE, absolute 4dp delta and 2dp spread', () => {
    expect(toPmccLeg({ quote: XLF_LONG, dte: 490 })).toEqual({
      contractId: 'XLF280121C00042000',
      strike: '42.00',
      expiration: LEAPS_2028,
      dte: 490,
      bid: '10.28',
      ask: '10.32',
      mark: '10.30',
      spreadAbsolute: '0.04',
      spreadPercent: '0.39',
      delta: '0.8100',
      openInterest: 1500,
      volume: 300,
      timestamp: '2026-09-18T15:30:00Z'
    })
  })

  it('reports delta as an absolute value rounded half-up at 4dp', () => {
    const leg = toPmccLeg({ quote: { ...XLF_SHORT, delta: '-0.29005' }, dte: 35 })

    expect(leg.delta).toBe('0.2901')
  })

  it('rounds the spread half-up at 2dp — absolute 0.025 → 0.03, percent 0.625 → 0.63', () => {
    const wide = toPmccLeg({
      quote: { ...XLF_SHORT, bid: '1.5875', ask: '1.6125', mark: '1.60' },
      dte: 35
    })
    const narrow = toPmccLeg({
      quote: { ...XLF_SHORT, bid: '1.595', ask: '1.605', mark: '1.60' },
      dte: 35
    })

    expect(wide.spreadAbsolute).toBe('0.03')
    expect(narrow.spreadPercent).toBe('0.63')
  })
})

describe('leg types', () => {
  it('admits no quote with an unknown delta into a leg that can be scored', () => {
    expectTypeOf<CandidateStrike & { delta: null }>().not.toExtend<PmccLegQuote['quote']>()
    expectTypeOf(scorePmccPair).parameter(0).toExtend<{ short: PmccLegQuote }>()
    expectTypeOf(toPmccLeg).parameter(0).toEqualTypeOf<PmccLegQuote>()
  })
})

describe('scorePmccPair', () => {
  it('scores the XLF diagonal: debit, width, ratio, yields, return per delta and extrinsic', () => {
    expect(scorePmccPair(xlfPair())).toEqual(
      expect.objectContaining({
        netDebit: '9.66',
        capitalAtRisk: '966.00',
        strikeWidth: '11.00',
        debitToWidthPercent: '87.82',
        cycleYield: '0.0663',
        annualizedYield: '0.6909',
        returnPerDelta: '2.3825',
        longExtrinsic: '1.10',
        extrinsicCoverage: '0.5818'
      })
    )
  })

  it('carries the ticker, both legs, the IV rank and the earnings verdict through', () => {
    const scored = scorePmccPair(
      xlfPair({ ivRank: ivRank('41'), earnings: { status: 'unavailable' } })
    )

    expect(scored).toEqual(
      expect.objectContaining({
        ticker: 'XLF',
        ivRank: { value: '41', observedAt: IVR_OBSERVED_AT },
        earnings: { status: 'unavailable' }
      })
    )
    expect([scored.long.contractId, scored.long.dte]).toEqual(['XLF280121C00042000', 490])
    expect([scored.short.contractId, scored.short.dte]).toEqual(['XLF261023C00053000', 35])
  })

  it('stamps the pair with the newer of its two leg timestamps', () => {
    const shortNewer = scorePmccPair(
      xlfPair({
        ...withLong({ timestamp: '2026-09-18T15:30:00Z' }),
        ...withShort({ timestamp: '2026-09-18T15:31:00Z' })
      })
    )
    const longNewer = scorePmccPair(
      xlfPair({
        ...withLong({ timestamp: '2026-09-18T15:32:00Z' }),
        ...withShort({ timestamp: '2026-09-18T15:31:00Z' })
      })
    )

    expect(shortNewer.timestamp).toBe('2026-09-18T15:31:00Z')
    expect(longNewer.timestamp).toBe('2026-09-18T15:32:00Z')
  })

  it('leaves extrinsic and coverage null without a price, every other field identical', () => {
    const withPrice = scorePmccPair(xlfPair())
    const withoutPrice = scorePmccPair(xlfPair({ underlyingPrice: null }))

    expect(withoutPrice).toEqual({ ...withPrice, longExtrinsic: null, extrinsicCoverage: null })
  })

  it('treats an unparseable price as no price', () => {
    const scored = scorePmccPair(xlfPair({ underlyingPrice: 'NaN' }))

    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual([null, null])
  })

  it('clamps extrinsic at zero when the mark sits below intrinsic, with no coverage', () => {
    // price − strike = 11.00 > mark 10.30: a stale LEAPS quote.
    const scored = scorePmccPair(xlfPair({ underlyingPrice: '53.00' }))

    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual(['0.00', null])
  })

  it('gives no coverage when extrinsic is exactly zero', () => {
    // price − strike = 10.30 = mark.
    const scored = scorePmccPair(xlfPair({ underlyingPrice: '52.30' }))

    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual(['0.00', null])
  })

  it('covers the smallest positive extrinsic', () => {
    // price − strike = 10.29: one cent of extrinsic, 0.64 / 0.01 = 64.
    const scored = scorePmccPair(xlfPair({ underlyingPrice: '52.29' }))

    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual(['0.01', '64.0000'])
  })

  it('counts the whole mark as extrinsic when the LEAPS is out of the money', () => {
    const scored = scorePmccPair(xlfPair({ underlyingPrice: '40.00' }))

    // 0.64 / 10.30 = 0.062135…
    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual(['10.30', '0.0621'])
  })

  it('rounds net debit half-up at 2dp', () => {
    // 10.305 − 0.64 = 9.665
    const scored = scorePmccPair(xlfPair(withLong({ mark: '10.305' })))

    expect([scored.netDebit, scored.capitalAtRisk]).toEqual(['9.67', '966.50'])
  })

  it('derives capital at risk from the unrounded debit, rounded half-up at 2dp', () => {
    // 10.30545 − 0.64 = 9.66545 → ×100 = 966.545 (not 9.67 × 100)
    const scored = scorePmccPair(xlfPair(withLong({ mark: '10.30545' })))

    expect([scored.netDebit, scored.capitalAtRisk]).toEqual(['9.67', '966.55'])
  })

  it('rounds strike width half-up at 2dp', () => {
    // 53.005 − 42 = 11.005
    const scored = scorePmccPair(xlfPair(withShort({ strike: '53.005' })))

    expect(scored.strikeWidth).toBe('11.01')
  })

  it('rounds debit-to-width half-up at 2dp', () => {
    // (8.6405 − 0.64) / (52 − 42) × 100 = 80.005
    const scored = scorePmccPair(
      xlfPair({ ...withLong({ mark: '8.6405' }), ...withShort({ strike: '52.00' }) })
    )

    expect(scored.debitToWidthPercent).toBe('80.01')
  })

  it('rounds the 4dp yield fractions half-up', () => {
    // debit 1.00; cycle 0.12345; × 365 / 365 = 0.12345; ÷ delta 1 = 0.12345
    const scored = scorePmccPair(
      xlfPair({
        ...withLong({ mark: '1.12345' }),
        ...withShort({ mark: '0.12345', delta: '1' }, 365)
      })
    )

    expect([scored.cycleYield, scored.annualizedYield, scored.returnPerDelta]).toEqual([
      '0.1235',
      '0.1235',
      '0.1235'
    ])
  })

  it('rounds extrinsic half-up at 2dp but divides coverage by the unrounded extrinsic', () => {
    // 10.305 − (51.20 − 42) = 1.105; 0.64 / 1.105 = 0.57918… (0.64 / 1.11 would be 0.5766)
    const scored = scorePmccPair(xlfPair(withLong({ mark: '10.305' })))

    expect([scored.longExtrinsic, scored.extrinsicCoverage]).toEqual(['1.11', '0.5792'])
  })

  it('rounds extrinsic coverage half-up at 4dp', () => {
    // extrinsic 11.00 − (50 − 40) = 1.00; 0.12345 / 1.00
    const scored = scorePmccPair(
      xlfPair({
        ...withLong({ strike: '40.00', mark: '11.00' }),
        ...withShort({ mark: '0.12345' }),
        underlyingPrice: '50.00'
      })
    )

    expect(scored.extrinsicCoverage).toBe('0.1235')
  })
})

const AMD_LONG = call({
  contractId: 'AMD270917C00110000',
  strike: '110.00',
  expiration: LEAPS_2027,
  mark: '60.20',
  delta: '0.80'
})
const AMD_SHORT = call({
  contractId: 'AMD261023C00170000',
  strike: '170.00',
  expiration: SHORT_EXPIRY,
  mark: '3.90',
  delta: '0.29'
})

describe('screenPmccTicker', () => {
  it('picks the XLF diagonal at the default criteria with nothing excluded', () => {
    const result = screen()

    expect(result.best).toEqual(
      expect.objectContaining({
        ticker: 'XLF',
        returnPerDelta: '2.3825',
        earnings: { status: 'clear' }
      })
    )
    expect([result.best?.long.contractId, result.best?.short.contractId]).toEqual([
      'XLF280121C00042000',
      'XLF261023C00053000'
    ])
    expect(result.excluded).toEqual([])
  })

  it('computes each leg DTE from the valuation date', () => {
    const result = screen()

    expect([result.best?.long.dte, result.best?.short.dte]).toEqual([490, 35])
  })

  describe('pair stage', () => {
    it('excludes AMD on debit to width', () => {
      const result = screen({
        ticker: 'AMD',
        longCalls: [AMD_LONG],
        shortCalls: [AMD_SHORT],
        underlyingPrice: '156.20'
      })

      expect(result.best).toBe(null)
      expect(result.excluded[0]).toEqual({
        ticker: 'AMD',
        stage: 'pair',
        contractId: 'AMD261023C00170000',
        code: 'debit_to_width',
        reason: 'debit 93.84% of width exceeds 90%'
      })
    })

    // A $52C at $1.00 against the $42C LEAPS: width 10, so the LEAPS mark sets the ratio.
    const tenWide = [{ ...XLF_SHORT, strike: '52.00', mark: '1.00' }]

    it.each([
      ['9.99', '89.9% passes'],
      ['10.00', 'exactly 90% passes']
    ])('keeps a LEAPS at mark %s (%s)', (longMark) => {
      const result = screen({ longCalls: [{ ...XLF_LONG, mark: longMark }], shortCalls: tenWide })

      expect(result.best?.long.mark).toBe(longMark)
    })

    it('excludes a ratio a hair over the ceiling — the filter reads the unrounded ratio', () => {
      // (10.0001 − 1.00) / 10 = 90.001%, which rounds to 90.00 for display.
      const result = screen({ longCalls: [{ ...XLF_LONG, mark: '10.0001' }], shortCalls: tenWide })

      expect(result.best).toBe(null)
      expect(result.excluded[0]).toEqual(
        expect.objectContaining({
          code: 'debit_to_width',
          reason: 'debit 90.01% of width exceeds 90%'
        })
      )
    })

    it('excludes a short strike below the LEAPS strike', () => {
      const short = { ...XLF_SHORT, contractId: 'XLF261023C00040000', strike: '40.00' }
      const result = screen({ shortCalls: [short] })

      expect(result.best).toBe(null)
      expect(result.excluded).toEqual([
        {
          ticker: 'XLF',
          stage: 'pair',
          contractId: 'XLF261023C00040000',
          code: 'short_strike_not_above_long',
          reason: 'short strike $40.00 not above LEAPS strike $42.00'
        }
      ])
    })

    it('excludes a short strike equal to the LEAPS strike', () => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, strike: '42.00' }] })

      expect(result.excluded.map((row) => row.code)).toEqual(['short_strike_not_above_long'])
    })

    it('lets a short strike one cent above the LEAPS through the strike rule', () => {
      // Width 0.01 then fails debit to width — the next filter, not the strike rule.
      const result = screen({ shortCalls: [{ ...XLF_SHORT, strike: '42.01' }] })

      expect(result.excluded.map((row) => row.code)).toEqual(['debit_to_width'])
    })
  })

  describe('leg stage', () => {
    it('excludes a LEAPS outside the delta band, naming the leg', () => {
      const long = { ...XLF_LONG, delta: '0.62' }
      const result = screen({ longCalls: [long] })

      expect(result.best).toBe(null)
      expect(result.excluded[0]).toEqual({
        ticker: 'XLF',
        stage: 'long',
        contractId: 'XLF280121C00042000',
        code: 'delta_band',
        reason: 'LEAPS delta 0.62 outside 0.70–0.85'
      })
    })

    it.each(['0.70', '0.85'])('keeps a LEAPS at the band edge delta %s', (delta) => {
      const result = screen({ longCalls: [{ ...XLF_LONG, delta }] })

      expect(result.best?.long.delta).toBe(new Decimal(delta).toFixed(4))
    })

    it.each(['0.6999', '0.8501'])('excludes a LEAPS just outside the band at %s', (delta) => {
      const result = screen({ longCalls: [{ ...XLF_LONG, delta }] })

      expect(result.excluded.map((row) => [row.stage, row.code])).toEqual([['long', 'delta_band']])
    })

    it('excludes a short call outside its delta band with the short-call prefix', () => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, delta: '0.41' }] })

      expect(result.excluded[0]).toEqual(
        expect.objectContaining({
          stage: 'short',
          code: 'delta_band',
          reason: 'short call delta 0.41 outside 0.25–0.35'
        })
      )
    })

    it.each(['0.25', '0.35'])('keeps a short call at the band edge delta %s', (delta) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, delta }] })

      expect(result.best?.short.delta).toBe(new Decimal(delta).toFixed(4))
    })

    it.each(['0.2499', '0.3501'])('excludes a short call just outside the band at %s', (delta) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, delta }] })

      expect(result.excluded.map((row) => [row.stage, row.code])).toEqual([['short', 'delta_band']])
    })

    it.each([
      ['2027-03-17', 180],
      ['2028-03-11', 540]
    ])('keeps a LEAPS expiring %s (%i DTE, the window edge)', (expiration, dte) => {
      const result = screen({ longCalls: [{ ...XLF_LONG, expiration }] })

      expect(result.best?.long.dte).toBe(dte)
    })

    it.each([
      ['2027-03-16', 'LEAPS DTE 179 outside 180–540'],
      ['2028-03-12', 'LEAPS DTE 541 outside 180–540']
    ])('excludes a LEAPS expiring %s', (expiration, reason) => {
      const result = screen({ longCalls: [{ ...XLF_LONG, expiration }] })

      expect(result.excluded).toEqual([expect.objectContaining({ code: 'dte_window', reason })])
    })

    it('excludes a LEAPS whose expiration does not parse', () => {
      const result = screen({ longCalls: [{ ...XLF_LONG, expiration: 'not-a-date' }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({ code: 'dte_window', reason: 'LEAPS DTE unavailable' })
      ])
    })

    it.each([
      ['2026-10-08', 20],
      ['2026-11-02', 45]
    ])('keeps a short call expiring %s (%i DTE, the window edge)', (expiration, dte) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, expiration }] })

      expect(result.best?.short.dte).toBe(dte)
    })

    it.each([
      ['2026-10-07', 'short call DTE 19 outside 20–45'],
      ['2026-11-03', 'short call DTE 46 outside 20–45']
    ])('excludes a short call expiring %s', (expiration, reason) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, expiration }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({ stage: 'short', code: 'dte_window', reason })
      ])
    })

    it('excludes a short call whose expiration does not parse, even from a 0-DTE window', () => {
      // A missing DTE must not lean on `null < dteMin` coercing to `0 < dteMin`, which a
      // window opening at 0 DTE would let through.
      const result = screen(
        { shortCalls: [{ ...XLF_SHORT, expiration: 'not-a-date' }] },
        { shortDteMin: 0 }
      )

      expect(result.excluded).toEqual([
        expect.objectContaining({
          stage: 'short',
          code: 'dte_window',
          reason: 'short call DTE unavailable'
        })
      ])
    })

    it('excludes a LEAPS with no delta', () => {
      const result = screen({ longCalls: [{ ...XLF_LONG, delta: null }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({ code: 'delta_unavailable', reason: 'LEAPS delta unavailable' })
      ])
    })

    it('excludes a short call with no delta', () => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, delta: null }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({
          code: 'delta_unavailable',
          reason: 'short call delta unavailable'
        })
      ])
    })

    it('excludes a short call below the open-interest floor', () => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, openInterest: 120 }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({
          stage: 'short',
          code: 'open_interest',
          reason: 'short call open interest 120 below 200'
        })
      ])
    })

    it('excludes a LEAPS below the open-interest floor', () => {
      const result = screen({ longCalls: [{ ...XLF_LONG, openInterest: 80 }] })

      expect(result.excluded).toEqual([
        expect.objectContaining({
          stage: 'long',
          code: 'open_interest',
          reason: 'LEAPS open interest 80 below 200'
        })
      ])
    })

    it.each([
      [200, true],
      [199, false],
      [null, true]
    ])('open interest %s against a floor of 200 survives: %s', (openInterest, survives) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, openInterest }] })

      expect(result.best !== null).toBe(survives)
    })

    it('excludes a LEAPS whose spread breaches both ceilings', () => {
      // 1.00 wide on an 8.00 mark: 12.5%
      const long = { ...XLF_LONG, bid: '7.50', ask: '8.50', mark: '8.00' }
      const result = screen({ longCalls: [long] })

      expect(result.excluded).toEqual([
        expect.objectContaining({
          stage: 'long',
          code: 'spread',
          reason: 'LEAPS spread 12.5% exceeds 10%'
        })
      ])
    })

    it('excludes a short call whose spread breaches both ceilings', () => {
      const short = { ...XLF_SHORT, bid: '0.93', ask: '1.07', mark: '1.00' }
      const result = screen({ shortCalls: [short] })

      expect(result.excluded).toEqual([
        expect.objectContaining({ code: 'spread', reason: 'short call spread 14% exceeds 10%' })
      ])
    })

    it.each([
      ['0.10 wide at 20% of mark', { bid: '0.45', ask: '0.55', mark: '0.50' }, true],
      ['0.11 wide at exactly 10% of mark', { bid: '1.045', ask: '1.155', mark: '1.10' }, true],
      ['0.11 wide at 10.09% of mark', { bid: '1.035', ask: '1.145', mark: '1.09' }, false]
    ])('a short call spread %s survives: %s', (_label, quote, survives) => {
      const result = screen({ shortCalls: [{ ...XLF_SHORT, ...quote }] })

      expect(result.best !== null).toBe(survives)
    })

    it('judges each leg against its own band — a short-call delta is no LEAPS', () => {
      const result = screen({ longCalls: [{ ...XLF_LONG, delta: '0.30' }] })

      expect(result.excluded.map((row) => [row.stage, row.code])).toEqual([['long', 'delta_band']])
    })

    it('leaves the ticker with no best when no LEAPS survives', () => {
      const result = screen({
        longCalls: [
          { ...XLF_LONG, delta: '0.62' },
          { ...XLF_LONG, contractId: 'XLF280121C00040000', strike: '40.00', delta: '0.90' }
        ]
      })

      expect(result.best).toBe(null)
      expect(result.excluded.map((row) => [row.stage, row.code])).toEqual([
        ['long', 'delta_band'],
        ['long', 'delta_band']
      ])
    })
  })

  describe('ticker stage', () => {
    it('excludes a rich underlying above the IV-rank ceiling, evaluating nothing leg-level', () => {
      const result = screen(
        { ivRank: ivRank('58'), longCalls: [{ ...XLF_LONG, delta: '0.62' }] },
        { maxIvRank: '55' }
      )

      expect(result).toEqual({
        ticker: 'XLF',
        best: null,
        excluded: [
          {
            ticker: 'XLF',
            stage: 'ticker',
            contractId: null,
            code: 'iv_rank_ceiling',
            reason: 'IV rank 58 (Sep 17) above 55'
          }
        ]
      })
    })

    it('excludes an underlying below the IV-rank floor', () => {
      const result = screen({ ivRank: ivRank('49') }, { minIvRank: '50', maxIvRank: '55' })

      expect(result.excluded).toEqual([
        expect.objectContaining({
          stage: 'ticker',
          code: 'iv_rank_floor',
          reason: 'IV rank 49 (Sep 17) below 50'
        })
      ])
    })

    it('excludes one point above the ceiling', () => {
      const result = screen({ ivRank: ivRank('56') }, { minIvRank: '50', maxIvRank: '55' })

      expect(result.excluded.map((row) => row.code)).toEqual(['iv_rank_ceiling'])
    })

    it.each(['50', '55'])('keeps an IV rank of %s inside a 50–55 band (inclusive)', (value) => {
      const result = screen({ ivRank: ivRank(value) }, { minIvRank: '50', maxIvRank: '55' })

      expect(result.best?.ivRank).toEqual({ value, observedAt: IVR_OBSERVED_AT })
    })

    it('does not judge an unknown IV rank against either end of the band', () => {
      const result = screen({ ivRank: null }, { minIvRank: '50', maxIvRank: '55' })

      expect(result.best?.returnPerDelta).toBe('2.3825')
    })
  })

  describe('earnings', () => {
    it('excludes a short call whose window holds the earnings print, under exclude', () => {
      const result = screen({ earnings: { status: 'found', date: '2026-10-20' } })

      expect(result.best).toBe(null)
      expect(result.excluded).toEqual([
        {
          ticker: 'XLF',
          stage: 'short',
          contractId: 'XLF261023C00053000',
          code: 'earnings_in_window',
          reason: 'earnings 2026-10-20 falls on or before expiry'
        }
      ])
    })

    it('excludes a print on the short call expiry day', () => {
      const result = screen({ earnings: { status: 'found', date: SHORT_EXPIRY } })

      expect(result.excluded.map((row) => row.code)).toEqual(['earnings_in_window'])
    })

    it('keeps a print the day after the short expiry, though inside the LEAPS life', () => {
      const result = screen({ earnings: { status: 'found', date: '2026-10-24' } })

      expect(result.best?.earnings).toEqual({ status: 'clear' })
    })

    it('flags an in-window print under flag, judged on the short expiry', () => {
      const result = screen(
        { earnings: { status: 'found', date: '2026-10-20' } },
        { earningsHandling: 'flag' }
      )

      expect(result.best?.earnings).toEqual({
        status: 'flagged',
        date: '2026-10-20',
        daysBeforeExpiry: 3
      })
    })

    it('marks a ticker with no calendar event as unknown', () => {
      const result = screen({ earnings: { status: 'none' } })

      expect(result.best?.earnings).toEqual({ status: 'unknown' })
    })

    it('prefers a clear short expiry over a richer flagged one', () => {
      // The 2026-10-16 short expires before the 2026-10-20 print; the 10-23 one straddles it
      // and scores higher (more premium for the same delta).
      const early = {
        ...XLF_SHORT,
        contractId: 'XLF261016C00053000',
        expiration: '2026-10-16',
        mark: '0.50'
      }
      const result = screen(
        { shortCalls: [XLF_SHORT, early], earnings: { status: 'found', date: '2026-10-20' } },
        { earningsHandling: 'flag' }
      )

      expect(result.best?.short.contractId).toBe('XLF261016C00053000')
      expect(result.best?.earnings).toEqual({ status: 'clear' })
    })
  })

  describe('best pair', () => {
    it('picks the highest return per delta among every surviving LEAPS × short', () => {
      const deepLong = call({
        contractId: 'XLF280121C00040000',
        strike: '40.00',
        expiration: LEAPS_2028,
        mark: '12.10',
        delta: '0.83'
      })
      const hotShort = call({
        contractId: 'XLF261023C00052000',
        strike: '52.00',
        expiration: SHORT_EXPIRY,
        mark: '0.90',
        delta: '0.36'
      })
      const result = screen({ longCalls: [deepLong, XLF_LONG], shortCalls: [hotShort, XLF_SHORT] })

      expect([result.best?.long.contractId, result.best?.short.contractId]).toEqual([
        'XLF280121C00042000',
        'XLF261023C00053000'
      ])
      expect(result.best?.returnPerDelta).toBe('2.3825')
      expect(result.excluded.map((row) => [row.stage, row.contractId, row.code])).toEqual([
        ['short', 'XLF261023C00052000', 'delta_band']
      ])
    })

    it('ranks on return per delta ahead of debit to width', () => {
      // $54C at 0.60: ratio 80.83% (better) but return per delta 2.2244 (worse).
      const cheapShort = {
        ...XLF_SHORT,
        contractId: 'XLF261023C00054000',
        strike: '54.00',
        mark: '0.60'
      }
      const result = screen({ shortCalls: [cheapShort, XLF_SHORT] })

      expect(result.best?.short.contractId).toBe('XLF261023C00053000')
    })

    it('breaks a return-per-delta tie on the lower debit to width', () => {
      // Same premium and delta one strike higher: equal score, 80.50% instead of 87.82%.
      const widerShort = { ...XLF_SHORT, contractId: 'XLF261023C00054000', strike: '54.00' }
      const result = screen({ shortCalls: [XLF_SHORT, widerShort] })

      expect(result.best?.short.contractId).toBe('XLF261023C00054000')
      expect(result.best?.debitToWidthPercent).toBe('80.50')
    })

    it('breaks a score-and-ratio tie on the lower LEAPS strike', () => {
      // $42C/$53C and $41C/$52C both cost 9.66 over an 11-wide spread at equal score:
      // 0.64 / 0.29 = 0.74 / 0.3353125. The cross pairs miss — $42C/$52C at 95.6% of
      // width, $41C/$53C on a lower score.
      const lowerLong = {
        ...XLF_LONG,
        contractId: 'XLF280121C00041000',
        strike: '41.00',
        mark: '10.40'
      }
      const lowerShort = {
        ...XLF_SHORT,
        contractId: 'XLF261023C00052000',
        strike: '52.00',
        mark: '0.74',
        delta: '0.3353125'
      }
      const result = screen({
        longCalls: [XLF_LONG, lowerLong],
        shortCalls: [lowerShort, XLF_SHORT]
      })

      expect([result.best?.long.contractId, result.best?.short.contractId]).toEqual([
        'XLF280121C00041000',
        'XLF261023C00052000'
      ])
    })

    it('settles a full tie on contract id, so chain order never decides', () => {
      // Two LEAPS at the same strike and mark, different expiries: identical scores.
      const nearLong = { ...XLF_LONG, contractId: 'XLF270917C00042000', expiration: LEAPS_2027 }
      const result = screen({ longCalls: [XLF_LONG, nearLong] })

      expect(result.best?.long.contractId).toBe('XLF270917C00042000')
    })
  })

  it('lists exclusions closest miss first: pair, then short, then long, deepest filter first', () => {
    const longs = [
      { ...XLF_LONG, contractId: 'L-dte', expiration: '2027-03-16' },
      { ...XLF_LONG, contractId: 'L-delta', delta: '0.62' },
      XLF_LONG
    ]
    const shorts = [
      { ...XLF_SHORT, contractId: 'S-below', strike: '40.00' },
      { ...XLF_SHORT, contractId: 'S-thin', strike: '55.00', openInterest: 120 },
      { ...XLF_SHORT, contractId: 'S-narrow', strike: '43.00' },
      XLF_SHORT
    ]
    const result = screen({ longCalls: longs, shortCalls: shorts })

    expect(result.best?.short.contractId).toBe('XLF261023C00053000')
    expect(result.excluded.map((row) => [row.stage, row.contractId, row.code])).toEqual([
      ['pair', 'S-narrow', 'debit_to_width'],
      ['pair', 'S-below', 'short_strike_not_above_long'],
      ['short', 'S-thin', 'open_interest'],
      ['long', 'L-delta', 'delta_band'],
      ['long', 'L-dte', 'dte_window']
    ])
  })

  it('lists a short call past the earnings filter, on its DTE, ahead of one stopped by earnings', () => {
    // S-b expires 2026-10-07, before the 10-20 print, so it clears earnings and misses DTE.
    const result = screen({
      shortCalls: [
        { ...XLF_SHORT, contractId: 'S-a' },
        { ...XLF_SHORT, contractId: 'S-b', expiration: '2026-10-07' }
      ],
      earnings: { status: 'found', date: '2026-10-20' }
    })

    expect(result.excluded.map((row) => [row.contractId, row.code])).toEqual([
      ['S-b', 'dte_window'],
      ['S-a', 'earnings_in_window']
    ])
  })

  describe('closest miss within one filter', () => {
    // Ids are chosen so contract-id order alone would list the farther miss first.
    const contractIds = (result: ReturnType<typeof screenPmccTicker>): (string | null)[] =>
      result.excluded.map((row) => row.contractId)

    const AMD_120 = call({
      contractId: 'AMD270917C00120000',
      strike: '120.00',
      expiration: LEAPS_2027,
      mark: '53.00',
      delta: '0.76'
    })

    it.each([
      ['$120C first', [AMD_120, AMD_LONG]],
      ['$110C first', [AMD_LONG, AMD_120]]
    ])('reports the AMD pair with the lowest debit to width first (%s)', (_label, longCalls) => {
      // $110C: 56.30 / 60 = 93.83%; $120C: 49.10 / 50 = 98.2%.
      const result = screen({
        ticker: 'AMD',
        longCalls,
        shortCalls: [AMD_SHORT],
        underlyingPrice: '156.20'
      })

      expect(result.excluded).toEqual([
        {
          ticker: 'AMD',
          stage: 'pair',
          contractId: 'AMD261023C00170000',
          code: 'debit_to_width',
          reason: 'debit 93.84% of width exceeds 90%'
        },
        {
          ticker: 'AMD',
          stage: 'pair',
          contractId: 'AMD261023C00170000',
          code: 'debit_to_width',
          reason: 'debit 98.2% of width exceeds 90%'
        }
      ])
    })

    it.each([
      ['both below the band', '0.68', '0.62'],
      ['both above the band', '0.86', '0.95'],
      ['0.02 above against 0.04 below', '0.87', '0.66'],
      ['0.01 below against 0.05 above', '0.69', '0.90']
    ])('lists the LEAPS delta nearer the band first: %s', (_label, near, far) => {
      const result = screen({
        longCalls: [
          { ...XLF_LONG, contractId: 'L-far', delta: far },
          { ...XLF_LONG, contractId: 'L-near', delta: near }
        ]
      })

      expect(contractIds(result)).toEqual(['L-near', 'L-far'])
    })

    it.each([
      ['both before the window', '2027-03-16', '2027-03-07'], // 179 against 170 DTE
      ['both past the window', '2028-03-12', '2028-03-21'], // 541 against 550
      ['2 days past against 5 before', '2028-03-13', '2027-03-12'], // 542 against 175
      ['a known DTE against none', '2027-03-07', 'not-a-date']
    ])('lists the LEAPS DTE nearer the window first: %s', (_label, near, far) => {
      const result = screen({
        longCalls: [
          { ...XLF_LONG, contractId: 'L-far', expiration: far },
          { ...XLF_LONG, contractId: 'L-near', expiration: near }
        ]
      })

      expect(contractIds(result)).toEqual(['L-near', 'L-far'])
    })

    it('lists the short call with the smaller open-interest shortfall first', () => {
      const result = screen({
        shortCalls: [
          { ...XLF_SHORT, contractId: 'S-far', openInterest: 80 },
          { ...XLF_SHORT, contractId: 'S-near', openInterest: 150 }
        ]
      })

      expect(contractIds(result)).toEqual(['S-near', 'S-far'])
    })

    it('lists the short call with the narrower spread first', () => {
      const result = screen({
        shortCalls: [
          { ...XLF_SHORT, contractId: 'S-far', bid: '0.9375', ask: '1.0625', mark: '1.00' },
          { ...XLF_SHORT, contractId: 'S-near', bid: '0.945', ask: '1.055', mark: '1.00' }
        ]
      })

      expect(result.excluded.map((row) => [row.contractId, row.reason])).toEqual([
        ['S-near', 'short call spread 11% exceeds 10%'],
        ['S-far', 'short call spread 12.5% exceeds 10%']
      ])
    })

    const IN_WINDOW: EarningsLookup = { status: 'found', date: '2026-10-20' }

    it.each([
      ['delta_unavailable', { delta: null }, CLEAR_EARNINGS],
      ['dte_window', { expiration: 'not-a-date' }, CLEAR_EARNINGS],
      ['earnings_in_window', {}, IN_WINDOW]
    ])('settles %s misses, which have no nearness, on contract id', (code, fields, earnings) => {
      const result = screen({
        shortCalls: [
          { ...XLF_SHORT, ...fields, contractId: 'S-b' },
          { ...XLF_SHORT, ...fields, contractId: 'S-a' }
        ],
        earnings
      })

      expect(result.excluded.map((row) => [row.contractId, row.code])).toEqual([
        ['S-a', code],
        ['S-b', code]
      ])
    })

    it('settles strike-rule misses on the pair, LEAPS id included', () => {
      // One short under two LEAPS: both pairs share the short, so the LEAPS id decides.
      const result = screen({
        longCalls: [
          { ...XLF_LONG, contractId: 'L-b' },
          { ...XLF_LONG, contractId: 'L-a', strike: '41.00' }
        ],
        shortCalls: [{ ...XLF_SHORT, strike: '40.00' }]
      })

      expect(result.excluded.map((row) => row.reason)).toEqual([
        'short strike $40.00 not above LEAPS strike $41.00',
        'short strike $40.00 not above LEAPS strike $42.00'
      ])
    })
  })
})

const KO_INPUT: PmccTickerScreeningInput = {
  ticker: 'KO',
  longCalls: [
    call({
      contractId: 'KO280121C00057500',
      strike: '57.50',
      expiration: LEAPS_2028,
      mark: '13.20',
      delta: '0.82'
    })
  ],
  shortCalls: [
    call({
      contractId: 'KO261023C00072500',
      strike: '72.50',
      expiration: SHORT_EXPIRY,
      mark: '0.62',
      delta: '0.25'
    })
  ],
  ivRank: null,
  underlyingPrice: '68.90',
  earnings: CLEAR_EARNINGS
}

const AAPL_INPUT: PmccTickerScreeningInput = {
  ticker: 'AAPL',
  longCalls: [
    call({
      contractId: 'AAPL270917C00140000',
      strike: '140.00',
      expiration: LEAPS_2027,
      mark: '45.90',
      delta: '0.81'
    })
  ],
  shortCalls: [
    call({
      contractId: 'AAPL261023C00190000',
      strike: '190.00',
      expiration: SHORT_EXPIRY,
      mark: '2.45',
      delta: '0.27'
    })
  ],
  ivRank: null,
  underlyingPrice: '178.40',
  earnings: CLEAR_EARNINGS
}

describe('rankPmccCandidates', () => {
  const screenAll = (
    inputs: PmccTickerScreeningInput[],
    overrides: Partial<PmccScreeningCriteria> = {}
  ): ReturnType<typeof screenPmccTicker>[] =>
    inputs.map((input) => screenPmccTicker(input, criteria(overrides), CURRENT_DATE))

  it('orders tickers by return per delta, highest first', () => {
    // KO 2.0559, XLF 2.3825, AAPL 2.1779
    const ranked = rankPmccCandidates(screenAll([KO_INPUT, pmccInput(), AAPL_INPUT]))

    expect(ranked.map((candidate) => candidate.ticker)).toEqual(['XLF', 'AAPL', 'KO'])
  })

  it('ranks clear ahead of unknown ahead of flagged earnings, whatever the score', () => {
    const inWindow: EarningsLookup = { status: 'found', date: '2026-10-20' }
    const ranked = rankPmccCandidates(
      screenAll(
        [
          pmccInput({ earnings: inWindow }),
          { ...AAPL_INPUT, earnings: { status: 'none' } },
          KO_INPUT
        ],
        { earningsHandling: 'flag' }
      )
    )

    expect(ranked.map((candidate) => [candidate.ticker, candidate.earnings.status])).toEqual([
      ['KO', 'clear'],
      ['AAPL', 'unknown'],
      ['XLF', 'flagged']
    ])
  })

  it('drops a ticker with no surviving pair', () => {
    const amd: PmccTickerScreeningInput = {
      ...pmccInput(),
      ticker: 'AMD',
      longCalls: [AMD_LONG],
      shortCalls: [AMD_SHORT],
      underlyingPrice: '156.20'
    }
    const ranked = rankPmccCandidates(screenAll([amd, KO_INPUT]))

    expect(ranked.map((candidate) => candidate.ticker)).toEqual(['KO'])
  })

  it('breaks an exact score tie alphabetically by ticker', () => {
    const ranked = rankPmccCandidates(screenAll([pmccInput(), pmccInput({ ticker: 'ABC' })]))

    expect(ranked.map((candidate) => candidate.ticker)).toEqual(['ABC', 'XLF'])
  })
})

describe('module purity', () => {
  it('imports nothing from services, integrations, the logger or the database driver', () => {
    const source = readFileSync(new URL('./pmcc-screener.ts', import.meta.url), 'utf8')
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])

    expect(specifiers.length).toBeGreaterThan(0)
    expect(
      specifiers.filter((specifier) =>
        /services\/|integrations\/|\/logger$|^better-sqlite3$/.test(specifier)
      )
    ).toEqual([])
  })
})
