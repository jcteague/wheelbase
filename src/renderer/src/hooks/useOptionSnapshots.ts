import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { occSymbolForLeg, type OccLegInput } from '../../../shared/option-symbol'
import {
  getOptionSnapshots,
  type OptionSnapshotsBySymbol,
  type OptionSnapshotsResult
} from '../api/market-data'
import { marketDataQueryKeys } from './marketDataQueryKeys'

export type ActiveLegSummary = OccLegInput

type UseOptionSnapshotsOptions = {
  session?: 'regular' | 'pre' | 'post' | 'closed'
}

const POLL_INTERVAL_MS = 60_000
const STALE_TIME_MS = 30_000

function legsToOccSymbols(legs: ActiveLegSummary[]): string[] {
  return legs.flatMap((leg) => occSymbolForLeg(leg) ?? []).sort()
}

export type UseOptionSnapshotsResult = Omit<
  UseQueryResult<OptionSnapshotsResult, Error>,
  'data'
> & {
  data: OptionSnapshotsBySymbol | undefined
  unavailable: boolean
}

export function useOptionSnapshots(
  legs: ActiveLegSummary[],
  options: UseOptionSnapshotsOptions = {}
): UseOptionSnapshotsResult {
  const symbols = useMemo(() => legsToOccSymbols(legs), [legs])
  const queryKey = useMemo(() => marketDataQueryKeys.optionSnapshots(symbols), [symbols])

  const query = useQuery<OptionSnapshotsResult, Error>({
    queryKey,
    queryFn: () => getOptionSnapshots(symbols),
    enabled: symbols.length > 0,
    refetchInterval: options.session === 'closed' ? false : POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true
  })

  return {
    ...query,
    data: query.data?.snapshots,
    unavailable: query.data?.unavailable ?? false
  } as UseOptionSnapshotsResult
}
