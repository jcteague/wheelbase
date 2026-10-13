// [US-105] What the Roll LEAPS form renders, derived from its values: validity, the DTEs, the net,
// the post-roll ledger, the below-short-strike shortfall, the roll label, the coverage change and
// whether a field rejection leaves the LEAPS open. Pure, no React.
import { parseISO } from 'date-fns'
import type { PmccLegTerms } from '../../../main/core/lifecycle'
import {
  LONG_NOT_AFTER_SHORT,
  leapsStrikeNotBelowShortMessage
} from '../../../main/core/pmcc-rules'
import type { RollPmccLeapsFormValues, RollPmccLeapsSchema } from '../schemas/roll-pmcc-leaps'
import { computeDteFromInput } from './format'
import {
  leapsCoverageChange,
  pmccLeapsPostRoll,
  pmccRollLabel,
  pmccRollNet,
  pmccStrikeShortfall,
  type PmccLeapsLedger,
  type PmccLeapsPostRoll,
  type PmccRollNet
} from './pmcc-roll'

export type LeapsRollViewContext = {
  /** The schema the sheet's form resolves with; `valid` is judged by the same one. */
  schema: RollPmccLeapsSchema
  leaps: PmccLegTerms & { contracts: number }
  /** `null` when no short call is open. */
  openShort: PmccLegTerms | null
  ledger: PmccLeapsLedger
  /** Local calendar date (`yyyy-MM-dd`) the DTE figures are counted from. */
  today: string
  /** The messages the form currently shows on these fields. */
  errors: { newExpiration?: string; newStrike?: string }
}

export type LeapsRollView = {
  valid: boolean
  leapsDte: number | null
  /** The replacement's DTE whenever its expiration parses. */
  replacementDte: number | null
  /** The DTE beside the expiration field: hidden while the field shows an error. */
  fieldDte: number | null
  net: PmccRollNet
  /** `null` while the cash or the strike is undecided. */
  postRoll: PmccLeapsPostRoll | null
  shortfall: string | null
  /** The roll's label with the replacement's DTE; `null` until the roll is valid. */
  label: string | null
  coverageChange: number | null
  /** A shape rejection (uncovered short, strike not below it) leaves the current LEAPS open. */
  leavesLeapsOpen: boolean
}

export function leapsRollView(
  values: RollPmccLeapsFormValues,
  { schema, leaps, openShort, ledger, today, errors }: LeapsRollViewContext
): LeapsRollView {
  const { proceeds, newStrike, newDebit, newExpiration } = values
  // Judged from the values, not RHF's `isValid`: a failed save's `setError` would otherwise
  // disable the retry its own message invites.
  const valid = schema.safeParse(values).success
  const dte = (date: string): number | null => computeDteFromInput(date, parseISO(today))
  const replacementDte = dte(newExpiration)
  const net = pmccRollNet({ received: proceeds, paid: newDebit, contracts: leaps.contracts })
  const postRoll = net
    ? pmccLeapsPostRoll({ ledger, newStrike, contracts: leaps.contracts, net: net.net })
    : null
  const rollLabel = valid
    ? pmccRollLabel(leaps, { strike: newStrike, expiration: newExpiration }, 'MMM yyyy')
    : null
  return {
    valid,
    leapsDte: dte(leaps.expiration),
    replacementDte,
    fieldDte: errors.newExpiration ? null : replacementDte,
    net,
    postRoll,
    shortfall:
      valid && openShort && postRoll
        ? pmccStrikeShortfall(openShort.strike, postRoll.effectiveAfter)
        : null,
    label: rollLabel && `${rollLabel} · ${replacementDte} DTE`,
    coverageChange: valid ? leapsCoverageChange(leaps.expiration, newExpiration) : null,
    leavesLeapsOpen:
      errors.newExpiration === LONG_NOT_AFTER_SHORT.message ||
      (openShort !== null && errors.newStrike === leapsStrikeNotBelowShortMessage(openShort.strike))
  }
}
