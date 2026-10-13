// [US-104] [US-105] A PMCC roll's replacement-leg inputs: the two cash inputs the roll names,
// strike, expiration (with its DTE), fill date, and the rolled leg's contracts read-only. Owns the
// cross-field re-checks so neither roll sheet can forget them. Reads the sheet's form from context.
import { Controller, useFormContext, type FieldValues, type Path } from 'react-hook-form'
import { DatePicker } from '@/components/ui/date-picker'
import { Field } from './ui/FormField'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'

/** The fields every PMCC roll form shares; `__roll__` is the no-change rule's, which no input owns. */
export type PmccRollFieldValues = {
  newStrike: string
  newExpiration: string
  fillDate: string
  __roll__?: string
}

// The no-change rule reports on `__roll__`, which no input owns: re-run it whenever either
// side of the comparison changes.
const RECHECK_NO_CHANGE = { deps: '__roll__' } as const

// The expiration-after-fill rule reports on `newExpiration` but also reads the fill date, so a
// fill-date change must refresh the expiration's error too.
const RECHECK_EXPIRATION = { deps: 'newExpiration' } as const

/** One per-share cash input: the form field it writes, its label, and its id after the prefix. */
export type PmccRollCashField<TValues extends FieldValues> = {
  name: Path<TValues>
  label: string
  idSuffix: string
}

type PmccRollFieldsProps<TValues extends PmccRollFieldValues> = {
  header: string
  /** Every input's id starts with it, e.g. `pmcc-roll` → `pmcc-roll-strike`. */
  idPrefix: string
  /** The roll's two cash inputs, in display order. */
  cashFields: readonly [PmccRollCashField<TValues>, PmccRollCashField<TValues>]
  contracts: number
  /** `null` until the replacement expiration is complete and accepted. */
  replacementDte: number | null
}

function RollCashField<TValues extends FieldValues>({
  name,
  label,
  id
}: {
  name: Path<TValues>
  label: string
  id: string
}): React.JSX.Element {
  const { register, getFieldState, formState } = useFormContext<TValues>()
  const { error } = getFieldState(name, formState)
  return (
    <Field label={label} htmlFor={id} error={error?.message}>
      <NumberInput
        {...register(name)}
        id={id}
        inputMode="decimal"
        prefix="$"
        hasError={Boolean(error)}
      />
    </Field>
  )
}

export function PmccRollFields<TValues extends PmccRollFieldValues>({
  header,
  idPrefix,
  cashFields,
  contracts,
  replacementDte
}: PmccRollFieldsProps<TValues>): React.JSX.Element {
  const {
    register,
    control,
    formState: { errors }
  } = useFormContext<PmccRollFieldValues>()
  const expirationError = errors.newExpiration?.message
  return (
    <SectionCard header={header}>
      <div className="grid grid-cols-2 gap-3 p-4">
        {cashFields.map(({ name, label, idSuffix }) => (
          <RollCashField<TValues>
            key={name}
            name={name}
            label={label}
            id={`${idPrefix}-${idSuffix}`}
          />
        ))}
        <Field label="Strike" htmlFor={`${idPrefix}-strike`} error={errors.newStrike?.message}>
          <NumberInput
            {...register('newStrike', RECHECK_NO_CHANGE)}
            id={`${idPrefix}-strike`}
            inputMode="decimal"
            prefix="$"
            hasError={Boolean(errors.newStrike)}
          />
        </Field>
        <Field
          label="Expiration"
          htmlFor={`${idPrefix}-expiration`}
          error={expirationError}
          hint={replacementDte === null ? undefined : `${replacementDte} DTE`}
        >
          <Controller
            name="newExpiration"
            control={control}
            rules={RECHECK_NO_CHANGE}
            render={({ field }) => (
              <DatePicker
                id={`${idPrefix}-expiration`}
                aria-label="Replacement expiration"
                value={field.value}
                hasError={Boolean(expirationError)}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="Fill date" htmlFor={`${idPrefix}-fill-date`} error={errors.fillDate?.message}>
          <Controller
            name="fillDate"
            control={control}
            rules={RECHECK_EXPIRATION}
            render={({ field }) => (
              <DatePicker
                id={`${idPrefix}-fill-date`}
                aria-label="Fill date"
                value={field.value}
                hasError={Boolean(errors.fillDate)}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="Contracts" htmlFor={`${idPrefix}-contracts`}>
          <NumberInput id={`${idPrefix}-contracts`} value={contracts} readOnly />
        </Field>
      </div>
    </SectionCard>
  )
}
