// [US-104] The replacement short call's inputs: the cost to close and new premium, then the
// shared strike, expiration, fill date and read-only contracts.
import type { RollPmccShortCallFormValues } from '../schemas/roll-pmcc-short-call'
import { PmccRollFields, type PmccRollCashField } from './PmccRollFields'

const CASH_FIELDS: readonly [
  PmccRollCashField<RollPmccShortCallFormValues>,
  PmccRollCashField<RollPmccShortCallFormValues>
] = [
  { name: 'costToClosePerContract', label: 'Cost to close / share', idSuffix: 'cost-to-close' },
  { name: 'newPremiumPerContract', label: 'Premium / share', idSuffix: 'premium' }
]

type RollPmccShortCallFieldsProps = {
  contracts: number
  /** `null` until the replacement expiration is complete and accepted. */
  replacementDte: number | null
}

export function RollPmccShortCallFields({
  contracts,
  replacementDte
}: RollPmccShortCallFieldsProps): React.JSX.Element {
  return (
    <PmccRollFields<RollPmccShortCallFormValues>
      header="Replacement short call"
      idPrefix="pmcc-roll"
      cashFields={CASH_FIELDS}
      contracts={contracts}
      replacementDte={replacementDte}
    />
  )
}
