import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type CreatePositionPayload,
  type CreatePositionResponse,
  createPosition
} from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useCreatePosition(): ReturnType<
  typeof useMutation<CreatePositionResponse, ApiError, CreatePositionPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<CreatePositionResponse, ApiError, CreatePositionPayload>({
    mutationFn: createPosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
    }
  })
}
