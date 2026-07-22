import type { WatchlistEntry } from '../api/watchlist'

// Formats a 4dp TEXT money value for compact display: "38.0000" → "38", "38.5000" → "38.5".
function formatOwnBelow(value: string): string {
  return parseFloat(value).toString()
}

// Derives the compact condition tags shown on a watchlist row, mirroring the
// mockup's `conditionTags()`. Display-only in US-63 (click-to-edit is US-69).
export function buildConditionTags(entry: WatchlistEntry): string[] {
  const tags: string[] = []
  if (entry.ownBelowPrice != null) tags.push(`≤ $${formatOwnBelow(entry.ownBelowPrice)}`)
  if (entry.ivrTrigger != null) tags.push(`IVR ≥ ${entry.ivrTrigger}`)
  if (entry.postEarningsOnly) tags.push('post-earnings')
  if (entry.coreHolding) tags.push('core')
  return tags
}
