import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError, CloseCcEarlyPayload, CloseCcEarlyResponse } from '../api/positions'
import { closeCoveredCallEarly } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useCloseCoveredCallEarly(options?: {
  onSuccess?: (data: CloseCcEarlyResponse) => void
}): ReturnType<typeof useMutation<CloseCcEarlyResponse, ApiError, CloseCcEarlyPayload>> {
  const queryClient = useQueryClient()

  return useMutation<CloseCcEarlyResponse, ApiError, CloseCcEarlyPayload>({
    mutationFn: closeCoveredCallEarly,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
      options?.onSuccess?.(data)
    }
  })
}
