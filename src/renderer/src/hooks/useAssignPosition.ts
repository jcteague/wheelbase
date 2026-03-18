import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError, AssignCspPayload, AssignCspResponse } from '../api/positions'
import { assignPosition } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useAssignPosition(options?: {
  onSuccess?: (data: AssignCspResponse) => void
}): ReturnType<typeof useMutation<AssignCspResponse, ApiError, AssignCspPayload>> {
  const queryClient = useQueryClient()

  return useMutation<AssignCspResponse, ApiError, AssignCspPayload>({
    mutationFn: assignPosition,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
      options?.onSuccess?.(data)
    }
  })
}
