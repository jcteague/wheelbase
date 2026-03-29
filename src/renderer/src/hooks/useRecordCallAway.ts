import type { RecordCallAwayPayload, RecordCallAwayResponse } from '../api/positions'
import { recordCallAway } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useRecordCallAway(options?: {
  onSuccess?: (data: RecordCallAwayResponse) => void
}): ReturnType<typeof usePositionMutation<RecordCallAwayResponse, RecordCallAwayPayload>> {
  return usePositionMutation<RecordCallAwayResponse, RecordCallAwayPayload>(recordCallAway, options)
}
