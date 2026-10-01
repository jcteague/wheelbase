import type { OptionChainFilter } from '../api/market-data'

export const marketDataQueryKeys = {
  marketStatus: ['market', 'status'] as const,
  stockQuotes: (tickers: string[]) =>
    ['market', 'stock-quotes', [...tickers].sort().join(',')] as const,
  optionSnapshots: (symbols: string[]) =>
    ['market', 'option-snapshots', [...symbols].sort().join(',')] as const,
  // [US-68] Scoped away from optionSnapshots on purpose: the promoted form's quote is
  // a one-shot confirmation, and sharing a key would let its frozen result serve the
  // cockpit's polling reads (and vice versa).
  promotedQuote: (symbol: string) => ['market', 'promoted-quote', symbol] as const,
  // [US-101] Scoped away from stockQuotes for the same reason: the PMCC picker takes one
  // price snapshot to bound its chain request, and a live tick must not re-key that request.
  underlyingPrice: (symbol: string) => ['market', 'underlying-price', symbol] as const,
  optionChain: (filter: OptionChainFilter) => ['market', 'option-chain', filter] as const
}
