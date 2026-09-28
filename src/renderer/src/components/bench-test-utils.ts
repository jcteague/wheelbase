// [US-96] Fixture builders for the bench components.
//
// A `BenchStock` is a three-level nest — entry conditions, snapshot values, and the
// screener's candidate — and every component test needs a different leaf of it. These
// builders give each test one shallow override to write instead of a full literal.

import type { IvRank, IvRankPair } from '../api/ivr'
import type { ScreenerCandidate } from '../api/screener'
import type {
  EarningsDisplay,
  EntryVerdict,
  Gate,
  SnapshotQuote,
  WatchlistEntry,
  WatchlistSnapshotRow
} from '../api/watchlist'
import type { BenchStock } from '../lib/bench'

export const met: Gate = { verdict: 'met', label: null }
export const none: Gate = { verdict: 'none', label: null }
export const unmet = (label: string): Gate => ({ verdict: 'unmet', label })
export const unknown = (label: string): Gate => ({ verdict: 'unknown', label })

export const FRESH_IVR: IvRank = {
  value: '58',
  percentile: '64',
  low: '0.1800',
  high: '0.4500',
  observedAt: '2026-09-11T20:00:00.000Z',
  ageTradingDays: 0,
  state: 'fresh'
}

export const KO_QUOTE: SnapshotQuote = {
  price: '62.00',
  prevClose: '61.50',
  timestamp: '2026-09-11T20:00:00.000Z'
}

export const FAR_EARNINGS: EarningsDisplay = {
  kind: 'date',
  date: '2026-11-03',
  daysUntil: 52,
  withinWindow: false
}

export function entry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    ticker: 'KO',
    notes: 'Core wheel. Comfortable owning through a full cycle.',
    ownBelowPrice: null,
    ivrTrigger: 40,
    postEarningsOnly: false,
    coreHolding: false,
    addedAt: '2026-09-01T14:00:00.000Z',
    ...overrides
  }
}

export function verdict(overrides: Partial<EntryVerdict> = {}): EntryVerdict {
  return { price: none, iv: met, earnings: none, ...overrides }
}

/** The IV-rank pair is overridden whole or not at all — half a pair would build a row
 *  with neither a reading nor a reason, which the types rule out. */
type Overrides<T extends IvRankPair> = Partial<Omit<T, keyof IvRankPair>> &
  (IvRankPair | { ivRank?: never; ivRankAbsence?: never })

export function row(overrides: Overrides<WatchlistSnapshotRow> = {}): WatchlistSnapshotRow {
  return {
    entry: entry(),
    quote: KO_QUOTE,
    ivRank: FRESH_IVR,
    ivRankAbsence: null,
    earnings: FAR_EARNINGS,
    verdict: verdict(),
    ...overrides
  }
}

export function candidate(overrides: Overrides<ScreenerCandidate> = {}): ScreenerCandidate {
  return {
    ticker: 'KO',
    contractId: 'KO261016P00060000',
    strike: '60.0000',
    expiration: '2026-10-16',
    dte: 37,
    bid: '0.92',
    ask: '0.98',
    mark: '0.95',
    spreadAbsolute: '0.06',
    spreadPercent: '6.00',
    delta: '0.2200',
    openInterest: 1800,
    volume: 340,
    ivRank: FRESH_IVR,
    ivRankAbsence: null,
    capitalSecured: '6000.00',
    periodYield: '0.0158',
    annualizedYield: '0.1562',
    yieldPerDelta: '0.7100',
    earnings: { status: 'clear' },
    timestamp: '2026-09-11T20:00:00.000Z',
    ...overrides
  }
}

/** A stock that cleared both halves: its conditions pass and the screener ranked a put. */
export function meets(overrides: Partial<BenchStock> = {}): BenchStock {
  return {
    ticker: 'KO',
    row: row(),
    candidate: candidate(),
    rank: 1,
    reason: '',
    verdictCopy: 'All conditions met',
    ...overrides
  }
}

/** A stock still on the bench, with the single most decisive reason why. */
export function waiting(overrides: Partial<BenchStock> = {}): BenchStock {
  return {
    ticker: 'KO',
    row: row({ verdict: verdict({ iv: unmet('IV low') }) }),
    candidate: null,
    rank: null,
    reason: 'IV low',
    verdictCopy: null,
    ...overrides
  }
}
