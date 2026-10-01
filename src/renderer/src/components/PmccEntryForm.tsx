// [US-101] The PMCC branch of the new-position sheet. Owns its <form>, the sheet body and
// the footer, so the sheet mounts it as-is and hides it (never unmounts it) on toggle.
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldPath,
  type UseFormSetError,
  type UseFormSetValue
} from 'react-hook-form'
import {
  calculatePmccOpeningDebit,
  type PmccOpeningDebitResult
} from '../../../main/core/costbasis'
import type { ApiError, ApiFieldError, CreatePmccPositionResponse } from '../api/positions'
import { useCreatePmccPosition } from '../hooks/useCreatePmccPosition'
import { localToday } from '../lib/dates'
import { parseInputDecimal, parsePositiveInputDecimal } from '../lib/decimal-input'
import { fmtMoneyGrouped } from '../lib/format'
import { LEAPS_PRESET, SHORT_PRESET } from '../lib/pmcc-entry'
import {
  EMPTY_PMCC_DEFAULTS,
  pmccEntrySchema,
  toCreatePmccPayload,
  type PmccEntryFormValues
} from '../schemas/pmcc-entry'
import type { SharedFieldsHandle } from './new-position-shared'
import { PmccCashFlows } from './PmccCashFlows'
import { PmccLegSection } from './PmccLegSection'
import { AlertBox } from './ui/AlertBox'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SheetBody, SheetFooter } from './ui/Sheet'

export type PmccRecorded = { id: string; ticker: string; kind: 'PMCC' }

type PmccEntryFormProps = {
  onRecorded: (recorded: PmccRecorded) => void
  onCancel: () => void
  sharedRef?: Ref<SharedFieldsHandle>
  onPendingChange?: (isPending: boolean) => void
  defaultTicker?: string
  /** `false` while the sheet hides this form: its chain and price requests stop, its draft stays. */
  active?: boolean
  /** Local calendar date (`yyyy-MM-dd`) the date rules and DTE figures are judged against. */
  today?: string
}

const SAVE_FAILED = 'Could not record PMCC. Your entries are preserved. Try again.'

type FormPath = FieldPath<PmccEntryFormValues>

// Every path an IPC field error can land on; the engine's paths match the form's 1:1.
const LEG_FIELDS = ['strike', 'expiration', 'fillPrice', 'fees', 'fillDate'] as const
const FORM_PATHS: readonly FormPath[] = [
  'ticker',
  'contracts',
  ...LEG_FIELDS.flatMap((f) => [`long.${f}`, `short.${f}`] as const)
]

/** Where an IPC field error is shown: a form field, the pair-level slot, or the save alert. */
function errorTarget(field: string): FormPath | '__pair__' | 'save' {
  if (field === 'long.contracts' || field === 'short.contracts') return 'contracts'
  if (field === '__root__') return 'save'
  // `__pair__` and the boundary-only rules (underlying, instrument, deliverable) have no
  // field of their own.
  return FORM_PATHS.find((p) => p === field) ?? '__pair__'
}

/** Routes a failed save's field errors onto the form; anything unplaceable is the save alert. */
function showSaveErrors(error: ApiError, setError: UseFormSetError<PmccEntryFormValues>): void {
  const fieldErrors =
    (error.status === 400 && (error.body as { detail?: ApiFieldError[] }).detail) || []
  if (fieldErrors.length === 0) {
    setError('root.save', { message: SAVE_FAILED })
    return
  }
  fieldErrors.forEach((fe) => {
    const target = errorTarget(fe.field)
    if (target === 'save') setError('root.save', { message: SAVE_FAILED })
    else setError(target, { message: fe.message })
  })
}

// A leg's chain pick and fill belong to the ticker they were entered for; fees and fill
// dates do not.
const TICKER_BOUND_FIELDS = ['contractId', 'strike', 'expiration', 'fillPrice'] as const

function clearTickerBoundFields(setValue: UseFormSetValue<PmccEntryFormValues>): void {
  ;(['long', 'short'] as const).forEach((leg) =>
    TICKER_BOUND_FIELDS.forEach((field) =>
      setValue(`${leg}.${field}`, field === 'contractId' ? undefined : '')
    )
  )
}

type PreviewInput = [
  contracts: string,
  longStrike: string,
  longFill: string,
  longFees: string,
  shortStrike: string,
  shortFill: string,
  shortFees: string
]

/** The opening cash flows, or `null` while any input is empty or half-typed. */
function previewDebit([
  contracts,
  longStrike,
  longFill,
  longFees,
  shortStrike,
  shortFill,
  shortFees
]: PreviewInput): PmccOpeningDebitResult | null {
  const quantity = parsePositiveInputDecimal(contracts)
  const priced = [longStrike, longFill, shortStrike, shortFill].every(parsePositiveInputDecimal)
  const fees = [longFees, shortFees].every((v) => parseInputDecimal(v)?.gte(0))
  if (!quantity?.isInteger() || !priced || !fees) return null
  return calculatePmccOpeningDebit({
    contracts: quantity.toNumber(),
    long: { strike: longStrike, fillPrice: longFill, fees: longFees },
    short: { strike: shortStrike, fillPrice: shortFill, fees: shortFees }
  })
}

