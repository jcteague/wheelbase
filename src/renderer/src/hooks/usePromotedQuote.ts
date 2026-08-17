import { useQuery } from '@tanstack/react-query'
import { buildOccSymbol } from '../../../shared/option-symbol'
import { getOptionSnapshots, type OptionSnapshotsResult } from '../api/market-data'
import type { PromotedCandidate, PromotedQuote } from '../lib/promote'
import { marketDataQueryKeys } from './marketDataQueryKeys'

/**
 * The promoted contract's OCC symbol, or `null` when there is nothing to quote.
 * A promoted payload that cannot build a symbol disables the query rather than
 * crashing the form — the banner then reads as a plain pending state.
 */
function promotedOccSymbol(promoted: PromotedCandidate | undefined): string | null {
  if (!promoted) return null
  try {
    return buildOccSymbol({
      ticker: promoted.ticker,
      expiration: promoted.expiration,
      strike: promoted.strike,
      instrumentType: 'PUT'
    })
  } catch {
    return null
  }
}

/**
 * The one-shot fresh quote the promoted new-wheel form reconciles against.
 *
 * Deliberately not `useOptionSnapshots`: this is a point-in-time confirmation on
 * form open, not a live ticker — a 60s poll would keep flipping the banner while
 * the trader types. Every failure mode (rejected query, provider outage, a symbol
 * the provider doesn't know) collapses to `'failed'`, so the form degrades to the
 * screener snapshot instead of blocking (the boundary-I/O rule from the
 * alert-evaluation-failure-isolation ADR).
 */
export function usePromotedQuote(promoted: PromotedCandidate | undefined): {
  quote: PromotedQuote
} {
  const symbol = promotedOccSymbol(promoted)

  const query = useQuery<OptionSnapshotsResult, Error>({
    queryKey: marketDataQueryKeys.promotedQuote(symbol ?? ''),
    queryFn: () => getOptionSnapshots([symbol as string]),
    enabled: symbol !== null,
    staleTime: Infinity,
    // Dropped as soon as the form unmounts. `staleTime: Infinity` alone would let a
    // second promote of the same contract resolve instantly from cache, showing the
    // *previous* visit's mark and timestamp as though they were the fresh quote —
    // the exact staleness this reconciliation exists to catch.
    gcTime: 0,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false
  })

  return { quote: toPromotedQuote(query.isError, query.data, promoted, symbol) }
}

function toPromotedQuote(
  isError: boolean,
  data: OptionSnapshotsResult | undefined,
  promoted: PromotedCandidate | undefined,
  symbol: string | null
): PromotedQuote {
  if (!promoted) return 'pending'
  // A promoted candidate whose symbol won't build is a quote the form cannot get —
  // the same outcome as an outage, and the trader is owed the same explanation.
  if (isError || symbol === null) return 'failed'
  if (!data) return 'pending'
  const snapshot = data.snapshots[symbol]
  if (data.unavailable || !snapshot) return 'failed'
  return { mark: snapshot.mid, timestamp: snapshot.timestamp }
}
