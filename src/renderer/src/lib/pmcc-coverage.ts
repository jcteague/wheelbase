// The PMCC coverage label — what the open legs say about the short-call coverage of the LEAPS.
// The positions-list card [US-108] and the detail header [US-115] pass the same counts, so
// both print the same `N of M covered`.

export interface PmccCoverageCounts {
  shortCount: number
  shortContracts: number
  leapsContracts: number
}

function openLegsLabel(shortCount: number): string {
  if (shortCount === 0) return 'LEAPS open · no short call'
  return shortCount === 1 ? 'LEAPS + short call open' : `LEAPS + ${shortCount} short calls open`
}

/** Suffixes `N of M covered` only while the shorts cover some, but not all, LEAPS contracts. */
export function pmccCoverageLabel({
  shortCount,
  shortContracts,
  leapsContracts
}: PmccCoverageCounts): string {
  const label = openLegsLabel(shortCount)
  const partial = shortContracts > 0 && shortContracts < leapsContracts
  return partial ? `${label} · ${shortContracts} of ${leapsContracts} covered` : label
}
