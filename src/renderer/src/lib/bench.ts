import type { ScreenerCandidate, ScreenerResults } from '../api/screener'
import type { EntryVerdict, Gate, WatchlistSnapshot, WatchlistSnapshotRow } from '../api/watchlist'

/**
 * [US-96] The bench: one watchlist stock joined to the screener's view of it.
 *
 * The snapshot answers "do the trader's own conditions hold?", the screener answers "is
 * there a put worth selling today?". Only a stock both halves clear reaches Meets criteria;
 * every other stock waits with the single most decisive reason why.
 */
export type BenchStock = {
  ticker: string
  row: WatchlistSnapshotRow
  /** The ranked put, when the screener produced one — carried even while the stock waits,
   *  so the detail panel can show what is being held back. */
  candidate: ScreenerCandidate | null
  /** The screener's own 1-based rank; null while the stock waits. */
  rank: number | null
  /** Why the stock is waiting; '' once it meets criteria. */
  reason: string
  /** The meets-criteria headline; null while the stock is waiting. */
  verdictCopy: string | null
}

export type Bench = {
  meets: BenchStock[] // screener rank order
  waiting: BenchStock[] // watchlist order
}

const OUTAGE_REASON = 'Data unavailable \u00b7 not evaluated'
const UNSCREENED_REASON = 'Not screened yet'
const REASON_SEPARATOR = ' \u00b7 '

// The three rules below are the renderer's copy of `isBlocking`, `reasonsFor` and
// `allGatesPass` in `src/main/core/watchlist-signal.ts`, over the IPC mirror of the same
// `EntryVerdict`. The renderer cannot import from `src/main/`, so they are duplicated
// deliberately — change one side and change the other, keeping the gate ordering identical.

/** A gate holds the stock back while it is `unmet` or `unknown` — the absence of a refusal
 *  is not a pass, so an unknown blocks exactly as an unmet condition does. */
function isBlocking(gate: Gate): boolean {
  return gate.verdict === 'unmet' || gate.verdict === 'unknown'
}

/** The labels of every gate holding the stock back, most decisive first: earnings keeps a
 *  trader out whatever the price, and a price miss outranks an IV reading. */
function reasonsFor(verdict: EntryVerdict): string[] {
  return [verdict.earnings, verdict.price, verdict.iv]
    .filter(isBlocking)
    .map((gate) => gate.label)
    .filter((label): label is string => label !== null)
}

function allGatesPass(verdict: EntryVerdict): boolean {
  return ![verdict.price, verdict.iv, verdict.earnings].some(isBlocking)
}

/** A stock with no personal conditions is cleared by the screening defaults alone, so
 *  claiming "all conditions met" would credit the trader with a judgement they never made. */
function meetsCopy(verdict: EntryVerdict): string {
  const gates = [verdict.price, verdict.iv, verdict.earnings]
  return gates.some((gate) => gate.verdict === 'met')
    ? 'All conditions met'
    : 'Screening criteria met'
}

type Ranking = { candidate: ScreenerCandidate; rank: number }

type RankedBenchStock = BenchStock & { rank: number }

/** First occurrence wins: `ranked` is already in the engine's order and the renderer never
 *  re-sorts it, so the best contract for a ticker is the first one it appears in. */
function rankingsByTicker(results: ScreenerResults | undefined): Map<string, Ranking> {
  const rankings = new Map<string, Ranking>()
  results?.ranked.forEach((candidate, index) => {
    if (!rankings.has(candidate.ticker)) {
      rankings.set(candidate.ticker, { candidate, rank: index + 1 })
    }
  })
  return rankings
}

function exclusionsByTicker(results: ScreenerResults | undefined): Map<string, string> {
  return new Map(results?.excluded.map((exclusion) => [exclusion.ticker, exclusion.reason]) ?? [])
}

export function buildBench(
  snapshot: WatchlistSnapshot,
  results: ScreenerResults | undefined
): Bench {
  const rankings = rankingsByTicker(results)
  const exclusions = exclusionsByTicker(results)

  const stocks = snapshot.rows.map((row): BenchStock => {
    const ticker = row.entry.ticker
    const ranking = rankings.get(ticker) ?? null
    const meets = results?.status === 'ok' && allGatesPass(row.verdict) && ranking !== null

    if (meets) {
      return {
        ticker,
        row,
        candidate: ranking.candidate,
        rank: ranking.rank,
        reason: '',
        verdictCopy: meetsCopy(row.verdict)
      }
    }

    return {
      ticker,
      row,
      candidate: ranking?.candidate ?? null,
      rank: null,
      reason: waitingReason(row.verdict, results?.status, exclusions.get(ticker)),
      verdictCopy: null
    }
  })

  // A rank is exactly what a stock gets for clearing both halves, so it doubles as the
  // partition. `meets` follows the screener's ranking, not the watchlist's order — the
  // bench is a queue of what to sell next; `waiting` keeps the trader's own order.
  const ranked = stocks.filter((stock): stock is RankedBenchStock => stock.rank !== null)

  return {
    meets: ranked.sort((a, b) => a.rank - b.rank),
    waiting: stocks.filter((stock) => stock.rank === null)
  }
}

/**
 * One reason, in precedence order: an outage first — nothing was judged, so no other
 * reason would be honest; then the trader's own blocking conditions, which outrank the
 * engine's wording for the same fact; then the screener's exclusion verbatim, because the
 * engine owns that copy; and finally the stock simply has not been screened yet.
 */
function waitingReason(
  verdict: EntryVerdict,
  status: ScreenerResults['status'] | undefined, // undefined while the screen is still loading
  exclusion: string | undefined
): string {
  if (status === 'provider_unavailable') return OUTAGE_REASON

  const gateReasons = reasonsFor(verdict)
  if (gateReasons.length > 0) return gateReasons.join(REASON_SEPARATOR)

  return exclusion ?? UNSCREENED_REASON
}

/** The stock the page opens on: the best put on the bench, else the first stock the trader
 *  is watching, else nothing to show. */
export function defaultSelection(bench: Bench): string | null {
  return bench.meets[0]?.ticker ?? bench.waiting[0]?.ticker ?? null
}
