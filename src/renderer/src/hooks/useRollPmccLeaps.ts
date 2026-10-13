import type { RollPmccLeapsPayload, RollPmccLeapsResponse } from '../api/positions'
import { rollPmccLeaps } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useRollPmccLeaps(options?: {
  onSuccess?: (data: RollPmccLeapsResponse) => void
}): ReturnType<typeof usePositionMutation<RollPmccLeapsResponse, RollPmccLeapsPayload>> {
  return usePositionMutation<RollPmccLeapsResponse, RollPmccLeapsPayload>(rollPmccLeaps, options)
}
