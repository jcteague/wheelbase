// [US-64] candidate-chain — pure helpers for screening a watchlist ticker's put chain.
// No I/O, no logging: takes plain values (adapter quotes, error codes) and returns
// plain results. Type-only imports keep this decoupled from the provider vendor.
import Decimal from 'decimal.js'
import { addDays } from 'date-fns'
import type { MarketDataErrorCode, OptionChainQuote } from '../integrations/market-data-provider'

export type DteWindow = { min: number; max: number }

export const DEFAULT_DTE_WINDOW: DteWindow = { min: 30, max: 45 }

// One screenable put strike: the adapter's mid surfaced as `mark`, delta lifted out
// of greeks (null when greeks are absent), plus identity and liquidity fields.
export type CandidateStrike = {
  contractId: string
  strike: string
  expiration: string
  bid: string
  ask: string
  mark: string
  delta: string | null
  openInterest: number | null
  volume: number | null
  timestamp: string
}

// Formats a Date's UTC calendar day as yyyy-MM-dd. UTC is the explicit basis so the
// derived expiration range is deterministic regardless of the caller's timezone and
// matches the calendar-date semantics of Massive's expiration_date strings.
function toUtcYmd(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dteWindowToExpirationRange(
  currentDate: Date,
  window: DteWindow
): { from: string; to: string } {
  return {
    from: toUtcYmd(addDays(currentDate, window.min)),
    to: toUtcYmd(addDays(currentDate, window.max))
  }
}

// A strike is tradeable only with a two-sided quote — a zero or missing bid/ask
// leaves no reliable mark to screen against.
export function isTradeableStrike(bid: string, ask: string): boolean {
  return new Decimal(bid).gt(0) && new Decimal(ask).gt(0)
}

export function toCandidateStrikes(quotes: OptionChainQuote[]): CandidateStrike[] {
  return quotes
    .filter((quote) => isTradeableStrike(quote.bid, quote.ask))
    .map((quote) => ({
      contractId: quote.contractId,
      strike: quote.strike,
      expiration: quote.expiration,
      bid: quote.bid,
      ask: quote.ask,
      mark: quote.mid,
      delta: quote.greeks?.delta ?? null,
      openInterest: quote.openInterest,
      volume: quote.volume,
      timestamp: quote.timestamp
    }))
}

// A 404 proves the provider is reachable but the ticker's chain is unavailable; every
// other error code signals a provider-level fault that may roll up to an outage.
export function classifyChainFailure(code: MarketDataErrorCode): 'ticker' | 'provider' {
  return code === 'not_found' ? 'ticker' : 'provider'
}
