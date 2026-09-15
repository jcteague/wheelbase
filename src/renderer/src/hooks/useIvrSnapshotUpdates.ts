import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { screenerQueryKeys } from './screenerQueryKeys'
import { watchlistQueryKeys } from './watchlistQueryKeys'

/**
 * [US-100] Refetches the surfaces that render IV rank when a reading lands out of
 * band — an on-add collection finishes after the add response has already returned,
 * so without this push the bench would read `n/a` until the next manual reload.
 */
export function useIvrSnapshotUpdates(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    return window.api.ivr.onSnapshotUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.snapshot })
      void queryClient.invalidateQueries({ queryKey: screenerQueryKeys.results })
    })
  }, [queryClient])
}
