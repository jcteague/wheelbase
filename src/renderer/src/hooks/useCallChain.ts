import { useQuery } from '@tanstack/react-query'
import type { ApiError } from '../api/error'
import { getOptionChain, type OptionChainFilter, type OptionChainQuote } from '../api/market-data'
import {
  chainWindow,
  filterCallChain,
  strikeBounds,
  type ChainStatus,
  type LegPreset
} from '../lib/pmcc-entry'
import { tickerSchema } from '../schemas/common'
import { marketDataQueryKeys } from './marketDataQueryKeys'

const POLL_INTERVAL_MS = 60_000
const STALE_TIME_MS = 30_000

export type UseCallChainInput = {
  ticker: string
  preset: LegPreset
  /** The underlying's price, when known — bounds the strikes to one side of it. */
  underlyingPrice: string | null
  /** The leg's selected contract — kept in the list even once its delta leaves the band. */
  selectedContractId?: string
  /** `false` while the leg is off screen: no request and no polling; loaded contracts stay. */
  enabled?: boolean
}

export type UseCallChainResult = {
  /** `idle` while the ticker is empty or invalid: nothing is requested, nothing is loading. */
  status: ChainStatus
  contracts: OptionChainQuote[]
  error: ApiError | null
}

type OptionChainKey = ReturnType<typeof marketDataQueryKeys.optionChain>

/** [US-101] One leg's call chain, polled, narrowed to the ticker's standard contracts in
 *  the preset's delta band. */
export function useCallChain({
  ticker,
  preset,
  underlyingPrice,
  selectedContractId,
  enabled = true
}: UseCallChainInput): UseCallChainResult {
  const parsed = tickerSchema.safeParse(ticker)
  // No `limit`: the adapter follows every page only when the caller is not paging itself, and a
  // 180+ DTE call window on a liquid name runs well past one 250-contract page.
  const filter: OptionChainFilter = {
    underlying: parsed.success ? parsed.data : ticker,
    type: 'call',
    ...chainWindow(preset, new Date()),
    ...strikeBounds(preset, underlyingPrice)
  }

  const query = useQuery<OptionChainQuote[], ApiError, OptionChainQuote[], OptionChainKey>({
    queryKey: marketDataQueryKeys.optionChain(filter),
    queryFn: () => getOptionChain(filter),
    enabled: enabled && parsed.success,
    staleTime: STALE_TIME_MS,
    refetchInterval: POLL_INTERVAL_MS,
    // A re-keyed request for the same underlying (new strike bound, new day) keeps the
    // current page — and the selected contract's quote — until the new page lands. A
    // different ticker's contracts are never carried over.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2].underlying === filter.underlying ? previous : undefined,
    select: (quotes) =>
      filterCallChain(quotes, preset, {
        underlying: filter.underlying,
        keepContractId: selectedContractId
      })
  })

  if (!parsed.success) return { status: 'idle', contracts: [], error: null }
  return { status: query.status, contracts: query.data ?? [], error: query.error }
}
