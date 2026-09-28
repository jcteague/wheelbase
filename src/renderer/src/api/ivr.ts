import { apiError, type ApiError, type IpcResult } from './error'

export type { ApiError }

// [US-121] The IV-rank reading every bench surface shows — the screener results and the
// watchlist snapshot carry the same pair.

// Field-for-field mirror of IpcIvRank (src/preload/index.d.ts).
export type IvRank = {
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
export type IvRankAbsence =
  | { reason: 'pending' }
  | { reason: 'no_market_data' }
  | { reason: 'failed' }
  | { reason: 'insufficient_history'; coverage: number; window: number; required: number }
  | { reason: 'not_collected' }

// Mirror of IpcIvRankPair — exactly one of ivRank / ivRankAbsence is non-null, so a row
// with neither cannot be built.
export type IvRankPair =
  | { ivRank: IvRank; ivRankAbsence: null }
  | { ivRank: null; ivRankAbsence: IvRankAbsence }

export type CollectIvrNowResult = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_data_unavailable' | null
}

export async function collectIvrNow(): Promise<CollectIvrNowResult> {
  const result = (await window.api.ivr.collectNow()) as IpcResult<{ batch: CollectIvrNowResult }>
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.batch
}
