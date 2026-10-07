// [US-104] The Roll Short Call sheet: a portal dialog owning the form, the mutation, and where
// a rejected roll's server errors land.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FormProvider } from 'react-hook-form'
import type { PmccShortRollField } from '../../../main/core/pmcc-rules'
import type {
  LegDetail,
  RollPmccShortCallPayload,
  RollPmccShortCallResponse
} from '../api/positions'
import { useRollPmccShortCall } from '../hooks/useRollPmccShortCall'
import { useRollPmccShortCallForm } from '../hooks/useRollPmccShortCallForm'
import { localToday } from '../lib/dates'
import { applyIpcFieldErrors } from '../lib/ipc-field-errors'
import { getSheetPortal } from '../lib/portal'
import {
  toRollPmccShortCallPayload,
  type RollPmccShortCallFormValues
} from '../schemas/roll-pmcc-short-call'
import { RollPmccShortCallForm } from './RollPmccShortCallForm'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

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
  today = localToday(),
  onClose,
  onRecorded
}: RollPmccShortCallSheetProps): React.JSX.Element {
  const { methods, schema } = useRollPmccShortCallForm(
    { openShort, leapsExpiration: leaps.expiration },
    today
  )
  const { mutate, isPending } = useRollPmccShortCall({ onSuccess: onRecorded })
  // Set before `mutate`, cleared when it settles: `isPending` only reaches the button on the
  // next render, so a second click queued before it would otherwise record a second roll.
  const inFlight = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function submit(values: RollPmccShortCallFormValues): void {
    if (isPending || inFlight.current) return
    inFlight.current = true
    mutate(toRollPmccShortCallPayload(values, positionId), {
      onError: (error) =>
        applyIpcFieldErrors(error, methods.setError, {
          target: errorTarget,
          saveMessage: SAVE_FAILED,
          showUnplacedMessages: true
        }),
      onSettled: () => {
        inFlight.current = false
      }
    })
  }

  return createPortal(
    <SheetOverlay onClose={onClose}>
      <SheetPanel width={440}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Roll Short Call"
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            // A portalled date-picker popover's Escape bubbles here too, and belongs to it.
            const { target } = event
            if (!(target instanceof Node) || !dialogRef.current?.contains(target)) return
            event.stopPropagation()
            onClose()
          }}
        >
          <FormProvider {...methods}>
            <RollPmccShortCallForm
              schema={schema}
              ticker={ticker}
              openShort={openShort}
              leaps={leaps}
              basisPerShare={basisPerShare}
              effectiveShareCost={effectiveShareCost}
              today={today}
              isPending={isPending}
              onSubmit={(event) => void methods.handleSubmit(submit)(event)}
              onClose={onClose}
            />
          </FormProvider>
        </div>
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
