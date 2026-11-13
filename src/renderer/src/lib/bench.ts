import type { ScreenerCandidate, ScreenerCandidateEarnings, ScreenerResults } from '../api/screener'
import type { EntryVerdict, Gate, WatchlistSnapshot, WatchlistSnapshotRow } from '../api/watchlist'

/**
 * [US-96] The bench: one watchlist stock joined to the screener's view of it.
 *
 * The snapshot answers "do the trader's own conditions hold?", the screener answers "is
 * there a put worth selling today?". Only a stock both halves clear reaches Meets criteria;
 * every other stock waits with the single most decisive reason why.
 *
 * [US-110] The join does not care what was ranked: a wheel put and a PMCC diagonal both
 * carry a ticker (the join key) and an earnings verdict (the card's badge and demotion),
 * and the bench reads nothing else.
 */
export type BenchCandidate = { ticker: string; earnings: ScreenerCandidateEarnings }

/** Either lens's screen: the same envelope, ranking its own kind of candidate. */
export type BenchResults<C extends BenchCandidate = ScreenerCandidate> = Omit<
  ScreenerResults,
  'ranked'
> & { ranked: C[] }

export type BenchStock<C extends BenchCandidate = ScreenerCandidate> = {
  ticker: string
  row: WatchlistSnapshotRow
  /** The ranked candidate, when the screener produced one — carried even while the stock
   *  waits, so the detail panel can show what is being held back. */
  candidate: C | null
  /** The stock's 1-based place in Meets criteria; null while the stock waits. */
  rank: number | null
  /** Why the stock is waiting; '' once it meets criteria. */
  reason: string
  /** The meets-criteria headline; null while the stock is waiting. */
  verdictCopy: string | null
}

export type Bench<C extends BenchCandidate = ScreenerCandidate> = {
  meets: BenchStock<C>[] // screener rank order, numbered 1..n
  waiting: BenchStock<C>[] // watchlist order
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

/** A candidate and its place in the engine's order — the order Meets criteria follows. */
type Ranking<C> = { candidate: C; enginePosition: number }

/** First occurrence wins: `ranked` is already in the engine's order and the renderer never
 *  re-sorts it, so the best contract for a ticker is the first one it appears in. */
function rankingsByTicker<C extends BenchCandidate>(
  results: BenchResults<C> | undefined
): Map<string, Ranking<C>> {
  const rankings = new Map<string, Ranking<C>>()
  results?.ranked.forEach((candidate, enginePosition) => {
    if (!rankings.has(candidate.ticker)) {
      rankings.set(candidate.ticker, { candidate, enginePosition })
    }
  })
  return rankings
}

function exclusionsByTicker(
  results: BenchResults<BenchCandidate> | undefined
): Map<string, string> {
  return new Map(results?.excluded.map((exclusion) => [exclusion.ticker, exclusion.reason]) ?? [])
}

export function buildBench<C extends BenchCandidate>(
  snapshot: WatchlistSnapshot,
  results: BenchResults<C> | undefined
): Bench<C> {
  const rankings = rankingsByTicker(results)
  const exclusions = exclusionsByTicker(results)

  // A stock meets criteria only when both halves clear it; `qualifying` is its ranking
  // then, and null for every stock that waits.
  const judged = snapshot.rows.map((row) => {
    const ranking = rankings.get(row.entry.ticker) ?? null
    const clears = results?.status === 'ok' && allGatesPass(row.verdict)
    return { row, ranking, qualifying: clears ? ranking : null }
  })

  // `meets` follows the screener's ranking, not the watchlist's order — the bench is a
  // queue of what to sell next — and the rank is the stock's place in that queue, so a
  // better-scored stock the trader's conditions hold back leaves no gap in the numbering.
  const meets = judged
    .flatMap(({ row, qualifying }) => (qualifying === null ? [] : [{ row, qualifying }]))
    .sort((a, b) => a.qualifying.enginePosition - b.qualifying.enginePosition)
    .map(
      ({ row, qualifying }, index): BenchStock<C> => ({
        ticker: row.entry.ticker,
        row,
        candidate: qualifying.candidate,
        rank: index + 1,
        reason: '',
        verdictCopy: meetsCopy(row.verdict)
      })
    )

  // `waiting` keeps the trader's own order.
  const waiting = judged
    .filter(({ qualifying }) => qualifying === null)
    .map(
      ({ row, ranking }): BenchStock<C> => ({
        ticker: row.entry.ticker,
        row,
        candidate: ranking?.candidate ?? null,
        rank: null,
        reason: waitingReason(row.verdict, results?.status, exclusions.get(row.entry.ticker)),
        verdictCopy: null
      })
    )

  return { meets, waiting }
}

/**
 * One reason, in precedence order: an outage first — nothing was judged, so no other
 * reason would be honest; then the trader's own blocking conditions, which outrank the
 * engine's wording for the same fact; then the screener's exclusion verbatim, because the
 * engine owns that copy; and finally the stock simply has not been screened yet.
 */
function waitingReason(
  verdict: EntryVerdict,
  status: BenchResults['status'] | undefined, // undefined while the screen is still loading
  exclusion: string | undefined
): string {
  if (status === 'provider_unavailable') return OUTAGE_REASON

  const gateReasons = reasonsFor(verdict)
  if (gateReasons.length > 0) return gateReasons.join(REASON_SEPARATOR)

  return exclusion ?? UNSCREENED_REASON
}

/** The stock the page opens on: the best candidate on the bench, else the first stock the
 *  trader is watching, else nothing to show. */
export function defaultSelection<C extends BenchCandidate>(bench: Bench<C>): string | null {
  return bench.meets[0]?.ticker ?? bench.waiting[0]?.ticker ?? null
}
