import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type CreatePmccPositionPayload,
  type CreatePmccPositionResponse,
  type PositionListItem,
  createPmccPosition
} from '../api/positions'
import { insertPositionListItem } from '../lib/position-list-items'
import { positionQueryKeys } from './positionQueryKeys'

export function useCreatePmccPosition(): ReturnType<
  typeof useMutation<CreatePmccPositionResponse, ApiError, CreatePmccPositionPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<CreatePmccPositionResponse, ApiError, CreatePmccPositionPayload>({
    mutationFn: createPmccPosition,
    // Slot the recorded row into the cached list rather than refetching every position: the
    // service built `listItem` with the list's own code, so it is the row a refetch would return.
    onSuccess: ({ listItem }) => {
      queryClient.setQueryData<PositionListItem[]>(positionQueryKeys.all, (prev) =>
        prev && listItem ? insertPositionListItem(prev, listItem) : prev
      )
    }
  })
}
