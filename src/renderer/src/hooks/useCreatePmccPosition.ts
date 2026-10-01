import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type CreatePmccPositionPayload,
  type CreatePmccPositionResponse,
  type PositionListItem,
  createPmccPosition
} from '../api/positions'
import { insertPositionListItem, toPmccListItem } from '../lib/position-list-items'
import { positionQueryKeys } from './positionQueryKeys'

export function useCreatePmccPosition(): ReturnType<
  typeof useMutation<CreatePmccPositionResponse, ApiError, CreatePmccPositionPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<CreatePmccPositionResponse, ApiError, CreatePmccPositionPayload>({
    mutationFn: createPmccPosition,
    // Slot the recorded row into the cached list rather than refetching every position:
    // the response is the handler's own record of what was written, so it is authoritative.
    onSuccess: (res) => {
      const item = toPmccListItem(res)
      queryClient.setQueryData<PositionListItem[]>(positionQueryKeys.all, (prev) =>
        prev && item ? insertPositionListItem(prev, item) : prev
      )
    }
  })
}
