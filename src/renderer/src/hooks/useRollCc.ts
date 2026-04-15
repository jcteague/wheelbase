import type { RollCcPayload, RollCcResponse } from '../api/positions'
import { rollCc } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useRollCc(options?: {
  onSuccess?: (data: RollCcResponse) => void
}): ReturnType<typeof usePositionMutation<RollCcResponse, RollCcPayload>> {
  return usePositionMutation<RollCcResponse, RollCcPayload>(rollCc, options)
}
