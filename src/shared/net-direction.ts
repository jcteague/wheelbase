// Which way a signed net's cash went — shared by the PMCC roll sheets (renderer) and the PMCC
// leg timeline engine (main).
import Decimal from 'decimal.js'

/** Which way a net's cash went: paid out, taken in, or neither. */
export type NetDirection = 'debit' | 'credit' | 'even'

/** The direction of a signed received − paid net. */
export function netDirection(net: Decimal): NetDirection {
  if (net.isZero()) return 'even'
  return net.isNegative() ? 'debit' : 'credit'
}
