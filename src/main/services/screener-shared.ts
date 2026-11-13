// [US-65/US-110] What the wheel and PMCC screener services share past the boundary reads:
// the exclusion row both lenses report, the per-ticker outcome, the IV-rank join, strike
// validation, and how a ticker that did not rank is explained. Lifted here so neither
// service imports the other.
import type Database from 'better-sqlite3'
import { compareAsc, parseISO } from 'date-fns'
import { isWellFormedStrike, type CandidateStrike, type DteWindow } from '../core/candidate-chain'
import { isUsableState } from '../core/ivr-freshness'
import type { PmccExclusionCode } from '../core/pmcc-screener'
import type { EarningsLookup, ExclusionCode, IvRank } from '../core/screener'
import { logger } from '../logger'
import type { TickerChainResult } from './candidate-chains'
import type { EarningsCalendarKnowledge } from './earnings-dates'
import { readIvRankLookup, type IvRankPair } from './iv-rank-lookup'
import type { IvRunState } from './iv-run-state'
import { readTradingCalendar } from './trading-calendar-store'

// [US-110] One exclusion row serves both lenses, so the code spans the wheel's and the
// PMCC engine's filter codes plus the two chain-level verdicts.
export type ScreenerExclusionCode =
  | ExclusionCode
  | PmccExclusionCode
  | 'no_options_listed'
  | 'data_unavailable'

export type ScreenerExclusion = {
  ticker: string
  code: ScreenerExclusionCode
  reason: string
}

// A ticker either got screened or never made it far enough to be — the second case
// carries the reason straight into the excluded list.
export type TickerOutcome<Screened> = { screened: Screened } | { exclusion: ScreenerExclusion }

// Everything a screener needs to judge one ticker's chains, past the boundary reads.
export type ScreenContext<Criteria> = {
  ivRanks: Map<string, IvRank>
  prices: Map<string, string>
  earnings: Map<string, EarningsLookup>
  criteria: Criteria
  currentDate: Date
}

/** The verdict for a ticker we could not get usable data for — whether its chain never
 *  arrived or the engine choked on a quote. Both paths must read identically to the
 *  trader, so the code and its wording stay together here. */
export function dataUnavailable(ticker: string): ScreenerExclusion {
  return { ticker, code: 'data_unavailable', reason: 'market data unavailable' }
}

// A chain that never made it far enough to screen. Excluding the `ok` case here is what
// lets `chainFailureExclusion` promise a real exclusion rather than a maybe-undefined one.
type FailedChain = Exclude<TickerChainResult, { status: 'ok' }>

/** The exclusion a ticker-level chain failure reports to the trader. A chain query is
 *  bounded to a DTE window, so an empty result means nothing is quoted *in that window* —
 *  the ticker may well list options at other expirations. */
export function chainFailureExclusion(
  chain: FailedChain,
  contracts: 'puts' | 'calls',
  window: DteWindow
): ScreenerExclusion {
  switch (chain.status) {
    case 'no_options_listed':
      return {
        ticker: chain.ticker,
        code: 'no_options_listed',
        reason: `no ${contracts} quoted in the ${window.min}–${window.max} DTE window`
      }
    case 'data_unavailable':
      return dataUnavailable(chain.ticker)
  }
}

/**
 * Freshness-assessed IV rank per ticker — or why it is absent — judged against the cached
 * exchange calendar and what the earnings store knows about each ticker's last print.
 *
 * Both reads degrade internally to "unknown for everyone" rather than sinking the run:
 * IVR is display-only and never a hard filter, so losing it must not cost the trader
 * the whole screen. The refresh feeding this read is likewise best-effort and logs its
 * own outcomes. That is why there is no catch here — a second one could only ever be
 * reached by a test mock, and would hide a genuine defect if one appeared.
 */
export function readIvRanks(
  db: Database.Database,
  tickers: string[],
  currentDate: Date,
  earnings: Map<string, EarningsCalendarKnowledge>,
  runState: IvRunState
): Map<string, IvRankPair> {
  return readIvRankLookup(db, tickers, {
    now: currentDate,
    calendar: readTradingCalendar(db, currentDate),
    lastEarnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.last])),
    runState
  })
}

/** Only a usable reading with a rank is scored — a flat window withholds the rank, so the
 *  IV-rank band has nothing to judge. The rest still reach the trader on the ranked row,
 *  marked rather than silently priced in. */
export function usableIvRanks(lookups: Map<string, IvRankPair>): Map<string, IvRank> {
  return new Map(
    [...lookups].flatMap(([ticker, { ivRank }]): Array<[string, IvRank]> => {
      if (ivRank === null || ivRank.value === null || !isUsableState(ivRank.state)) return []
      return [[ticker, { value: ivRank.value, observedAt: ivRank.observedAt }]]
    })
  )
}

/** The strikes the engine can safely do Decimal math on. A malformed quote drops
 *  only itself (logged), never the ticker's other strikes — the engine throws on
 *  bad input, so the validation happens here rather than in a catch downstream. */
export function wellFormedStrikes(chain: TickerChainResult & { status: 'ok' }): CandidateStrike[] {
  return chain.strikes.filter((strike) => {
    if (isWellFormedStrike(strike)) return true
    logger.warn(
      { ticker: chain.ticker, contractId: strike.contractId },
      'screener_malformed_strike_dropped'
    )
    return false
  })
}

/** What `representativeExclusion` reads off either engine's per-ticker result. */
type ScreenedTicker = {
  ticker: string
  best: object | null
  excluded: ReadonlyArray<Pick<ScreenerExclusion, 'code' | 'reason'>>
}

/** A screened ticker with no survivor reports its closest miss — `excluded[0]`, the
 *  candidate that got furthest through the filter funnel. A ticker whose strikes were
 *  all dropped before screening (every quote malformed) still gets a row: every
 *  non-ranking ticker must appear in the excluded list, never vanish. */
function representativeExclusion(screened: ScreenedTicker): ScreenerExclusion[] {
  if (screened.best !== null) return []
  if (screened.excluded.length === 0) return [dataUnavailable(screened.ticker)]
  const closest = screened.excluded[0]
  return [{ ticker: screened.ticker, code: closest.code, reason: closest.reason }]
}

/** Splits the per-ticker outcomes into the engine results to rank and one exclusion row
 *  per non-ranking ticker, both in watchlist order. */
export function partitionOutcomes<Screened extends ScreenedTicker>(
  outcomes: TickerOutcome<Screened>[]
): { screened: Screened[]; excluded: ScreenerExclusion[] } {
  return {
    screened: outcomes.flatMap((outcome) => ('screened' in outcome ? [outcome.screened] : [])),
    excluded: outcomes.flatMap((outcome) =>
      'screened' in outcome ? representativeExclusion(outcome.screened) : [outcome.exclusion]
    )
  }
}

/** The newest quote timestamp across the ranked rows, for the stale badge. */
export function newestTimestamp(candidates: ReadonlyArray<{ timestamp: string }>): string | null {
  return candidates.reduce<string | null>(
    (newest, candidate) =>
      newest === null || compareAsc(parseISO(candidate.timestamp), parseISO(newest)) > 0
        ? candidate.timestamp
        : newest,
    null
  )
}
