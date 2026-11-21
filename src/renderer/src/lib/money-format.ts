// Money with the app's U+2212 minus, shared by the PMCC card [US-108] and the PMCC leg timeline
// [US-109].
import Decimal from 'decimal.js'
import { fmtMoneyGrouped } from './format'

/** `fmtMoneyGrouped` signed `+` or U+2212 `−` (the app's minus): `+$1,215.00`, `−$500.00`. */
export function signedMoneyGrouped(value: string): string {
  const amount = new Decimal(value)
  return `${amount.gte(0) ? '+' : '−'}${fmtMoneyGrouped(amount.abs().toString())}`
}

/** `fmtMoneyGrouped` with no `+`, but a negative reads with the U+2212 `−`: `$1.00`, `−$0.61`. */
export function minusMoneyGrouped(value: string): string {
  const amount = new Decimal(value)
  return `${amount.lt(0) ? '−' : ''}${fmtMoneyGrouped(amount.abs().toString())}`
}
