// Adapter between the renderer and the screener IPC preload layer.

import { type ApiError, throwMappedIpcErrors } from './error'

export type { ApiError }

// Field-for-field mirror of IpcIvRank (src/preload/index.d.ts).
export type ScreenerIvRank = {
  value: string // 1dp
  observedAt: string // ISO timestamp of the scrape that produced it
}

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
  ivRank: ScreenerIvRank | null // null → render "n/a"
  capitalSecured: string // 2dp
  periodYield: string // 4dp fraction
  annualizedYield: string // 4dp fraction
  yieldPerDelta: string // 4dp — the rank score
  earningsFlagged: boolean // carried on the type, not rendered until US-70
  timestamp: string // ISO quote time
}

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
