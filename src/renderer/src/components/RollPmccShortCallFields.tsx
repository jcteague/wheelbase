// [US-104] The replacement short call's inputs: cash, strike, expiration (with its DTE), fill
// date, and the open short's contracts read-only. Reads the sheet's form from context.
import { Controller, useFormContext } from 'react-hook-form'
import { DatePicker } from '@/components/ui/date-picker'
import type { RollPmccShortCallFormValues } from '../schemas/roll-pmcc-short-call'
import { Field } from './ui/FormField'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'

// The no-change rule reports on `__roll__`, which no input owns: re-run it whenever either
// side of the comparison changes.
const RECHECK_NO_CHANGE = { deps: '__roll__' } as const

// The expiration-after-fill rule reports on `newExpiration` but also reads the fill date, so a
// fill-date change must refresh the expiration's error too.
const RECHECK_EXPIRATION = { deps: 'newExpiration' } as const

type RollPmccShortCallFieldsProps = {
  contracts: number
  replacementDte: number | null
}

export function RollPmccShortCallFields({
  contracts,
  replacementDte
}: RollPmccShortCallFieldsProps): React.JSX.Element {
  const {
    register,
    control,
    formState: { errors }
  } = useFormContext<RollPmccShortCallFormValues>()
  const expirationError = errors.newExpiration?.message
  return (
    <SectionCard header="Replacement short call">
      <div className="grid grid-cols-2 gap-3 p-4">
        <Field
          label="Cost to close / share"
          htmlFor="pmcc-roll-cost-to-close"
          error={errors.costToClosePerContract?.message}
        >
          <NumberInput
            {...register('costToClosePerContract')}
            id="pmcc-roll-cost-to-close"
            inputMode="decimal"
            prefix="$"
            hasError={Boolean(errors.costToClosePerContract)}
          />
        </Field>
        <Field
          label="Premium / share"
          htmlFor="pmcc-roll-premium"
          error={errors.newPremiumPerContract?.message}
        >
          <NumberInput
            {...register('newPremiumPerContract')}
            id="pmcc-roll-premium"
            inputMode="decimal"
            prefix="$"
            hasError={Boolean(errors.newPremiumPerContract)}
          />
        </Field>
        <Field label="Strike" htmlFor="pmcc-roll-strike" error={errors.newStrike?.message}>
          <NumberInput
            {...register('newStrike', RECHECK_NO_CHANGE)}
            id="pmcc-roll-strike"
            inputMode="decimal"
            prefix="$"
            hasError={Boolean(errors.newStrike)}
          />
        </Field>
        <Field
          label="Expiration"
          htmlFor="pmcc-roll-expiration"
          error={expirationError}
          hint={replacementDte === null ? undefined : `${replacementDte} DTE`}
        >
          <Controller
            name="newExpiration"
            control={control}
            rules={RECHECK_NO_CHANGE}
            render={({ field }) => (
              <DatePicker
                id="pmcc-roll-expiration"
                aria-label="Replacement expiration"
                value={field.value}
                hasError={Boolean(expirationError)}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="Fill date" htmlFor="pmcc-roll-fill-date" error={errors.fillDate?.message}>
          <Controller
            name="fillDate"
            control={control}
            rules={RECHECK_EXPIRATION}
            render={({ field }) => (
              <DatePicker
                id="pmcc-roll-fill-date"
                aria-label="Fill date"
                value={field.value}
                hasError={Boolean(errors.fillDate)}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="Contracts" htmlFor="pmcc-roll-contracts">
          <NumberInput id="pmcc-roll-contracts" value={contracts} readOnly />
        </Field>
      </div>
    </SectionCard>
  )
}
