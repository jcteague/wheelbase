// Adapter between the renderer and the screener IPC preload layer.

import { type ApiError, throwMappedIpcErrors } from './error'

export type { ApiError }

// Field-for-field mirror of IpcIvRank (src/preload/index.d.ts).
export type ScreenerIvRank = {
  value: string | null // integer rank ('25'); null when the 252-session window is flat
  percentile: string // integer IV percentile ('71')
  low: string // 52-week IV30 low, 4dp
  high: string // 52-week IV30 high, 4dp
  observedAt: string // ISO instant of the anchor session's close
  ageTradingDays: number
  state: 'fresh' | 'aging' | 'stale' | 'expired' | 'predates_earnings'
}

// Field-for-field mirror of IpcIvRankAbsence (src/preload/index.d.ts) — why a reading is
// missing. Display-only: the verdict and the screener floor never read it.
export type ScreenerIvRankAbsence =
  | { reason: 'pending' }
  | { reason: 'no_market_data' }
  | { reason: 'failed' }
  | { reason: 'insufficient_history'; coverage: number; window: number; required: number }
  | { reason: 'not_collected' }

// Mirror of IpcIvRankPair — exactly one of ivRank / ivRankAbsence is non-null, so a row
// with neither cannot be built.
export type IvRankPair =
  | { ivRank: ScreenerIvRank; ivRankAbsence: null }
  | { ivRank: null; ivRankAbsence: ScreenerIvRankAbsence }

// Field-for-field mirror of IpcCandidateEarnings (src/preload/index.d.ts).
// `flagged` only occurs when the saved criteria set earningsHandling: 'flag'.
export type ScreenerCandidateEarnings =
  | { status: 'clear' } // known date, falls after expiry (or already past)
  | { status: 'flagged'; date: string; daysBeforeExpiry: number } // 'YYYY-MM-DD' + calendar days
  | { status: 'unknown' } // calendar read, no event
  | { status: 'unavailable' } // calendar could not be read

// Field-for-field mirror of IpcScoredCandidate (src/preload/index.d.ts).
// Money/ratio fields are decimal.js output strings — formatted, never parsed.
export type ScreenerCandidate = {
  ticker: string
  contractId: string
  strike: string // 4dp
  expiration: string // 'YYYY-MM-DD'
  dte: number
  bid: string // 2dp
  ask: string // 2dp
  mark: string // 2dp
  spreadAbsolute: string // 2dp
  spreadPercent: string // 2dp
  delta: string // 4dp, absolute
  openInterest: number | null
  volume: number | null
  capitalSecured: string // 2dp
  periodYield: string // 4dp fraction
  annualizedYield: string // 4dp fraction
  yieldPerDelta: string // 4dp — the rank score
  earnings: ScreenerCandidateEarnings
  timestamp: string // ISO quote time
} & IvRankPair

// Field-for-field mirror of IpcScreenerExclusion (src/preload/index.d.ts).
export type ScreenerExclusion = {
  ticker: string
  code:
    | 'price_ceiling'
    | 'iv_rank_floor'
    | 'earnings_in_window'
    | 'dte_window'
    | 'delta_unavailable'
    | 'delta_band'
    | 'open_interest'
    | 'spread'
    | 'no_options_listed'
    | 'data_unavailable'
  reason: string // rendered verbatim — the engine owns the wording
}

// A provider outage is data (`status: 'provider_unavailable'`), not an error —
// it always arrives with empty ranked/excluded and a null quoteTimestamp.
export type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: ScreenerCandidate[] // already in rank order — the renderer never re-sorts
  excluded: ScreenerExclusion[] // watchlist order; empty on outage
  quoteTimestamp: string | null // newest ranked quote time
}

export async function getScreenerResults(): Promise<ScreenerResults> {
  const result = await window.api.screener.results()
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return {
    status: result.status,
    ranked: result.ranked,
    excluded: result.excluded,
    quoteTimestamp: result.quoteTimestamp
  }
}
