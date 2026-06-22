import { useMutation } from '@tanstack/react-query'
import { collectIvrNow, type ApiError, type CollectIvrNowResult } from '../api/ivr'

export function useCollectIvrNow(): ReturnType<typeof useMutation<CollectIvrNowResult, ApiError>> {
  return useMutation<CollectIvrNowResult, ApiError>({
    mutationFn: collectIvrNow
  })
}
