import { useQuery } from '@tanstack/react-query'
import { getStockQuotes, type StockQuotesByTicker } from '../api/market-data'
import { tickerSchema } from '../schemas/common'
import { marketDataQueryKeys } from './marketDataQueryKeys'

/**
 * [US-101] The underlying's price for the PMCC contract picker: one snapshot per ticker, never
 * polled. It only bounds the chain request's strikes, and a moving price would
 * re-key that request — dropping the selected contract's quote behind a "Loading…" flash.
 * Deliberately NOT `useStockQuotes`: that hook owns the main process's single stock-quote stream
 * subscription, so mounting it inside the sheet would replace — and on close, clear — the
 * positions list's live feed underneath.
 */
export function useUnderlyingPrice(ticker: string, { enabled = true } = {}): string | null {
  const parsed = tickerSchema.safeParse(ticker)
  const symbol = parsed.success ? parsed.data : ''

  const query = useQuery<StockQuotesByTicker, Error, string | null>({
    queryKey: marketDataQueryKeys.underlyingPrice(symbol),
    queryFn: () => getStockQuotes([symbol]),
    enabled: enabled && symbol !== '',
    staleTime: Infinity,
    select: (quotes) => quotes[symbol]?.price ?? null
  })

  return query.data ?? null
}
