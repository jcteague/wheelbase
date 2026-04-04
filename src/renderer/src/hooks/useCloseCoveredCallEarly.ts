import type { CloseCcEarlyPayload, CloseCcEarlyResponse } from '../api/positions'
import { closeCoveredCallEarly } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useCloseCoveredCallEarly(options?: {
  onSuccess?: (data: CloseCcEarlyResponse) => void
}): ReturnType<typeof usePositionMutation<CloseCcEarlyResponse, CloseCcEarlyPayload>> {
  return usePositionMutation<CloseCcEarlyResponse, CloseCcEarlyPayload>(
    closeCoveredCallEarly,
    options
  )
}
