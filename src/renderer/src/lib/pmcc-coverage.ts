// The PMCC coverage label — what the open legs say about the short-call coverage of the LEAPS.
// The positions-list card [US-108] and the detail header [US-115] pass the same counts, so
// both print the same `N of M covered`.

/** The open legs, as coverage sees them: one entry per open short call, its contract count. A
 *  short count without its contracts, or contracts without a short, cannot be written. */
export interface PmccCoverageCounts {
  leapsContracts: number
  shortContracts: readonly number[]
}

function openLegsLabel(shortCount: number): string {
  if (shortCount === 0) return 'LEAPS open · no short call'
  return shortCount === 1 ? 'LEAPS + short call open' : `LEAPS + ${shortCount} short calls open`
}

/** Suffixes `N of M covered` only while the shorts cover some, but not all, LEAPS contracts. */
export function pmccCoverageLabel({ leapsContracts, shortContracts }: PmccCoverageCounts): string {
  const label = openLegsLabel(shortContracts.length)
  const covered = shortContracts.reduce((sum, contracts) => sum + contracts, 0)
  const partial = covered > 0 && covered < leapsContracts
  return partial ? `${label} · ${covered} of ${leapsContracts} covered` : label
}
