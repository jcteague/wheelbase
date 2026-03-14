import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError, ExpireCspPayload, ExpireCspResponse } from '../api/positions'
import { expirePosition } from '../api/positions'

export function useExpirePosition(options?: { 
  onSuccess?: (data: ExpireCspResponse) => void 
}): ReturnType<typeof useMutation<ExpireCspResponse, ApiError, ExpireCspPayload>> {
  const queryClient = useQueryClient()
  
  return useMutation<ExpireCspResponse, ApiError, ExpireCspPayload>({
    mutationFn: expirePosition,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      options?.onSuccess?.(data)
    }
  })
}