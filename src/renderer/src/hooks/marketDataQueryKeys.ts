export const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market-data', 'stock-quotes', [...tickers].sort().join(',')] as const,
  marketStatus: ['market-data', 'market-status'] as const,
  optionSnapshots: (symbols: string[]) =>
    ['market-data', 'option-snapshots', [...symbols].sort().join(',')] as const
}
