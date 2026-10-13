// [US-104] The Roll Short Call sheet's body, top to bottom as the mockup's `RollShortSheet`:
// coverage, the open short and its LEAPS, the replacement fields, the net preview, the
// below-effective-cost advisory, and the footer. Presentational: the sheet owns the form.
import { parseISO } from 'date-fns'
import { useFormContext, useWatch } from 'react-hook-form'
import type { LegDetail } from '../api/positions'
import { computeDteFromInput, fmtMoney } from '../lib/format'
import {
  pmccPostRollEffectiveCost,
  pmccRollLabel,
  pmccRollNet,
  pmccStrikeShortfall
} from '../lib/pmcc-roll'
import { shortRollCoverage } from '../lib/pmcc-roll-coverage'
import type {
  RollPmccShortCallFormValues,
  RollPmccShortCallSchema
} from '../schemas/roll-pmcc-short-call'
import { PmccCoverageRuler } from './PmccCoverageRuler'
import { PmccRollNetPreview } from './PmccRollNetPreview'
import { RollPmccShortCallFields } from './RollPmccShortCallFields'
import { AlertBox } from './ui/AlertBox'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'
import { SummaryRow } from './ui/SummaryRow'

type RollPmccShortCallFormProps = {
  /** The schema `useRollPmccShortCallForm` resolves with; `valid` is judged by the same one. */
  schema: RollPmccShortCallSchema
  ticker: string
  openShort: LegDetail
  leaps: LegDetail
  basisPerShare: string
  effectiveShareCost: string
  /** Local calendar date (`yyyy-MM-dd`) the DTE figures are counted from. */
  today: string
  isPending: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function RollPmccShortCallForm({
  schema,
  ticker,
  openShort,
  leaps,
  basisPerShare,
  effectiveShareCost,
  today,
  isPending,
  onSubmit,
  onClose
}: RollPmccShortCallFormProps): React.JSX.Element {
  const {
    control,
    formState: { errors }
  } = useFormContext<RollPmccShortCallFormValues>()
  const [costToClosePerContract, newStrike, newPremiumPerContract, newExpiration, fillDate] =
    useWatch({
      control,
      name: [
        'costToClosePerContract',
        'newStrike',
        'newPremiumPerContract',
        'newExpiration',
        'fillDate'
      ]
    })
  // Judged from the values, not RHF's `isValid`: a failed save's `setError` would otherwise
  // disable the retry its own message invites.
  const valid = schema.safeParse({
    costToClosePerContract,
    newStrike,
    newPremiumPerContract,
    newExpiration,
    fillDate
  }).success

  const dte = (date: string): number | null => computeDteFromInput(date, parseISO(today))
  const shortDte = dte(openShort.expiration)
  const replacementDte = dte(newExpiration)
  const net = pmccRollNet({
    received: newPremiumPerContract,
    paid: costToClosePerContract,
    contracts: openShort.contracts
  })
  const postRoll = net
    ? pmccPostRollEffectiveCost({
        basisPerShare,
        leaps,
        shortContracts: openShort.contracts,
        net: net.net
      })
    : null
  const shortfall =
    valid && postRoll ? pmccStrikeShortfall(newStrike, postRoll.effectiveAfter) : null
  const label = valid
    ? pmccRollLabel(openShort, { strike: newStrike, expiration: newExpiration })
    : null
  const expirationError = errors.newExpiration?.message

  return (
    <form onSubmit={onSubmit} noValidate className="flex h-full min-h-0 flex-1 flex-col">
      <SheetHeader
        eyebrow="ROLL SHORT CALL"
        title="Roll Short Call"
        subtitle={`${ticker} CALL ${fmtMoney(openShort.strike)} · exp ${openShort.expiration} · ${shortDte} DTE`}
        onClose={onClose}
      />
      <SheetBody>
        <SectionCard header="Coverage" headerVariant="emphasized">
          <PmccCoverageRuler
            today={today}
            {...shortRollCoverage({
              today,
              currentExpiration: openShort.expiration,
              replacementExpiration: newExpiration,
              leapsExpiration: leaps.expiration
            })}
          />
        </SectionCard>

        <SectionCard header="Current short call">
          <div className="flex flex-col gap-2 px-4 py-3">
            <SummaryRow label="Contract" value={`${ticker} ${fmtMoney(openShort.strike)} CALL`} />
            <SummaryRow label="Expiration" value={`${openShort.expiration} (${shortDte} DTE)`} />
            <SummaryRow
              label="Sold at"
              value={`${fmtMoney(openShort.premiumPerContract)} / share`}
            />
            <SummaryRow
              label="LEAPS · read-only"
              value={`${fmtMoney(leaps.strike)} · ${leaps.expiration}`}
            />
            <SummaryRow
              label="Effective share cost"
              value={fmtMoney(effectiveShareCost)}
              highlight
            />
            <p className="text-[11px] leading-relaxed text-wb-text-muted">
              What shares would cost you through the LEAPS — the {fmtMoney(leaps.strike)} strike
              plus {fmtMoney(basisPerShare)} of basis. Not a guaranteed breakeven.
            </p>
          </div>
        </SectionCard>

        <RollPmccShortCallFields contracts={openShort.contracts} replacementDte={replacementDte} />

        <PmccRollNetPreview
          net={net}
          postRoll={postRoll}
          label={label}
          replacementDte={replacementDte}
          basisPerShare={basisPerShare}
          effectiveShareCost={effectiveShareCost}
        />
        {shortfall && postRoll ? (
          <AlertBox variant="warning" data-testid="pmcc-roll-warning">
            Short strike {fmtMoney(newStrike)} is below your effective share cost of{' '}
            {fmtMoney(postRoll.effectiveAfter)} after this roll. If assigned, covering from the
            LEAPS realizes roughly {fmtMoney(shortfall)} per share of loss. You can still record it.
          </AlertBox>
        ) : null}
        {errors.__roll__ ? (
          <AlertBox variant="error" data-testid="pmcc-roll-no-change">
            {errors.__roll__.message}
          </AlertBox>
        ) : null}
        {errors.root?.save ? (
          <AlertBox variant="error" data-testid="pmcc-roll-save-error">
            {errors.root.save.message}
          </AlertBox>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <div className="flex w-full flex-col gap-2">
          {expirationError ? (
            <p className="text-[11px] leading-relaxed text-wb-red">
              The {ticker} {fmtMoney(openShort.strike)} short call stays open at{' '}
              {openShort.expiration}. No close or replacement leg is recorded.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormButton label="Cancel" variant="secondary" onClick={onClose} />
            <FormButton
              label="Confirm roll"
              pendingLabel="Recording…"
              isPending={isPending}
              disabled={!valid}
              data-testid="pmcc-roll-confirm"
            />
          </div>
          <span className="text-[10px] text-wb-text-muted">
            Your draft is kept until the roll is valid. No order is placed.
          </span>
        </div>
      </SheetFooter>
    </form>
  )
}
