// [US-64] candidate-chain — pure helpers for screening a watchlist ticker's put chain.
// No I/O, no logging: takes plain values (adapter quotes, error codes) and returns
// plain results. Type-only imports keep this decoupled from the provider vendor.
import Decimal from 'decimal.js'
import { addDays, format } from 'date-fns'
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

// DTE is counted from the trader's own calendar day, so both the day arithmetic and
// the yyyy-MM-dd formatting use the local timezone — the same basis as the shared
// helpers in src/main/dates.ts. Mixing bases (local addDays, UTC formatting) would
// shift the whole window by a day whenever the run happens outside UTC's calendar day.
export function dteWindowToExpirationRange(
  currentDate: Date,
  window: DteWindow
): { from: string; to: string } {
  return {
    from: format(addDays(currentDate, window.min), 'yyyy-MM-dd'),
    to: format(addDays(currentDate, window.max), 'yyyy-MM-dd')
  }
}

/** The quote string as a finite Decimal, or null when it does not parse to one —
 *  Decimal accepts 'NaN'/'Infinity' without throwing, so finiteness is checked too. */
function toFiniteDecimal(value: string): Decimal | null {
  try {
    const parsed = new Decimal(value)
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}

// A strike is tradeable only with a two-sided quote — a zero, missing, or malformed
// bid/ask leaves no reliable mark to screen against.
export function isTradeableStrike(bid: string, ask: string): boolean {
  const parsedBid = toFiniteDecimal(bid)
  const parsedAsk = toFiniteDecimal(ask)
  return parsedBid !== null && parsedAsk !== null && parsedBid.gt(0) && parsedAsk.gt(0)
}

/** Whether every numeric field the screening engine does Decimal math on parses to a
 *  finite number. The engine's helpers throw on malformed input, so callers screen
 *  strikes through this first rather than relying on a catch that would cost the
 *  ticker its other strikes. */
export function isWellFormedStrike(strike: CandidateStrike): boolean {
  return (
    [strike.bid, strike.ask, strike.mark, strike.strike].every(
      (value) => toFiniteDecimal(value) !== null
    ) &&
    (strike.delta === null || toFiniteDecimal(strike.delta) !== null)
  )
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
