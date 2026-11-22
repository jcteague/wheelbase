// [US-115] The Sell Short Call sheet: a 460px portal dialog owning the form, the mutation, where
// a rejected sale's server errors land, and the success view.
import { useMemo, useState } from 'react'
import { FormProvider, type FieldPath } from 'react-hook-form'
import type { PmccLedgerTotals } from '../../../main/core/costbasis'
import type { LegDetail, SellPmccShortResponse } from '../api/positions'
import { useOptionSnapshots } from '../hooks/useOptionSnapshots'
import { useRollSheetSubmit } from '../hooks/useRollSheetSubmit'
import { useSellPmccShort } from '../hooks/useSellPmccShort'
import { useSellPmccShortForm } from '../hooks/useSellPmccShortForm'
import { newYorkToday } from '../lib/dates'
import type { PmccEndedCycle } from '../lib/pmcc-sell-short'
import {
  isSellShortErrorField,
  SELL_SHORT_FORM_FIELDS,
  toSellPmccShortPayload,
  type SellPmccShortFormValues
} from '../schemas/sell-pmcc-short'
import { occSymbolForLeg } from '../../../shared/option-symbol'
import { PmccRollSheetDialog } from './PmccRollSheetDialog'
import { SellPmccShortForm } from './SellPmccShortForm'
import { SellPmccShortSuccess } from './SellPmccShortSuccess'

type SellPmccShortSheetProps = {
  positionId: string
  ticker: string
  /** The live LEAPS the short is sold against. */
  leaps: LegDetail
  ledger: PmccLedgerTotals
  /** The last ended short-call cycle; `null` before the first short is retired. */
  previousCycle: PmccEndedCycle | null
  today?: string
  onClose: () => void
  /** Told once the sale is recorded, while the sheet shows its success view. */
  onRecorded?: (response: SellPmccShortResponse) => void
}

const SAVE_FAILED = 'Could not record the short call. Your entries are preserved. Try again.'

/** The form path a server field error lands on; `null` (`__root__`, `__phase__`) is the save alert. */
const errorTarget = (field: string): FieldPath<SellPmccShortFormValues> | null =>
  isSellShortErrorField(field) ? SELL_SHORT_FORM_FIELDS[field] : null

/** The LEAPS' live delta from its option snapshot; `null` while none carries one. */
function useLeapsDelta(ticker: string, leaps: LegDetail): string | null {
  const legs = useMemo(
    () => [
      {
        ticker,
        expiration: leaps.expiration,
        strike: leaps.strike,
        instrumentType: 'CALL' as const
      }
    ],
    [ticker, leaps.expiration, leaps.strike]
  )
  const { data } = useOptionSnapshots(legs)
  const symbol = occSymbolForLeg(legs[0])
  if (symbol === null) return null
  return data?.[symbol]?.greeks?.delta ?? null
}

export function SellPmccShortSheet({
  positionId,
  ticker,
  leaps,
  ledger,
  previousCycle,
  today = newYorkToday(),
  onClose,
  onRecorded
}: SellPmccShortSheetProps): React.JSX.Element {
  const [recorded, setRecorded] = useState<SellPmccShortResponse | null>(null)
  const { methods, schema } = useSellPmccShortForm({
    leaps: {
      strike: leaps.strike,
      expiration: leaps.expiration,
      fillDate: leaps.fillDate,
      contracts: leaps.contracts
    },
    previousShortRetiredOn: previousCycle?.endedOn ?? null,
    today
  })
  const leapsDelta = useLeapsDelta(ticker, leaps)
  const mutation = useSellPmccShort({
    onSuccess: (response) => {
      setRecorded(response)
      onRecorded?.(response)
    }
  })
  const onSubmit = useRollSheetSubmit({
    methods,
    mutation,
    toPayload: (values) => toSellPmccShortPayload(positionId, values),
    errorRouting: { target: errorTarget, saveMessage: SAVE_FAILED, showUnplacedMessages: true }
  })

  return (
    <PmccRollSheetDialog label="Sell Short Call" width={460} onClose={onClose}>
      {recorded ? (
        <SellPmccShortSuccess response={recorded} onClose={onClose} />
      ) : (
        <FormProvider {...methods}>
          <SellPmccShortForm
            schema={schema}
            ticker={ticker}
            leaps={leaps}
            leapsDelta={leapsDelta}
            ledger={ledger}
            previousCycle={previousCycle}
            today={today}
            isPending={mutation.isPending}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        </FormProvider>
      )}
    </PmccRollSheetDialog>
  )
}
