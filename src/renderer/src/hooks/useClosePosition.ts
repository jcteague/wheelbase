import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type CloseCspPayload,
  type CloseCspResponse,
  closePosition
} from '../api/positions'

export function useClosePosition(): ReturnType<
  typeof useMutation<CloseCspResponse, ApiError, CloseCspPayload>
> {
  const queryClient = useQueryClient()
  return useMutation<CloseCspResponse, ApiError, CloseCspPayload>({
    mutationFn: closePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    }
  })
}
