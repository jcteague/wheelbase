// [US-101] One PMCC leg: contract picker, strike / expiration (locked while a chain
// contract is selected), the selected contract's quote, the actual fill, fees and fill
// date. The long and short invocations differ only by LEG_COPY and the preset.
import { parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { DatePicker } from '@/components/ui/date-picker'
import type { OptionChainQuote } from '../api/market-data'
import { useCallChain } from '../hooks/useCallChain'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUnderlyingPrice } from '../hooks/useUnderlyingPrice'
import { parsePositiveInputDecimal } from '../lib/decimal-input'
import { computeDteFromInput, fmtMoney, fmtMoneyGrouped } from '../lib/format'
import type { ContractSelection, LegPreset } from '../lib/pmcc-entry'
import type { PmccEntryFormValues } from '../schemas/pmcc-entry'
import { CallContractPicker } from './CallContractPicker'
import { Field } from './ui/FormField'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'

export type PmccLeg = 'long' | 'short'

const LEG_COPY: Record<
  PmccLeg,
  { title: string; action: string; fillLabel: string; flow: 'Debit' | 'Credit' }
> = {
  long: {
    title: 'Buy LEAPS call',
    action: 'BUY TO OPEN',
    fillLabel: 'Actual purchase / share',
    flow: 'Debit'
  },
  short: {
    title: 'Sell short call',
    action: 'SELL TO OPEN',
    fillLabel: 'Actual sale / share',
    flow: 'Credit'
  }
}

const SHARES_PER_CONTRACT = 100

/** How long the ticker must stop changing before its chain and price are requested. */
export const TICKER_SETTLE_MS = 300

const easternDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const easternTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

/** `Sep 14, 2026 · 10:42 ET` — quote times are named by the exchange's clock. */
function quoteTime(timestamp: string): string {
  const at = new Date(timestamp)
  return `${easternDay.format(at)} · ${easternTime.format(at)} ET`
}

/** `180+ DTE · Δ 0.70–0.85` / `20–45 DTE · Δ 0.25–0.35` */
function presetCaption(preset: LegPreset): string {
  const dte = preset.dteMax === null ? `${preset.dteMin}+` : `${preset.dteMin}–${preset.dteMax}`
  return `${dte} DTE · Δ ${preset.deltaMin}–${preset.deltaMax}`
}

function QuoteStrip({ quote }: { quote: OptionChainQuote | undefined }): React.JSX.Element {
  const delta = quote?.greeks ? new Decimal(quote.greeks.delta).abs().toFixed(2) : '—'
  return (
    <div className="border-l-2 border-wb-gold pl-3 font-wb-mono text-[11px] leading-relaxed text-wb-text-secondary">
      <div className="font-semibold uppercase tracking-wider text-wb-text-muted">Quote</div>
      {quote ? (
        <>
          <div>
            Bid {fmtMoney(quote.bid)} · Ask {fmtMoney(quote.ask)} · Mid {fmtMoney(quote.mid)} · Δ{' '}
            {delta}
          </div>
          <div className="text-wb-text-muted">{quoteTime(quote.timestamp)}</div>
        </>
      ) : (
        <>
          <div>Quote / delta: —</div>
          <div className="text-wb-text-muted">No quote available</div>
        </>
      )}
    </div>
  )
}

/** The leg's gross fill cash flow (`fill × 100 × contracts`), or `—` until both parse. */
function legCashFlow(fillPrice: string, contracts: string): string {
  const fill = parsePositiveInputDecimal(fillPrice)
  const quantity = parsePositiveInputDecimal(contracts)
  if (!fill || !quantity?.isInteger()) return '—'
  return fmtMoneyGrouped(fill.times(SHARES_PER_CONTRACT).times(quantity).toString())
}

type LegDatePickerProps = {
  name: `${PmccLeg}.${'expiration' | 'fillDate'}`
  id: string
  label: string
  hasError: boolean
}

function LegDatePicker({ name, id, label, hasError }: LegDatePickerProps): React.JSX.Element {
  const { control } = useFormContext<PmccEntryFormValues>()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DatePicker
          id={id}
          aria-label={label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          hasError={hasError}
        />
      )}
    />
  )
}

type PmccLegSectionProps = {
  leg: PmccLeg
  preset: LegPreset
  /** Local calendar date, `yyyy-MM-dd`, the DTE figures count from. */
  today: string
  /** `false` while the sheet shows the other strategy: the leg's market data stops requesting. */
  active?: boolean
}

