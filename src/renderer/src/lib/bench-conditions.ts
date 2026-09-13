import type { WatchlistEntry } from '../api/watchlist'
import { conditionTagParts } from './watchlistConditionTags'

/**
 * [US-96] The entry's saved conditions, sorted by which gate — if any — answers them.
 *
 * `watchlistConditionTags` stays the single source of the wording, so a condition reads
 * identically on a card, on a gate badge, and on the old watchlist row. This only routes
 * its parts: the three conditions a gate reports a verdict on, and the rest, which are
 * descriptions of the stock rather than tests it has to pass.
 */
export type BenchConditions = {
  /** Condition text per gate, or `null` where the trader set no such condition — which
   *  is exactly where the corresponding gate reads `none`. */
  price: string | null
  iv: string | null
  earnings: string | null
  /** Conditions no gate speaks for — today just `core`. */
  tags: string[]
}

// The row chip abbreviates; a badge standing on its own has to read as a whole condition.
const POST_EARNINGS_CONDITION = 'Post-earnings only'

export function benchConditions(entry: WatchlistEntry): BenchConditions {
  const parts = conditionTagParts(entry)

  return {
    price: parts.price,
    iv: parts.ivr,
    earnings: parts.postEarnings === null ? null : POST_EARNINGS_CONDITION,
    tags: [parts.core].filter((tag): tag is string => tag !== null)
  }
}
