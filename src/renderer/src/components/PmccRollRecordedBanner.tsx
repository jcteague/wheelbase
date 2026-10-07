// [US-104] The confirmation above the position once a short-call roll is recorded: both legs of
// the pair and the one net line the cost-basis history shows for it.
import type { RollPmccShortCallResponse } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { pmccRecordedRollNet } from '../lib/pmcc-roll'
import { AlertBox } from './ui/AlertBox'

type PmccRollRecordedBannerProps = {
  response: RollPmccShortCallResponse
}

export function PmccRollRecordedBanner({
  response
}: PmccRollRecordedBannerProps): React.JSX.Element {
  const { position, rollFromLeg: from, rollToLeg: to, shortCallRollNumber } = response
  const contract = (leg: typeof from | typeof to): string =>
    `${position.ticker} ${fmtMoney(leg.strike)} CALL ${leg.expiration}`
  const net = pmccRecordedRollNet({
    costToClose: from.premiumPerContract,
    premium: to.premiumPerContract,
    contracts: to.contracts
  })
  return (
    <AlertBox variant="success" data-testid="pmcc-roll-recorded-banner">
      Rolled — bought to close {contract(from)} at {fmtMoney(from.premiumPerContract)}, sold{' '}
      {contract(to)} at {fmtMoney(to.premiumPerContract)}. Short-call roll #{shortCallRollNumber}{' '}
      {net.net.isNegative() ? 'debit' : 'credit'} · ${net.perShare} per share (${net.total} total).
      Both legs share one roll chain.
    </AlertBox>
  )
}
