// [US-105] The Roll LEAPS sheet: a portal dialog owning the form, the mutation, and where a
// rejected roll's server errors land.
import { FormProvider } from 'react-hook-form'
import type { PmccLeapsRollField } from '../../../main/core/pmcc-rules'
import type { LegDetail, RollPmccLeapsPayload, RollPmccLeapsResponse } from '../api/positions'
import { useRollPmccLeaps } from '../hooks/useRollPmccLeaps'
import { useRollPmccLeapsForm } from '../hooks/useRollPmccLeapsForm'
import { useRollSheetSubmit } from '../hooks/useRollSheetSubmit'
import { localToday } from '../lib/dates'
import type { PmccLeapsLedger } from '../lib/pmcc-roll'
import { toRollPmccLeapsPayload, type RollPmccLeapsFormValues } from '../schemas/roll-pmcc-leaps'
import { PmccRollSheetDialog } from './PmccRollSheetDialog'
import { RollPmccLeapsForm } from './RollPmccLeapsForm'

type RollPmccLeapsSheetProps = {
  positionId: string
  ticker: string
  leaps: LegDetail
  openShort: LegDetail | null
  /** The position's latest leg fill date; the roll cannot be dated before it. */
  lastEventDate: string
  ledger: PmccLeapsLedger
  today?: string
  onClose: () => void
  onRecorded: (response: RollPmccLeapsResponse) => void
}

const SAVE_FAILED = 'Could not record the roll. Your entries are preserved. Try again.'

/** Every field a rejected roll's server errors name: the payload's and the engine rules'. */
type RollErrorField = Exclude<keyof RollPmccLeapsPayload, 'positionId'> | PmccLeapsRollField

// The payload's cash fields are named for the IPC; the form's for the trader. Keyed by
// `RollErrorField` so a missing or misspelled field fails to compile.
const FORM_FIELD: Record<RollErrorField, keyof RollPmccLeapsFormValues> = {
  proceedsPerContract: 'proceeds',
  replacementDebitPerContract: 'newDebit',
  newStrike: 'newStrike',
  newExpiration: 'newExpiration',
  fillDate: 'fillDate',
  __roll__: '__roll__'
}

const isRollErrorField = (field: string): field is RollErrorField =>
  Object.hasOwn(FORM_FIELD, field)

/** The form path a server field error lands on; `null` (`__root__`, `__phase__`) is the save alert. */
const errorTarget = (field: string): keyof RollPmccLeapsFormValues | null =>
  isRollErrorField(field) ? FORM_FIELD[field] : null

export function RollPmccLeapsSheet({
  positionId,
  ticker,
  leaps,
  openShort,
  lastEventDate,
  ledger,
  today = localToday(),
  onClose,
  onRecorded
}: RollPmccLeapsSheetProps): React.JSX.Element {
  const { methods, schema } = useRollPmccLeapsForm({ leaps, openShort, lastEventDate }, today)
  const mutation = useRollPmccLeaps({ onSuccess: onRecorded })
  const onSubmit = useRollSheetSubmit({
    methods,
    mutation,
    toPayload: (values) => toRollPmccLeapsPayload(values, positionId),
    errorRouting: { target: errorTarget, saveMessage: SAVE_FAILED, showUnplacedMessages: true }
  })

  return (
    <PmccRollSheetDialog label="Roll LEAPS" onClose={onClose}>
      <FormProvider {...methods}>
        <RollPmccLeapsForm
          schema={schema}
          ticker={ticker}
          leaps={leaps}
          openShort={openShort}
          ledger={ledger}
          today={today}
          isPending={mutation.isPending}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FormProvider>
    </PmccRollSheetDialog>
  )
}
