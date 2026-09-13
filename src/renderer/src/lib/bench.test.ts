// [US-96] One live bench — joining the watchlist snapshot to the screener's ranking.
//
// The join is where the two halves of the bench meet: the snapshot says whether the
// trader's own conditions are satisfied, the screener says whether a put worth selling
// exists today. A stock only reaches "meets criteria" when both agree.

import { describe, expect, it } from 'vitest'
import type { ScreenerCandidate, ScreenerExclusion, ScreenerResults } from '../api/screener'
import type { EntryVerdict, Gate, WatchlistSnapshot, WatchlistSnapshotRow } from '../api/watchlist'
import { buildBench, defaultSelection, type BenchStock } from './bench'

const MET: Gate = { verdict: 'met', label: null }
const NONE: Gate = { verdict: 'none', label: null }
const unmet = (label: string): Gate => ({ verdict: 'unmet', label })
const unknown = (label: string): Gate => ({ verdict: 'unknown', label })

const NO_CONDITIONS: EntryVerdict = { price: NONE, iv: NONE, earnings: NONE }

function row(ticker: string, verdict: Partial<EntryVerdict> = {}): WatchlistSnapshotRow {
  return {
    entry: {
      ticker,
      notes: null,
      ownBelowPrice: null,
      ivrTrigger: null,
      postEarningsOnly: false,
      coreHolding: false,
      addedAt: '2026-09-01T12:00:00.000Z'
    },
    quote: { price: '100.00', prevClose: '99.50', timestamp: '2026-09-11T18:00:00.000Z' },
    ivRank: null,
    earnings: { kind: 'unknown' },
    verdict: { ...NO_CONDITIONS, ...verdict }
  }
}

function candidate(ticker: string): ScreenerCandidate {
  return {
    ticker,
    contractId: `${ticker}261016P00095000`,
    strike: '95.0000',
    expiration: '2026-10-16',
    dte: 34,
    bid: '1.00',
    ask: '1.10',
    mark: '1.05',
    spreadAbsolute: '0.10',
    spreadPercent: '9.52',
    delta: '0.2500',
    openInterest: 1200,
    volume: 300,
    ivRank: null,
    capitalSecured: '9500.00',
    periodYield: '0.0111',
    annualizedYield: '0.1190',
    yieldPerDelta: '0.0444',
    earnings: { status: 'clear' },
    timestamp: '2026-09-11T18:00:00.000Z'
  }
}

function exclusion(
  ticker: string,
  code: ScreenerExclusion['code'],
  reason: string
): ScreenerExclusion {
  return { ticker, code, reason }
}

// Watchlist order deliberately differs from the screener's ranking (XLF is added most
// recently, KO ranks first) so a bench that simply kept watchlist order would fail.
const ROWS: WatchlistSnapshotRow[] = [
  row('XLF'), // no personal conditions at all — every gate `none`
  row('AAPL', { price: unmet('Price $178.40 above $170 target'), iv: unmet('IV low') }),
  row('KO', { iv: MET }), // an IVR trigger the reading clears
  row('MSFT', { earnings: unmet('Earnings in 3 days') }),
  row('PEP', { iv: unknown('IV too old to judge') }),
  row('AMD'), // conditions pass; the screener is the one holding it back
  row('XYZ', { iv: unknown('IV unavailable') })
]

const SNAPSHOT: WatchlistSnapshot = { rows: ROWS, asOf: '2026-09-11T18:00:00.000Z' }

const KO_CANDIDATE = candidate('KO')
const XLF_CANDIDATE = candidate('XLF')
const PEP_CANDIDATE = candidate('PEP')

const RESULTS: ScreenerResults = {
  status: 'ok',
  ranked: [KO_CANDIDATE, XLF_CANDIDATE, PEP_CANDIDATE],
  excluded: [
    exclusion('MSFT', 'earnings_in_window', 'earnings 2026-09-15 falls before expiry'),
    exclusion('AMD', 'spread', 'spread 14% exceeds 10%')
  ],
  quoteTimestamp: '2026-09-11T18:00:00.000Z'
}

function find(stocks: BenchStock[], ticker: string): BenchStock {
  const stock = stocks.find((entry) => entry.ticker === ticker)
  if (!stock) throw new Error(`${ticker} is not on this half of the bench`)
  return stock
}

