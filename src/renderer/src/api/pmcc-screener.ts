// [US-110] Adapter between the renderer and the PMCC screener IPC preload layer.

import { type ApiError, throwMappedIpcErrors } from './error'
import type { ScreenerSuccess } from './screener'

export type { ApiError }

// The PMCC channel returns its service result as-is, so these are the preload's own types:
// a ranked diagonal is the main process's `RankedPmccCandidate`, IV-rank pair included.
// A provider outage is data (`status: 'provider_unavailable'`), not an error.
export type PmccScreenerResults = ScreenerSuccess<'pmccResults'>

export type PmccScreenerCandidate = PmccScreenerResults['ranked'][number]

export async function getPmccScreenerResults(): Promise<PmccScreenerResults> {
  const result = await window.api.screener.pmccResults()
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
