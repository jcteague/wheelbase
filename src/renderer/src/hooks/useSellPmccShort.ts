// [US-115] The Sell Short Call sheet's mutation: records the sale through the sellPmccShort
// adapter, refreshes every position query, then hands the result back.
import type { SellPmccShortPayload, SellPmccShortResponse } from '../api/positions'
import { sellPmccShort } from '../api/positions'
import { usePositionMutation } from './usePositionMutation'

export function useSellPmccShort(options?: {
  onSuccess?: (data: SellPmccShortResponse) => void
}): ReturnType<typeof usePositionMutation<SellPmccShortResponse, SellPmccShortPayload>> {
  return usePositionMutation<SellPmccShortResponse, SellPmccShortPayload>(sellPmccShort, options)
}
