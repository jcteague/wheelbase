// The 4-dp TEXT form every decimal value takes on its way into SQLite or across IPC.
// Rounding is passed explicitly so the result never depends on which module happened
// to call Decimal.set() first.

import Decimal from 'decimal.js'

// Round before formatting: toFixed alone keeps the sign of a tiny negative, giving -0.0000.
const toText4 = (value: Decimal.Value): string =>
  new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)

/** A non-money ratio (delta, IV, yield, percentage) rounded half-up to 4 dp. */
export const fixed4 = toText4

/** A money value (price, premium, strike, P&L) rounded half-up to the 4-dp TEXT convention. */
export const money4 = toText4