export function PmccEntryForm({
  onRecorded,
  onCancel,
  sharedRef,
  onPendingChange,
  defaultTicker,
  active = true,
  today = localToday()
}: PmccEntryFormProps): React.JSX.Element {
  const schema = useMemo(() => pmccEntrySchema(today), [today])
  const methods = useForm<PmccEntryFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { ...EMPTY_PMCC_DEFAULTS(today), ticker: defaultTicker ?? '' }
  })
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting }
  } = methods
  const { mutate, isPending } = useCreatePmccPosition()
  // Set before `mutate`, cleared when it settles: `isPending` only reaches the button on the
  // next render, so a second click queued before it would otherwise record a second PMCC.
  const inFlight = useRef(false)

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  useImperativeHandle(
    sharedRef,
    () => ({
      getShared: () => ({ ticker: getValues('ticker'), contracts: getValues('contracts') }),
      setShared: ({ ticker, contracts }) => {
        if (ticker !== getValues('ticker')) {
          setValue('ticker', ticker)
          clearTickerBoundFields(setValue)
        }
        setValue('contracts', contracts)
      }
    }),
    [getValues, setValue]
  )

  const preview = useWatch({
    control,
    name: [
      'contracts',
      'long.strike',
      'long.fillPrice',
      'long.fees',
      'short.strike',
      'short.fillPrice',
      'short.fees'
    ]
  })
  const debit = previewDebit(preview)

  function onSubmit(values: PmccEntryFormValues): void {
    if (isPending || inFlight.current) return
    inFlight.current = true
    mutate(toCreatePmccPayload(values), {
      onSuccess: ({ position }: CreatePmccPositionResponse) => {
        inFlight.current = false
        onRecorded({ id: position.id, ticker: position.ticker, kind: 'PMCC' })
      },
      onError: (error) => {
        inFlight.current = false
        showSaveErrors(error, setError)
      }
    })
  }

  // Rule 16 and the boundary-only rules share one slot, whether client or server raised them.
  const pairError = errors.__pair__?.message

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
        className="flex h-full min-h-0 flex-1 flex-col"
      >
        <SheetBody>
          {errors.root?.save ? (
            <AlertBox variant="error" data-testid="pmcc-save-error">
              {errors.root.save.message}
            </AlertBox>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticker" htmlFor="pmcc-ticker" error={errors.ticker?.message}>
              <NumberInput
                {...register('ticker', { onChange: () => clearTickerBoundFields(setValue) })}
                id="pmcc-ticker"
                placeholder="TSLA"
                hasError={Boolean(errors.ticker)}
              />
            </Field>
            <Field
              label="Contracts per leg"
              htmlFor="pmcc-contracts"
              error={errors.contracts?.message}
            >
              <NumberInput
                {...register('contracts')}
                id="pmcc-contracts"
                inputMode="numeric"
                placeholder="1"
                hasError={Boolean(errors.contracts)}
              />
            </Field>
          </div>
          <PmccLegSection leg="long" preset={LEAPS_PRESET} today={today} active={active} />
          <PmccLegSection leg="short" preset={SHORT_PRESET} today={today} active={active} />
          {pairError ? <ErrorAlert message={pairError} /> : null}
          <PmccCashFlows debit={debit} />
          <details className="font-wb-mono text-xs text-wb-text-secondary">
            <summary className="cursor-pointer">Advanced · Thesis and notes</summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Thesis" htmlFor="pmcc-thesis" error={errors.thesis?.message}>
                <NumberInput
                  {...register('thesis')}
                  id="pmcc-thesis"
                  placeholder="Why this trade?"
                />
              </Field>
              <Field label="Notes" htmlFor="pmcc-notes" error={errors.notes?.message}>
                <NumberInput
                  {...register('notes')}
                  id="pmcc-notes"
                  placeholder="Additional notes…"
                />
              </Field>
            </div>
          </details>
        </SheetBody>
        <SheetFooter>
          <div className="flex w-full flex-col gap-3">
            <div className="flex justify-between font-wb-mono text-sm">
              <span className="text-wb-text-secondary">Initial net debit</span>
              <strong data-testid="pmcc-initial-net-debit" className="text-wb-gold">
                {debit ? fmtMoneyGrouped(debit.initialNetDebit) : '—'}
              </strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormButton
                label="Cancel"
                variant="secondary"
                disabled={isPending}
                onClick={onCancel}
              />
              <FormButton
                label="Record PMCC"
                pendingLabel="Recording…"
                isPending={isPending}
                disabled={isSubmitting}
                data-testid="record-pmcc"
              />
            </div>
            <span className="font-wb-mono text-[10px] text-wb-text-secondary">
              Uses your actual fills. No order is placed.
            </span>
          </div>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}
