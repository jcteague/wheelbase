// [US-110] Adapter between the renderer and the PMCC screening-criteria IPC preload layer.

import type { ApiError } from './error'
import type { ScreenerSuccess } from './screener'
import { unwrapCriteria } from './screening-criteria'

export type { ApiError }

export type PmccScreeningCriteria = ScreenerSuccess<'getPmccCriteria'>['criteria']

// The sheet has no input for maxSpreadAbsolute — the service supplies it.
export type SavePmccScreeningCriteriaPayload = Parameters<
  Window['api']['screener']['savePmccCriteria']
>[0]

export async function getPmccScreeningCriteria(): Promise<PmccScreeningCriteria> {
  return unwrapCriteria(await window.api.screener.getPmccCriteria())
}

export async function savePmccScreeningCriteria(
  payload: SavePmccScreeningCriteriaPayload
): Promise<PmccScreeningCriteria> {
  return unwrapCriteria(await window.api.screener.savePmccCriteria(payload))
}
