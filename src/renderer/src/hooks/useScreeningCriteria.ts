import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getScreeningCriteria,
  saveScreeningCriteria,
  type ApiError,
  type SaveScreeningCriteriaPayload,
  type ScreeningCriteria
} from '../api/screening-criteria'
import { screenerQueryKeys } from './screenerQueryKeys'

type SaveScreeningCriteriaOptions = {
  onSuccess?: (criteria: ScreeningCriteria) => void
}

export function useScreeningCriteria(): ReturnType<typeof useQuery<ScreeningCriteria, ApiError>> {
  return useQuery<ScreeningCriteria, ApiError>({
    queryKey: screenerQueryKeys.criteria,
    queryFn: getScreeningCriteria
  })
}

export function useSaveScreeningCriteria(
  options?: SaveScreeningCriteriaOptions
): ReturnType<typeof useMutation<ScreeningCriteria, ApiError, SaveScreeningCriteriaPayload>> {
  const queryClient = useQueryClient()

  return useMutation<ScreeningCriteria, ApiError, SaveScreeningCriteriaPayload>({
    mutationFn: saveScreeningCriteria,
    onSuccess: (criteria) => {
      // "Save & re-screen": the criteria query refreshes the sheet and summary
      // strip, the results query re-runs the screen behind it.
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.criteria })
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.results })
      options?.onSuccess?.(criteria)
    }
  })
}
