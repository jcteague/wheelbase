import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApiError,
  SaveAlertOverridesPayload,
  SaveAlertOverridesResponse
} from '../api/positions'
import { saveAlertOverrides } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function useSaveAlertOverrides(): ReturnType<
  typeof useMutation<SaveAlertOverridesResponse, ApiError, SaveAlertOverridesPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<SaveAlertOverridesResponse, ApiError, SaveAlertOverridesPayload>({
    mutationFn: saveAlertOverrides,
    onSuccess: () => {
      // Invalidate the whole positions tree (prefix-matches both the list and the
      // detail query) so the list's TargetBadge refreshes, matching every other
      // position-mutation hook.
      queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
    }
  })
}
