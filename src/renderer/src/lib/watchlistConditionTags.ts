import type { WatchlistEntry } from '../api/watchlist'

// Formats a 4dp TEXT money value for compact display: "38.0000" → "38", "38.5000" → "38.5".
function formatOwnBelow(value: string): string {
  return parseFloat(value).toString()
}

/** One field per condition an entry can carry, `null` where the trader set none. Keyed by
 *  condition rather than returned as a flat list so a caller that needs one condition reads
 *  its field instead of parsing wording out of a joined string. */
export type ConditionTagParts = {
  price: string | null
  ivr: string | null
  postEarnings: string | null
  core: string | null
}

// The wording of every condition chip, mirroring the mockup's `conditionTags()`.
// Display-only in US-63 (click-to-edit is US-69).
export function conditionTagParts(entry: WatchlistEntry): ConditionTagParts {
  return {
    price: entry.ownBelowPrice == null ? null : `≤ $${formatOwnBelow(entry.ownBelowPrice)}`,
    ivr: entry.ivrTrigger == null ? null : `IVR ≥ ${entry.ivrTrigger}`,
    postEarnings: entry.postEarningsOnly ? 'post-earnings' : null,
    core: entry.coreHolding ? 'core' : null
  }
}
