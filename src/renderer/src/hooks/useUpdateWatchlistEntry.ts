import { type UseMutationResult, useQueryClient } from '@tanstack/react-query'
import {
  type ApiError,
  type WatchlistEntry,
  type WatchlistEntryPayload,
  type WatchlistSnapshot,
  updateWatchlistEntry
} from '../api/watchlist'
import { useBenchMutation } from './useBenchMutation'
import { watchlistQueryKeys } from './watchlistQueryKeys'

/** [US-69] An edit changes the inputs the verdict engine judges on, so it can move the
 *  stock between bench sections — a lowered IVR trigger is exactly that case.
 *
 *  The saved record is written straight into the cached snapshot row before the refetch is
 *  asked for, because the panel is handed back the moment the mutation settles: without it
 *  the trader would watch their old thesis and conditions reappear for the length of a
 *  full re-quote. Only the entry is seeded — the verdict is the engine's answer against
 *  fresh market data, so that one is left for the refetch rather than guessed at here. */
export function useUpdateWatchlistEntry(): UseMutationResult<
  WatchlistEntry,
  ApiError,
  WatchlistEntryPayload
> {
  const queryClient = useQueryClient()

  return useBenchMutation(updateWatchlistEntry, (entry) => {
    queryClient.setQueryData<WatchlistSnapshot>(watchlistQueryKeys.snapshot, (previous) =>
      previous === undefined
        ? previous
        : {
            ...previous,
            rows: previous.rows.map((row) =>
              row.entry.ticker === entry.ticker ? { ...row, entry } : row
            )
          }
    )
  })
}
