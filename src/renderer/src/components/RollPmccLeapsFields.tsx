// [US-105] The replacement LEAPS' inputs: the sale proceeds and replacement debit, then the
// shared strike, expiration, fill date and read-only contracts.
import type { RollPmccLeapsFormValues } from '../schemas/roll-pmcc-leaps'
import { PmccRollFields, type PmccRollCashField } from './PmccRollFields'

const CASH_FIELDS: readonly [
  PmccRollCashField<RollPmccLeapsFormValues>,
  PmccRollCashField<RollPmccLeapsFormValues>
] = [
  { name: 'proceeds', label: 'Proceeds from close / share', idSuffix: 'proceeds' },
  { name: 'newDebit', label: 'Debit (buy to open) / share', idSuffix: 'debit' }
]

type RollPmccLeapsFieldsProps = {
  contracts: number
  /** `null` until the replacement expiration is complete and accepted. */
  replacementDte: number | null
}

export function RollPmccLeapsFields({
  contracts,
  replacementDte
}: RollPmccLeapsFieldsProps): React.JSX.Element {
  return (
    <PmccRollFields<RollPmccLeapsFormValues>
      header="Replacement LEAPS"
      idPrefix="pmcc-leaps-roll"
      cashFields={CASH_FIELDS}
      contracts={contracts}
      replacementDte={replacementDte}
    />
  )
}
