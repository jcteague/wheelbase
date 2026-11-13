import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPmccScreeningCriteria,
  savePmccScreeningCriteria,
  type ApiError,
  type PmccScreeningCriteria,
  type SavePmccScreeningCriteriaPayload
} from '../api/pmcc-screening-criteria'
import { screenerQueryKeys } from './screenerQueryKeys'

type SavePmccScreeningCriteriaOptions = {
  onSuccess?: (criteria: PmccScreeningCriteria) => void
}

export function usePmccScreeningCriteria({
  enabled = true
}: { enabled?: boolean } = {}): ReturnType<typeof useQuery<PmccScreeningCriteria, ApiError>> {
  return useQuery<PmccScreeningCriteria, ApiError>({
    queryKey: screenerQueryKeys.pmccCriteria,
    queryFn: getPmccScreeningCriteria,
    enabled
  })
}

export function useSavePmccScreeningCriteria(
  options?: SavePmccScreeningCriteriaOptions
): ReturnType<
  typeof useMutation<PmccScreeningCriteria, ApiError, SavePmccScreeningCriteriaPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<PmccScreeningCriteria, ApiError, SavePmccScreeningCriteriaPayload>({
    mutationFn: savePmccScreeningCriteria,
    onSuccess: (criteria) => {
      // "Save & re-screen" for the PMCC lens only: the wheel's criteria and results are
      // a separate document and a separate screen, so they are left alone.
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.pmccCriteria })
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.pmccResults })
      options?.onSuccess?.(criteria)
    }
  })
}
