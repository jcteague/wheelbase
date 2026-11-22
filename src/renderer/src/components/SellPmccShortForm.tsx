// [US-115] The Sell Short Call sheet's body, top to bottom as the mockup's `SellShortSheet`:
// Coverage, US-101's short-call section bounded by the LEAPS with the Contracts field, the
// `After this sale` preview, and the footer. Presentational: the sheet owns the form.
import { useFormContext, useWatch } from 'react-hook-form'
import type { PmccLedgerTotals } from '../../../main/core/costbasis'
import type { LegDetail } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { SHORT_PRESET } from '../lib/pmcc-entry'
import { sellPmccShortPreview, type PmccEndedCycle } from '../lib/pmcc-sell-short'
import type { SellPmccShortFormValues, SellPmccShortSchema } from '../schemas/sell-pmcc-short'
import { PmccLegSection } from './PmccLegSection'
import { SellPmccShortPreview } from './SellPmccShortPreview'
import { SellShortCoverageCard } from './SellShortCoverageCard'
import { AlertBox } from './ui/AlertBox'
import { FormButton } from './ui/FormButton'
import { Field } from './ui/FormField'
import { NumberInput } from './ui/NumberInput'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'

type SellPmccShortFormProps = {
  /** The schema `useSellPmccShortForm` resolves with; `valid` is judged by the same one. */
  schema: SellPmccShortSchema
  ticker: string
  leaps: LegDetail
  /** The LEAPS' live delta; `null` while no snapshot carries one. */
  leapsDelta: string | null
  ledger: PmccLedgerTotals
  previousCycle: PmccEndedCycle | null
  /** Local calendar date (`yyyy-MM-dd`) the DTE figures are counted from. */
  today: string
  isPending: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function SellPmccShortForm({
  schema,
  ticker,
  leaps,
  leapsDelta,
  ledger,
  previousCycle,
  today,
  isPending,
  onSubmit,
  onClose
}: SellPmccShortFormProps): React.JSX.Element {
  const {
    control,
    register,
    formState: { errors }
  } = useFormContext<SellPmccShortFormValues>()
  const [contracts, short] = useWatch({ control, name: ['contracts', 'short'] })
  // Judged from the values, not RHF's `isValid`: a failed save's `setError` would otherwise
  // disable the retry its own message invites.
  const valid = schema.safeParse({ contracts, short }).success
  const preview = sellPmccShortPreview({
    ledger,
    leaps: { strike: leaps.strike, contracts: leaps.contracts },
    draft: { contracts, short },
    today
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex h-full min-h-0 flex-1 flex-col">
      <SheetHeader
        eyebrow="SELL SHORT CALL"
        title={`${ticker} · against ${fmtMoney(leaps.strike)} LEAPS`}
        onClose={onClose}
      />
      <SheetBody>
        <SellShortCoverageCard
          leaps={leaps}
          leapsDelta={leapsDelta}
          previousCycle={previousCycle}
          today={today}
        />
        <PmccLegSection
          leg="short"
          preset={SHORT_PRESET}
          today={today}
          ticker={ticker}
          bounds={{ expirationBefore: leaps.expiration, strikeAbove: leaps.strike }}
          fillLabel="Actual sale price / share"
          pairRule={false}
        >
          <Field
            label="Contracts"
            htmlFor="sell-short-contracts"
            hint={`max ${leaps.contracts} (LEAPS held)`}
            error={errors.contracts?.message}
          >
            <NumberInput
              {...register('contracts')}
              id="sell-short-contracts"
              inputMode="numeric"
              hasError={Boolean(errors.contracts)}
            />
          </Field>
        </PmccLegSection>
        <SellPmccShortPreview preview={preview} strike={short.strike} valid={valid} />
        {errors.root?.save ? (
          <AlertBox variant="error" data-testid="pmcc-sell-short-save-error">
            {errors.root.save.message}
          </AlertBox>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <div className="grid w-full grid-cols-2 gap-3">
          <FormButton label="Cancel" variant="secondary" onClick={onClose} />
          <FormButton
            label="Record Short Call"
            pendingLabel="Recording…"
            isPending={isPending}
            disabled={!valid}
            data-testid="pmcc-sell-short-confirm"
          />
        </div>
      </SheetFooter>
    </form>
  )
}
