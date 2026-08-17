export const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market', 'stock-quotes', [...tickers].sort().join(',')] as const,
  optionSnapshots: (symbols: string[]) =>
    ['market', 'option-snapshots', [...symbols].sort().join(',')] as const,
  // [US-68] Scoped away from optionSnapshots on purpose: the promoted form's quote is
  // a one-shot confirmation, and sharing a key would let its frozen result serve the
  // cockpit's polling reads (and vice versa).
  promotedQuote: (symbol: string) => ['market', 'promoted-quote', symbol] as const
}
