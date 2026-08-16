// Adapter between the renderer and the screening-criteria IPC preload layer.

import { type ApiError, type IpcResult, throwMappedIpcErrors } from './error'

export type { ApiError }

// Field-for-field mirror of IpcScreeningCriteria (src/preload/index.d.ts).
export type ScreeningCriteria = {
  deltaMin: string // absolute delta, e.g. '0.20'
  deltaMax: string // absolute delta, e.g. '0.30'
  dteMin: number // calendar days, inclusive
  dteMax: number // calendar days, inclusive
  minOpenInterest: number // inclusive floor
  maxSpreadPercent: string // percent of mark, e.g. '10'
  maxSpreadAbsolute: string // dollars, e.g. '0.10' — read-only, no input in the sheet
  maxUnderlyingPrice: string | null // null = ceiling disabled
  minIvRank: string | null // null = floor disabled
  earningsHandling: 'exclude' | 'flag'
}

// The sheet has no input for maxSpreadAbsolute — the service supplies it.
export type SaveScreeningCriteriaPayload = Omit<ScreeningCriteria, 'maxSpreadAbsolute'>

// Both criteria channels return the same `{ criteria }` envelope; failures are
// validation-style, so they surface as 400 (like screener.ts, not the 502 that
// settings.ts uses for broker operations).
function unwrapCriteria(result: IpcResult<{ criteria: ScreeningCriteria }>): ScreeningCriteria {
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result.criteria
}

export async function getScreeningCriteria(): Promise<ScreeningCriteria> {
  return unwrapCriteria(await window.api.screener.getCriteria())
}

export async function saveScreeningCriteria(
  payload: SaveScreeningCriteriaPayload
): Promise<ScreeningCriteria> {
  return unwrapCriteria(await window.api.screener.saveCriteria(payload))
}
