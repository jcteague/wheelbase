import type { RollCspPayload, RollCspResponse } from '../api/positions'
import { rollCsp } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useRollCsp(options?: {
  onSuccess?: (data: RollCspResponse) => void
}): ReturnType<typeof usePositionMutation<RollCspResponse, RollCspPayload>> {
  return usePositionMutation<RollCspResponse, RollCspPayload>(rollCsp, options)
}
