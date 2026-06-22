import { apiError, type ApiError, type IpcResult } from './error'

export type { ApiError }

export type CollectIvrNowResult = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_closed' | null
}

export async function collectIvrNow(): Promise<CollectIvrNowResult> {
  const result = (await window.api.ivr.collectNow()) as IpcResult<{ batch: CollectIvrNowResult }>
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.batch
}
