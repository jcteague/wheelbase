import type { RollPmccShortCallPayload, RollPmccShortCallResponse } from '../api/positions'
import { rollPmccShortCall } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useRollPmccShortCall(options?: {
  onSuccess?: (data: RollPmccShortCallResponse) => void
}): ReturnType<typeof usePositionMutation<RollPmccShortCallResponse, RollPmccShortCallPayload>> {
  return usePositionMutation<RollPmccShortCallResponse, RollPmccShortCallPayload>(
    rollPmccShortCall,
    options
  )
}
