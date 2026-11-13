// Property tests: [US-110] the PMCC screener's pair arithmetic matches an independent Decimal
// oracle, every `best` it returns honours the criteria it was screened against, extrinsic is
// display-only, chain and ticker order never change the answer, and extrinsic and coverage
// stay inside their bounds.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { addDays, format } from 'date-fns'
import type { CandidateStrike } from './candidate-chain'
import type { EarningsLookup, IvRank } from './screener'
import {
  DEFAULT_PMCC_SCREENING_CRITERIA,
  rankPmccCandidates,
  scorePmccPair,
  screenPmccTicker,
  type PmccPairInput,
  type PmccScreeningCriteria,
  type PmccTickerScreeningInput
} from './pmcc-screener'
import { nonNegativeMoney, positiveMoney, ticker } from './test-fixtures/arbitraries'

const CURRENT_DATE = new Date(2026, 8, 18, 10, 0)
const TIMESTAMP = '2026-09-18T15:30:00Z'

const half2 = (value: Decimal.Value): string =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

/** Money in (min, min + span] as a 4-dp string. */
const moneyAbove = (min: string, span: number): fc.Arbitrary<string> =>
  positiveMoney(span).map((amount) => new Decimal(amount).plus(min).toFixed(4))

/** An absolute delta in [min, max] at 4 dp. */
const deltaBetween = (min: number, max: number): fc.Arbitrary<string> =>
  fc
    .integer({ min: min * 10_000, max: max * 10_000 })
    .map((units) => new Decimal(units).div(10_000).toFixed(4))

const expiringIn = (minDays: number, maxDays: number): fc.Arbitrary<string> =>
  fc
    .integer({ min: minDays, max: maxDays })
    .map((days) => format(addDays(CURRENT_DATE, days), 'yyyy-MM-dd'))

type CallShape = {
  strike: fc.Arbitrary<string>
  mark: fc.Arbitrary<string>
  delta: fc.Arbitrary<string>
  expiration: fc.Arbitrary<string>
}

/** One call quote, its bid and ask a generated half-spread either side of the mark. */
const callStrike = (shape: CallShape): fc.Arbitrary<Omit<CandidateStrike, 'contractId'>> =>
  fc
    .record({
      ...shape,
      halfSpread: nonNegativeMoney(0.1),
      openInterest: fc.option(fc.integer({ min: 0, max: 2000 })),
      volume: fc.option(fc.integer({ min: 0, max: 5000 }))
    })
    .map(({ halfSpread, mark, ...rest }) => ({
      ...rest,
      mark,
      bid: new Decimal(mark).minus(halfSpread).toFixed(4),
      ask: new Decimal(mark).plus(halfSpread).toFixed(4),
      timestamp: TIMESTAMP
    }))

/** 1–6 calls with unique contract ids, so a shuffle is a pure reordering. */
const chain = (
  prefix: string,
  call: fc.Arbitrary<Omit<CandidateStrike, 'contractId'>>
): fc.Arbitrary<CandidateStrike[]> =>
  fc
    .array(call, { minLength: 1, maxLength: 6 })
    .map((calls) => calls.map((quote, i) => ({ ...quote, contractId: `${prefix}${i}` })))

// Ranges straddle every default band and window edge, so each draw mixes survivors and misses.
const longCall = callStrike({
  strike: moneyAbove('20', 40),
  mark: moneyAbove('5', 35),
  delta: deltaBetween(0.65, 0.9),
  expiration: expiringIn(170, 550)
})
const shortCall = callStrike({
  strike: moneyAbove('40', 100),
  mark: moneyAbove('0.5', 3.5),
  delta: deltaBetween(0.2, 0.4),
  expiration: expiringIn(15, 50)
})

const earningsLookup: fc.Arbitrary<EarningsLookup> = fc.oneof(
  fc.constant<EarningsLookup>({ status: 'none' }),
  fc.constant<EarningsLookup>({ status: 'unavailable' }),
  expiringIn(-5, 90).map((date): EarningsLookup => ({ status: 'found', date }))
)

