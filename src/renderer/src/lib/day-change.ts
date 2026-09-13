import Decimal from 'decimal.js'
import type { SnapshotQuote } from '../api/watchlist'

export type DayChange = {
  percent: string
  direction: 'up' | 'down' | 'flat'
}

// U+2212 MINUS SIGN rather than a hyphen: it is drawn at the same width and height as the
// plus, so a column of day changes lines up instead of jittering by a pixel.
const MINUS = '\u2212'

/**
 * [US-96] The day change shown beside every last price.
 *
 * Percent moves are money arithmetic, so they go through `Decimal` — a float subtraction of
 * two 2dp prices can land a hair either side of a rounding boundary and flip the last digit.
 * Both values are provider strings and stay strings: they are formatted, never parsed.
 *
 * Direction is read off the *rounded* percent so the colour always agrees with the number
 * on screen — a −0.04% move reads `0.0%` and is drawn flat rather than red.
 */
export function dayChange(quote: SnapshotQuote | null): DayChange | null {
  if (quote === null || quote.prevClose === null) return null

  const prevClose = new Decimal(quote.prevClose)
  // A change measured against nothing is undefined, not infinite. `Decimal` returns Infinity
  // here rather than throwing, and the provider's own null-mapping misses this because the
  // string '0' is truthy.
  if (prevClose.isZero()) return null

  const percent = new Decimal(quote.price)
    .minus(prevClose)
    .dividedBy(prevClose)
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)

  const magnitude = `${percent.abs().toFixed(1)}%`
  // Zero is tested first because it still carries a sign in `Decimal`: a move that rounds to
  // zero is flat, not the gain or the loss the two branches below would otherwise claim it as.
  if (percent.isZero()) return { percent: magnitude, direction: 'flat' }
  if (percent.isPositive()) return { percent: `+${magnitude}`, direction: 'up' }

  return { percent: `${MINUS}${magnitude}`, direction: 'down' }
}
