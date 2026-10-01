import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type CreatePositionPayload,
  type CreatePositionResponse,
  type PositionListItem,
  createPosition
} from '../api/positions'
import { insertPositionListItem, toWheelListItem } from '../lib/position-list-items'
import { positionQueryKeys } from './positionQueryKeys'

export function useCreatePosition(): ReturnType<
  typeof useMutation<CreatePositionResponse, ApiError, CreatePositionPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<CreatePositionResponse, ApiError, CreatePositionPayload>({
    mutationFn: createPosition,
    // Slot the opened wheel into the cached list rather than refetching every position.
    onSuccess: (res) => {
      const item = toWheelListItem(res)
      queryClient.setQueryData<PositionListItem[]>(positionQueryKeys.all, (prev) =>
        prev ? insertPositionListItem(prev, item) : prev
      )
    }
  })
}
