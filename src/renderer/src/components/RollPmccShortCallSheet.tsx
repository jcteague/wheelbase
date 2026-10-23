// [US-104] The Roll Short Call sheet: a portal dialog owning the form, the mutation, and where
// a rejected roll's server errors land.
import { FormProvider } from 'react-hook-form'
import type { PmccShortRollField } from '../../../main/core/pmcc-rules'
import type {
  LegDetail,
  RollPmccShortCallPayload,
  RollPmccShortCallResponse
} from '../api/positions'
import { useRollPmccShortCall } from '../hooks/useRollPmccShortCall'
import { useRollPmccShortCallForm } from '../hooks/useRollPmccShortCallForm'
import { useRollSheetSubmit } from '../hooks/useRollSheetSubmit'
import { newYorkToday } from '../lib/dates'
import { toRollPmccShortCallPayload } from '../schemas/roll-pmcc-short-call'
import { PmccRollSheetDialog } from './PmccRollSheetDialog'
import { RollPmccShortCallForm } from './RollPmccShortCallForm'

type RollPmccShortCallSheetProps = {
  positionId: string
  ticker: string
  openShort: LegDetail
  leaps: LegDetail
  basisPerShare: string
  effectiveShareCost: string
  today?: string
  onClose: () => void
  onRecorded: (response: RollPmccShortCallResponse) => void
}

const SAVE_FAILED = 'Could not record the roll. Your entries are preserved. Try again.'

/** Every field a rejected roll's server errors name: the payload's and the engine rules'. */
type RollErrorField = Exclude<keyof RollPmccShortCallPayload, 'positionId'> | PmccShortRollField

// The form's fields carry the payload's names, so each lands on the field of the same name;
// keyed by `RollErrorField` so a missing or misspelled field fails to compile.
const FORM_FIELDS: Record<RollErrorField, true> = {
  costToClosePerContract: true,
  newPremiumPerContract: true,
  newStrike: true,
  newExpiration: true,
  fillDate: true,
  __roll__: true
}

const isRollErrorField = (field: string): field is RollErrorField =>
  Object.hasOwn(FORM_FIELDS, field)

/** The form path a server field error lands on; `null` (`__root__`, `__phase__`) is the save alert. */
const errorTarget = (field: string): RollErrorField | null =>
  isRollErrorField(field) ? field : null

export function RollPmccShortCallSheet({
  positionId,
  ticker,
  openShort,
  leaps,
  basisPerShare,
  effectiveShareCost,
  today = newYorkToday(),
  onClose,
  onRecorded
}: RollPmccShortCallSheetProps): React.JSX.Element {
  const { methods, schema } = useRollPmccShortCallForm(
    { openShort, leapsExpiration: leaps.expiration },
    today
  )
  const mutation = useRollPmccShortCall({ onSuccess: onRecorded })
  const onSubmit = useRollSheetSubmit({
    methods,
    mutation,
    toPayload: (values) => toRollPmccShortCallPayload(values, positionId),
    errorRouting: { target: errorTarget, saveMessage: SAVE_FAILED, showUnplacedMessages: true }
  })

  return (
    <PmccRollSheetDialog label="Roll Short Call" onClose={onClose}>
      <FormProvider {...methods}>
        <RollPmccShortCallForm
          schema={schema}
          ticker={ticker}
          openShort={openShort}
          leaps={leaps}
          basisPerShare={basisPerShare}
          effectiveShareCost={effectiveShareCost}
          today={today}
          isPending={mutation.isPending}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FormProvider>
    </PmccRollSheetDialog>
  )
}
