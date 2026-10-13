// [US-104] [US-105] The confirmation above the position once a PMCC roll is recorded — a short
// call or the LEAPS: both legs of the pair and the one net line the cost-basis history shows.
import type { LegDetail, RollPmccLeapsResponse } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { netDirection, pmccRecordedRollNet } from '../lib/pmcc-roll'
import type { PmccRecordedRoll } from '../lib/pmcc-roll-recorded'
import { AlertBox } from './ui/AlertBox'

type BannerCopy = {
  testId: string
  closeVerb: string
  openVerb: string
  rollLabel: string
  /** The leg whose premium was received: the new short, or the LEAPS sold to close. */
  received: LegDetail
  /** The leg whose premium was paid: the short bought back, or the replacement LEAPS. */
  paid: LegDetail
  /** LEAPS only: the effective share cost if exercised, named as the new strike plus basis. */
  exerciseCost: string | null
}

function bannerCopy(recorded: PmccRecordedRoll): BannerCopy {
  const { rollFromLeg: from, rollToLeg: to } = recorded.result
  return recorded.kind === 'short'
    ? {
        testId: 'pmcc-roll-recorded-banner',
        closeVerb: 'bought to close',
        openVerb: 'sold',
        rollLabel: `Short-call roll #${recorded.result.shortCallRollNumber}`,
        received: to,
        paid: from,
        exerciseCost: null
      }
    : {
        testId: 'pmcc-leaps-roll-recorded-banner',
        closeVerb: 'sold to close',
        openVerb: 'bought to open',
        rollLabel: `LEAPS roll #${recorded.result.leapsRollNumber}`,
        received: from,
        paid: to,
        exerciseCost: leapsExerciseCost(recorded.result)
      }
}

function leapsExerciseCost({ ledger, rollToLeg }: RollPmccLeapsResponse): string {
  return `Effective share cost if exercised: ${fmtMoney(ledger.effectiveShareCost)} — the ${fmtMoney(rollToLeg.strike)} strike plus ${fmtMoney(ledger.basisPerShare)} basis.`
}

type PmccRollRecordedBannerProps = {
  recorded: PmccRecordedRoll
}

export function PmccRollRecordedBanner({
  recorded
}: PmccRollRecordedBannerProps): React.JSX.Element {
  const { position, rollFromLeg: from, rollToLeg: to } = recorded.result
  const { testId, closeVerb, openVerb, rollLabel, received, paid, exerciseCost } =
    bannerCopy(recorded)
  const contract = (leg: LegDetail): string =>
    `${position.ticker} ${fmtMoney(leg.strike)} CALL ${leg.expiration}`
  const net = pmccRecordedRollNet({
    received: received.premiumPerContract,
    paid: paid.premiumPerContract,
    contracts: to.contracts
  })
  return (
    <AlertBox variant="success" data-testid={testId}>
      Rolled — {closeVerb} {contract(from)} at {fmtMoney(from.premiumPerContract)}, {openVerb}{' '}
      {contract(to)} at {fmtMoney(to.premiumPerContract)}. {rollLabel} {netDirection(net.net)} · $
      {net.perShare} per share (${net.total} total). Both legs share one roll chain.
      {exerciseCost && ` ${exerciseCost}`}
    </AlertBox>
  )
}
