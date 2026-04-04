import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

type PositionMutationFn<TData, TVariables> = (payload: TVariables) => Promise<TData>

type PositionMutationOptions<TData> = {
  onSuccess?: (data: TData) => void
}

export function usePositionMutation<TData, TVariables>(
  mutationFn: PositionMutationFn<TData, TVariables>,
  options?: PositionMutationOptions<TData>
): ReturnType<typeof useMutation<TData, ApiError, TVariables>> {
  const queryClient = useQueryClient()

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
      options?.onSuccess?.(data)
    }
  })
}
