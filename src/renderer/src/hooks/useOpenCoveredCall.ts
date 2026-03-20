import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError, OpenCcPayload, OpenCcResponse } from '../api/positions'
import { openCoveredCall } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useOpenCoveredCall(options?: {
  onSuccess?: (data: OpenCcResponse) => void
}): ReturnType<typeof useMutation<OpenCcResponse, ApiError, OpenCcPayload>> {
  const queryClient = useQueryClient()

  return useMutation<OpenCcResponse, ApiError, OpenCcPayload>({
    mutationFn: openCoveredCall,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
      options?.onSuccess?.(data)
    }
  })
}