const ivRank: fc.Arbitrary<IvRank> = fc
  .integer({ min: 0, max: 100 })
  .map((value) => ({ value: String(value), observedAt: '2026-09-17T12:00:00Z' }))

const tickerInput: fc.Arbitrary<PmccTickerScreeningInput> = fc.record({
  ticker,
  longCalls: chain('L', longCall),
  shortCalls: chain('S', shortCall),
  ivRank: fc.option(ivRank),
  underlyingPrice: fc.option(moneyAbove('20', 120)),
  earnings: earningsLookup
})

const pmccCriteria: fc.Arbitrary<PmccScreeningCriteria> = fc
  .record({
    maxDebitToWidthPercent: fc.integer({ min: 60, max: 100 }).map(String),
    earningsHandling: fc.constantFrom('exclude' as const, 'flag' as const)
  })
  .map((overrides) => ({ ...DEFAULT_PMCC_SCREENING_CRITERIA, ...overrides }))

/** A diagonal with the short strike above the LEAPS and the LEAPS the dearer leg, built from
 *  the width and debit so the oracle can read them straight off the draw. */
const orderedPair = fc
  .record({
    longStrike: moneyAbove('1', 200),
    width: positiveMoney(50),
    shortMark: moneyAbove('0.01', 10),
    debit: positiveMoney(50),
    shortDelta: deltaBetween(0.01, 0.99),
    shortDte: fc.integer({ min: 1, max: 60 }),
    underlyingPrice: fc.option(positiveMoney(300))
  })
  .map(({ longStrike, width, shortMark, debit, shortDelta, shortDte, underlyingPrice }) => {
    const longMark = new Decimal(shortMark).plus(debit).toFixed(4)
    const pair: PmccPairInput = {
      ticker: 'XLF',
      long: {
        quote: {
          contractId: 'L',
          strike: longStrike,
          expiration: '2028-01-21',
          bid: longMark,
          ask: longMark,
          mark: longMark,
          delta: '0.8000',
          openInterest: null,
          volume: null,
          timestamp: TIMESTAMP
        },
        dte: 490
      },
      short: {
        quote: {
          contractId: 'S',
          strike: new Decimal(longStrike).plus(width).toFixed(4),
          expiration: '2026-10-23',
          bid: shortMark,
          ask: shortMark,
          mark: shortMark,
          delta: shortDelta,
          openInterest: null,
          volume: null,
          timestamp: TIMESTAMP
        },
        dte: shortDte
      },
      underlyingPrice,
      ivRank: null,
      earnings: { status: 'clear' }
    }
    return { pair, width, debit }
  })

function within(value: Decimal.Value, min: Decimal.Value, max: Decimal.Value): boolean {
  return new Decimal(value).gte(min) && new Decimal(value).lte(max)
}

const fullShuffle = <T>(items: T[]): fc.Arbitrary<T[]> =>
  fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length })

describe('scorePmccPair properties', () => {
  it('net debit, strike width and debit-to-width match a Decimal oracle at 2dp half-up', () => {
    fc.assert(
      fc.property(orderedPair, ({ pair, width, debit }) => {
        const scored = scorePmccPair(pair)

        expect([scored.netDebit, scored.strikeWidth, scored.debitToWidthPercent]).toEqual([
          half2(debit),
          half2(width),
          half2(new Decimal(debit).div(width).times(100))
        ])
      })
    )
  })

  it('extrinsic is never negative and coverage, when present, is strictly positive', () => {
    fc.assert(
      fc.property(orderedPair, ({ pair }) => {
        const { longExtrinsic, extrinsicCoverage } = scorePmccPair(pair)

        if (longExtrinsic !== null) expect(new Decimal(longExtrinsic).gte(0)).toBe(true)
        if (extrinsicCoverage !== null) expect(new Decimal(extrinsicCoverage).gt(0)).toBe(true)
      })
    )
  })
})