describe('buildBench', () => {
  it('orders meets-criteria stocks by the screener rank, not the watchlist order', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(bench.meets.map((stock) => stock.ticker)).toEqual(['KO', 'XLF'])
    expect(bench.meets.map((stock) => stock.rank)).toEqual([1, 2])
  })

  it('carries the ranked candidate on each meets-criteria stock with no reason', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    const ko = bench.meets[0]
    expect(ko.candidate).toBe(KO_CANDIDATE)
    expect(ko.reason).toBe('')
  })

  it('says "All conditions met" when at least one personal condition was satisfied', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(bench.meets[0].verdictCopy).toBe('All conditions met')
  })

  // A stock with no personal conditions has nothing of the trader's to satisfy, so
  // claiming "all conditions met" would overstate it — the screening defaults alone
  // are what cleared it.
  it('says "Screening criteria met" when the stock has no personal conditions', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(bench.meets[1].verdictCopy).toBe('Screening criteria met')
  })

  it('keeps waiting stocks in watchlist order', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(bench.waiting.map((stock) => stock.ticker)).toEqual([
      'AAPL',
      'MSFT',
      'PEP',
      'AMD',
      'XYZ'
    ])
  })

  it('joins several blocking gates with a separator, most decisive first', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(find(bench.waiting, 'AAPL')).toMatchObject({
      reason: 'Price $178.40 above $170 target · IV low',
      rank: null,
      verdictCopy: null
    })
  })

  // The screener excluded MSFT for the same print, but the trader's own gate is the
  // one they set — its wording wins over the engine's.
  it('prefers the gate reason over the screener exclusion for the same stock', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(find(bench.waiting, 'MSFT')).toMatchObject({ reason: 'Earnings in 3 days' })
  })

  // A ranked put alone never clears a stock: an unknown reading is a refusal to decide,
  // not a pass. The candidate is still carried so the detail panel can show what is
  // being held back.
  it('holds back a ranked stock whose IV reading is too old to judge', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(find(bench.waiting, 'PEP')).toMatchObject({
      reason: 'IV too old to judge',
      rank: null,
      candidate: PEP_CANDIDATE
    })
  })

  it('falls back to the screener exclusion verbatim when every gate passes', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(find(bench.waiting, 'AMD')).toMatchObject({
      reason: 'spread 14% exceeds 10%',
      candidate: null
    })
  })

  it('reports an unknown IV gate for a stock the screener never mentioned', () => {
    const bench = buildBench(SNAPSHOT, RESULTS)

    expect(find(bench.waiting, 'XYZ')).toMatchObject({ reason: 'IV unavailable' })
  })

  // An outage degrades the verdicts, not the rows: every stock still renders, but
  // nothing is claimed about it.
  it('empties the meets half and blanks every reason when the provider is unavailable', () => {
    const bench = buildBench(SNAPSHOT, {
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })

    expect(bench.meets).toEqual([])
    expect(bench.waiting.map((stock) => stock.reason)).toEqual(
      ROWS.map(() => 'Data unavailable · not evaluated')
    )
  })

  it('reports stocks with no blocking gate as not screened yet while results are loading', () => {
    const bench = buildBench(SNAPSHOT, undefined)

    expect(bench.meets).toEqual([])
    expect(find(bench.waiting, 'KO')).toMatchObject({ reason: 'Not screened yet' })
    expect(find(bench.waiting, 'AAPL')).toMatchObject({
      reason: 'Price $178.40 above $170 target · IV low'
    })
  })
})

describe('defaultSelection', () => {
  it('prefers the top-ranked meets-criteria stock', () => {
    expect(defaultSelection(buildBench(SNAPSHOT, RESULTS))).toBe('KO')
  })

  it('falls back to the first waiting stock when nothing meets criteria', () => {
    expect(defaultSelection(buildBench(SNAPSHOT, undefined))).toBe('XLF')
  })

  it('returns null for an empty bench', () => {
    expect(
      defaultSelection(buildBench({ rows: [], asOf: '2026-09-11T18:00:00.000Z' }, RESULTS))
    ).toBeNull()
  })
})
