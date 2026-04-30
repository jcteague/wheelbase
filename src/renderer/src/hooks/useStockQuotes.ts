import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getStockQuotes, type StockQuote, type StockQuotesByTicker } from '../api/market-data'
import { marketDataQueryKeys } from './marketDataQueryKeys'

export function mergeTick(
  prev: StockQuotesByTicker | undefined,
  event: IpcStockQuoteEvent
): StockQuotesByTicker {
  const merged: StockQuote = {
    ...event.quote,
    prevClose: event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null
  }
  return { ...prev, [event.ticker]: merged }
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000
const STALE_POLL_INTERVAL_MS = 30 * 1000

type UseStockQuotesResult = UseQueryResult<StockQuotesByTicker, Error> & {
  streamError: IpcStreamErrorEvent | null
  stale: boolean
  minutesAgo: number
}

export function useStockQuotes(tickers: string[]): UseStockQuotesResult {
  const queryClient = useQueryClient()
  // Derive a stable string key from `tickers` so downstream memoization survives
  // parent re-renders that pass a fresh array reference with the same contents.
  const tickersKey = useMemo(() => tickers.slice().sort().join(','), [tickers])
  const sortedTickers = useMemo(
    () => (tickersKey === '' ? [] : tickersKey.split(',')),
    [tickersKey]
  )
  const queryKey = useMemo(() => marketDataQueryKeys.stockQuotes(sortedTickers), [sortedTickers])
  const [streamError, setStreamError] = useState<IpcStreamErrorEvent | null>(null)

  const query = useQuery({
    queryKey,
    queryFn: () => getStockQuotes(sortedTickers),
    enabled: sortedTickers.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: true
  })

  useEffect(() => {
    if (sortedTickers.length === 0) {
      void window.api.setStockQuoteTickers({ tickers: [] })
      return
    }

    let cancelled = false
    window.api
      .setStockQuoteTickers({ tickers: sortedTickers })
      .then((result) => {
        if (cancelled || result.ok) return
        const firstErr = result.errors[0]
        setStreamError({
          feed: 'stockQuotes',
          code: firstErr?.code ?? 'subscription_failed',
          message: firstErr?.message ?? 'Failed to subscribe to stock quote stream',
          reconnectable: true
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStreamError({
          feed: 'stockQuotes',
          code: 'subscription_failed',
          message: err instanceof Error ? err.message : String(err),
          reconnectable: true
        })
      })

    const offTick = window.api.onStockQuote((event) => {
      queryClient.setQueryData(queryKey, (prev: StockQuotesByTicker | undefined) =>
        mergeTick(prev, event)
      )
    })

    const offErr = window.api.onStreamError((event) => {
      setStreamError(event)
    })

    return () => {
      cancelled = true
      offTick()
      offErr()
      void window.api.setStockQuoteTickers({ tickers: [] })
      setStreamError(null)
    }
  }, [queryClient, queryKey, sortedTickers])

  const [staleInfo, setStaleInfo] = useState({ stale: false, minutesAgo: 0 })

  useEffect(() => {
    function evaluate(): void {
      const now = Date.now()
      const age = now - query.dataUpdatedAt
      const newStale = query.dataUpdatedAt > 0 && age > STALE_THRESHOLD_MS
      const newMinutesAgo = query.dataUpdatedAt > 0 ? Math.floor(age / 60_000) : 0
      setStaleInfo((prev) =>
        prev.stale === newStale && prev.minutesAgo === newMinutesAgo
          ? prev
          : { stale: newStale, minutesAgo: newMinutesAgo }
      )
    }
    evaluate()
    const handle = setInterval(evaluate, STALE_POLL_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [query.dataUpdatedAt])

  return { ...query, streamError, stale: staleInfo.stale, minutesAgo: staleInfo.minutesAgo }
}