describe('screenPmccTicker properties', () => {
  it('every best pair honours the strike order, both bands, both windows and the ratio ceiling', () => {
    fc.assert(
      fc.property(tickerInput, pmccCriteria, (input, criteria) => {
        const { best } = screenPmccTicker(input, criteria, CURRENT_DATE)
        if (best === null) return

        expect({
          strikeOrder: new Decimal(best.short.strike).gt(best.long.strike),
          longDelta: within(best.long.delta, criteria.longDeltaMin, criteria.longDeltaMax),
          shortDelta: within(best.short.delta, criteria.shortDeltaMin, criteria.shortDeltaMax),
          longDte: within(best.long.dte, criteria.longDteMin, criteria.longDteMax),
          shortDte: within(best.short.dte, criteria.shortDteMin, criteria.shortDteMax),
          ratio: new Decimal(best.debitToWidthPercent).lte(criteria.maxDebitToWidthPercent)
        }).toEqual({
          strikeOrder: true,
          longDelta: true,
          shortDelta: true,
          longDte: true,
          shortDte: true,
          ratio: true
        })
      })
    )
  })

  it('the underlying price changes only extrinsic and coverage, never the verdict', () => {
    fc.assert(
      fc.property(tickerInput, moneyAbove('20', 120), (input, price) => {
        const withoutPrice = screenPmccTicker(
          { ...input, underlyingPrice: null },
          DEFAULT_PMCC_SCREENING_CRITERIA,
          CURRENT_DATE
        )
        const withPrice = screenPmccTicker(
          { ...input, underlyingPrice: price },
          DEFAULT_PMCC_SCREENING_CRITERIA,
          CURRENT_DATE
        )

        expect(withPrice.excluded).toEqual(withoutPrice.excluded)
        expect(
          withPrice.best === null
            ? null
            : { ...withPrice.best, longExtrinsic: null, extrinsicCoverage: null }
        ).toEqual(withoutPrice.best)
      })
    )
  })

  const shuffled = tickerInput.chain((input) =>
    fc.record({
      input: fc.constant(input),
      longCalls: fullShuffle(input.longCalls),
      shortCalls: fullShuffle(input.shortCalls)
    })
  )

  // Most draws hold several misses of one filter in one stage, which only the nearness and
  // contract-id tie-breaks can order.
  it('shuffling either chain leaves the excluded list, closest miss first, unchanged', () => {
    fc.assert(
      fc.property(shuffled, pmccCriteria, ({ input, longCalls, shortCalls }, criteria) => {
        const original = screenPmccTicker(input, criteria, CURRENT_DATE)
        const reordered = screenPmccTicker(
          { ...input, longCalls, shortCalls },
          criteria,
          CURRENT_DATE
        )

        expect(reordered.excluded).toEqual(original.excluded)
      })
    )
  })

  it('shuffling either chain leaves the best pair unchanged', () => {
    fc.assert(
      fc.property(shuffled, ({ input, longCalls, shortCalls }) => {
        const original = screenPmccTicker(input, DEFAULT_PMCC_SCREENING_CRITERIA, CURRENT_DATE)
        const reordered = screenPmccTicker(
          { ...input, longCalls, shortCalls },
          DEFAULT_PMCC_SCREENING_CRITERIA,
          CURRENT_DATE
        )

        expect(reordered.best).toEqual(original.best)
      })
    )
  })
})

describe('rankPmccCandidates properties', () => {
  it('shuffling the screened tickers leaves the rank order unchanged', () => {
    const watchlist = fc
      .uniqueArray(tickerInput, { selector: (input) => input.ticker, minLength: 1, maxLength: 6 })
      .chain((inputs) => fc.tuple(fc.constant(inputs), fullShuffle(inputs)))
    fc.assert(
      fc.property(watchlist, ([inputs, shuffledInputs]) => {
        const rank = (list: PmccTickerScreeningInput[]): string[] =>
          rankPmccCandidates(
            list.map((input) =>
              screenPmccTicker(input, DEFAULT_PMCC_SCREENING_CRITERIA, CURRENT_DATE)
            )
          ).map((candidate) => candidate.ticker)

        expect(rank(shuffledInputs)).toEqual(rank(inputs))
      })
    )
  })
})
