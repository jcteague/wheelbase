import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '../api/error'
import { dismissAlert } from '../api/alerts'

export function useDismissAlert(): UseMutationResult<IpcDismissedAlertRecord, ApiError, string> {
  const queryClient = useQueryClient()

  return useMutation<IpcDismissedAlertRecord, ApiError, string>({
    mutationFn: dismissAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'queue'] })
    }
  })
}