export function PmccLegSection({
  leg,
  preset,
  today,
  active = true
}: PmccLegSectionProps): React.JSX.Element {
  const copy = LEG_COPY[leg]
  const {
    register,
    control,
    setValue,
    trigger,
    formState: { errors }
  } = useFormContext<PmccEntryFormValues>()
  const [ticker, contracts, contractId, expiration, fillPrice] = useWatch({
    control,
    name: ['ticker', 'contracts', `${leg}.contractId`, `${leg}.expiration`, `${leg}.fillPrice`]
  })

  // Typing A, AA, AAP, AAPL must not request four chains: market data waits for the ticker
  // to settle, and reads as no ticker meanwhile so the previous ticker's contracts go too.
  const settledTicker = useDebouncedValue(ticker, TICKER_SETTLE_MS)
  const marketTicker = settledTicker === ticker ? ticker : ''
  const underlyingPrice = useUnderlyingPrice(marketTicker, { enabled: active })
  const polled = useCallChain({
    ticker: marketTicker,
    preset,
    underlyingPrice,
    selectedContractId: contractId,
    enabled: active
  })

  const selected = Boolean(contractId)
  const found = selected ? polled.contracts.find((q) => q.contractId === contractId) : undefined
  // A refetch that no longer carries the selected contract (a new strike bound, a page
  // that shifted) must not drop the selection: hold its last-seen quote, so the picker
  // still lists it, the strip still shows it and its age still reads as stale.
  const [lastSeen, setLastSeen] = useState(found)
  if (found && found !== lastSeen) setLastSeen(found)
  const quote = found ?? (selected && lastSeen?.contractId === contractId ? lastSeen : undefined)
  const chain = quote && !found ? { ...polled, contracts: [...polled.contracts, quote] } : polled
  const todayDate = parseISO(today)
  const dte = computeDteFromInput(expiration, todayDate)
  const legErrors = errors[leg]

  const flow = legCashFlow(fillPrice, contracts)

  function select(selection: ContractSelection | null): void {
    setValue(`${leg}.contractId`, selection?.contractId)
    if (!selection) return
    setValue(`${leg}.strike`, selection.strike, { shouldValidate: true, shouldDirty: true })
    setValue(`${leg}.expiration`, selection.expiration, { shouldValidate: true, shouldDirty: true })
  }

  function id(field: string): string {
    return `${leg}-${field}`
  }

  return (
    <SectionCard header={copy.title} headerVariant="emphasized" className="shrink-0">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="rounded bg-wb-gold-dim px-2 py-1 font-wb-mono text-xs font-bold tracking-wide text-wb-gold">
            {copy.action}
          </span>
          <span className="font-wb-mono text-[10px] text-wb-text-secondary">
            {presetCaption(preset)}
          </span>
        </div>
        <CallContractPicker
          id={id('contract')}
          chain={chain}
          selectedContractId={contractId}
          onSelect={select}
          today={todayDate}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Strike" htmlFor={id('strike')} error={legErrors?.strike?.message}>
            <NumberInput
              {...register(`${leg}.strike`)}
              id={id('strike')}
              inputMode="decimal"
              placeholder="0.00"
              readOnly={selected}
              hasError={Boolean(legErrors?.strike)}
            />
          </Field>
          <Field
            label="Expiration"
            htmlFor={id('expiration')}
            hint={dte === null ? undefined : `${dte} DTE`}
            error={legErrors?.expiration?.message}
          >
            {selected ? (
              <NumberInput
                id={id('expiration')}
                value={expiration}
                readOnly
                hasError={Boolean(legErrors?.expiration)}
              />
            ) : (
              <LegDatePicker
                name={`${leg}.expiration`}
                id={id('expiration')}
                label="Expiration"
                hasError={Boolean(legErrors?.expiration)}
              />
            )}
          </Field>
        </div>
        <QuoteStrip quote={quote} />
        {/* Rule 16 (net debit before fees) reports on `__pair__`, which no input owns, so
            onBlur validation never shows it on its own; each fill re-runs it on blur. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy.fillLabel} htmlFor={id('fill')} error={legErrors?.fillPrice?.message}>
            <NumberInput
              {...register(`${leg}.fillPrice`, { onBlur: () => void trigger('__pair__') })}
              id={id('fill')}
              inputMode="decimal"
              placeholder="0.00"
              hasError={Boolean(legErrors?.fillPrice)}
            />
          </Field>
          <Field label="Total leg fees" htmlFor={id('fees')} error={legErrors?.fees?.message}>
            <NumberInput
              {...register(`${leg}.fees`)}
              id={id('fees')}
              inputMode="decimal"
              hasError={Boolean(legErrors?.fees)}
            />
          </Field>
        </div>
        <Field label="Fill date" htmlFor={id('fill-date')} error={legErrors?.fillDate?.message}>
          <LegDatePicker
            name={`${leg}.fillDate`}
            id={id('fill-date')}
            label="Fill date"
            hasError={Boolean(legErrors?.fillDate)}
          />
        </Field>
        <div className="flex justify-between font-wb-mono text-xs">
          <span className="text-wb-text-secondary">Opening cash flow</span>
          <span>
            {copy.flow} {flow}
          </span>
        </div>
      </div>
    </SectionCard>
  )
}
