import { DatePicker } from '@/components/ui/date-picker'
import { fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'
import { CcPnlPreview } from './ui/CcPnlPreview'
import { PhaseBadge } from './PhaseBadge'
import { SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'

type CloseCcEarlyFormProps = {
  ticker: string
  strike: string
  contracts: number
  openPremium: string
  basisPerShare: string
  ccExpiration: string
  closePrice: string
  fillDate: string
  priceError: string | null
  dateError: string | null
  isPending: boolean
  isError: boolean
  error: unknown
  onClosePriceChange: (value: string) => void
  onFillDateChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function CloseCcEarlyForm({
  ticker,
  strike,
  contracts,
  openPremium,
  basisPerShare,
  ccExpiration,
  closePrice,
  fillDate,
  priceError,
  dateError,
  isPending,
  isError,
  error,
  onClosePriceChange,
  onFillDateChange,
  onSubmit,
  onClose
}: CloseCcEarlyFormProps): React.JSX.Element {
  const maxProfit = (Number(openPremium || '0') * contracts * 100).toFixed(2)

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <SheetHeader
        eyebrow="Buy to Close"
        title="Close Covered Call Early"
        subtitle={`CALL ${fmtMoney(strike)} · ${ccExpiration}`}
        onClose={onClose}
      />

      <SheetBody>
        <SectionCard>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Position</span>
              <span>
                {ticker} CALL {fmtMoney(strike)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Contracts</span>
              <span>{contracts}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Open premium</span>
              <span style={{ color: 'var(--wb-green)' }}>+{fmtMoney(openPremium)} / contract</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Max profit</span>
              <span style={{ color: 'var(--wb-green)' }}>+${maxProfit}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Phase transition</span>
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
              >
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <PhaseBadge phase="CC_OPEN" />
                  <span>→</span>
                  <PhaseBadge phase="HOLDING_SHARES" />
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Cost basis after close</span>
              <span>${basisPerShare} / share (unchanged)</span>
            </div>
          </div>
        </SectionCard>

        <Field
          label="Close Price (Buy to Close)"
          htmlFor="cc-close-price"
          error={priceError ?? undefined}
        >
          <NumberInput
            id="cc-close-price"
            data-testid="cc-close-price"
            aria-label="Close Price (Buy to Close)"
            type="number"
            min="0"
            step="0.01"
            prefix="$"
            value={closePrice}
            onChange={(event) => onClosePriceChange(event.target.value)}
            hasError={Boolean(priceError)}
          />
        </Field>

        <CcPnlPreview
          openPremiumPerContract={openPremium}
          closePricePerContract={closePrice}
          contracts={contracts}
        />

        <Field label="Fill Date" htmlFor="cc-close-fill-date" error={dateError ?? undefined}>
          <DatePicker
            id="cc-close-fill-date"
            data-testid="cc-close-fill-date"
            aria-label="Fill Date"
            value={fillDate}
            hasError={Boolean(dateError)}
            onChange={onFillDateChange}
          />
        </Field>

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> A CC_CLOSE leg will be recorded. The position
          returns to Holding Shares. Full leg history is preserved.
        </AlertBox>

        {isError && (
          <div style={{ color: 'var(--wb-red)', fontSize: '0.8rem' }}>
            {String(
              (error as { body?: { detail?: Array<{ message: string }> } })?.body?.detail?.[0]
                ?.message ?? 'An unexpected error occurred'
            )}
          </div>
        )}
      </SheetBody>

      <SheetFooter>
        <FormButton label="Cancel" variant="secondary" onClick={onClose} style={{ flex: 1 }} />
        <FormButton
          label="Confirm Close"
          pendingLabel="Closing…"
          isPending={isPending}
          onClick={onSubmit}
          data-testid="cc-close-submit"
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </div>
  )
}
