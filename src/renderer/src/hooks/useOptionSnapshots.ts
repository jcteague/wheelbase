import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { buildOccSymbol } from '../../../shared/option-symbol'
import {
  getOptionSnapshots,
  type OptionSnapshotsBySymbol,
  type OptionSnapshotsResult
} from '../api/market-data'
import { marketDataQueryKeys } from './marketDataQueryKeys'

export type ActiveLegSummary = {
  ticker: string
  expiration: string | null
  strike: string | null
  instrumentType: 'PUT' | 'CALL' | null
}

type UseOptionSnapshotsOptions = {
  session?: 'regular' | 'pre' | 'post' | 'closed'
}

const POLL_INTERVAL_MS = 60_000
const STALE_TIME_MS = 30_000

function legsToOccSymbols(legs: ActiveLegSummary[]): string[] {
  const symbols: string[] = []
  for (const leg of legs) {
    if (!leg.instrumentType || !leg.expiration || !leg.strike) continue
    try {
      symbols.push(
        buildOccSymbol({
          ticker: leg.ticker,
          expiration: leg.expiration,
          strike: leg.strike,
          instrumentType: leg.instrumentType
        })
      )
    } catch {
      // Skip legs that fail validation (e.g. strike <= 0).
    }
  }
  return symbols.sort()
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
