// [US-104][US-105] A PMCC roll sheet's submit: builds the payload, records it once however fast
// the confirm is clicked, and routes a rejection's field errors onto the form.
import { useRef } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import type { ApiError } from '../api/error'
import { applyIpcFieldErrors, type IpcFieldErrorRouting } from '../lib/ipc-field-errors'

/** The slice of a roll mutation the submit drives. */
type RollMutation<TPayload> = {
  mutate: (
    payload: TPayload,
    callbacks: { onError: (error: ApiError) => void; onSettled: () => void }
  ) => void
  isPending: boolean
}

type RollSheetSubmitInput<TValues extends FieldValues, TPayload> = {
  methods: UseFormReturn<TValues>
  mutation: RollMutation<TPayload>
  toPayload: (values: TValues) => TPayload
  errorRouting: IpcFieldErrorRouting<TValues>
}

export function useRollSheetSubmit<TValues extends FieldValues, TPayload>({
  methods,
  mutation: { mutate, isPending },
  toPayload,
  errorRouting
}: RollSheetSubmitInput<TValues, TPayload>): (event: React.FormEvent<HTMLFormElement>) => void {
  // Set before `mutate`, cleared when it settles: `isPending` only reaches the button on the
  // next render, so a second click queued before it would otherwise record a second roll.
  const inFlight = useRef(false)

  function submit(values: TValues): void {
    if (isPending || inFlight.current) return
    inFlight.current = true
    mutate(toPayload(values), {
      onError: (error) => applyIpcFieldErrors(error, methods.setError, errorRouting),
      onSettled: () => {
        inFlight.current = false
      }
    })
  }

  return (event) => void methods.handleSubmit(submit)(event)
}
