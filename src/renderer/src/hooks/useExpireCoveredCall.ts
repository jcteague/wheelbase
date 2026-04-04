import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError, ExpireCcPayload, ExpireCcResponse } from '../api/positions'
import { expireCc } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useExpireCoveredCall(options?: {
  onSuccess?: (data: ExpireCcResponse) => void
}): ReturnType<typeof useMutation<ExpireCcResponse, ApiError, ExpireCcPayload>> {
  const queryClient = useQueryClient()

  return useMutation<ExpireCcResponse, ApiError, ExpireCcPayload>({
    mutationFn: expireCc,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
      options?.onSuccess?.(data)
    }
  })
}
