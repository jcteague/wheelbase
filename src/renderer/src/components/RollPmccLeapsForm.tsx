// [US-105] The Roll LEAPS sheet's body, top to bottom as the mockup's `RollLeapsSheet`: coverage,
// the current LEAPS, the open short call, the replacement fields, the net preview with the
// re-anchored effective share cost, the advisories, and the footer. Presentational: the sheet
// owns the form.
import { parseISO } from 'date-fns'
import { useFormContext, useWatch } from 'react-hook-form'
import type { LegDetail } from '../api/positions'
import { computeDteFromInput, fmtMoney } from '../lib/format'
import { leapsRollView } from '../lib/pmcc-leaps-roll-view'
import type { PmccLeapsLedger } from '../lib/pmcc-roll'
import { leapsRollCoverage } from '../lib/pmcc-roll-coverage'
import type { RollPmccLeapsFormValues, RollPmccLeapsSchema } from '../schemas/roll-pmcc-leaps'
import { PmccCoverageRuler } from './PmccCoverageRuler'
import { RollPmccLeapsFields } from './RollPmccLeapsFields'
import { RollPmccLeapsNetPreview } from './RollPmccLeapsNetPreview'
import { AlertBox } from './ui/AlertBox'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'
import { SummaryRow } from './ui/SummaryRow'

type RollPmccLeapsFormProps = {
  /** The schema the sheet's form resolves with; `valid` is judged by the same one. */
  schema: RollPmccLeapsSchema
  ticker: string
  leaps: LegDetail
  /** `null` when no short call is open: nothing to cover, so the shape checks are skipped. */
  openShort: LegDetail | null
  ledger: PmccLeapsLedger
  /** Local calendar date (`yyyy-MM-dd`) the DTE figures are counted from. */
  today: string
  isPending: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function RollPmccLeapsForm({
  schema,
  ticker,
  leaps,
  openShort,
  ledger,
  today,
  isPending,
  onSubmit,
  onClose
}: RollPmccLeapsFormProps): React.JSX.Element {
  const {
    control,
    formState: { errors }
  } = useFormContext<RollPmccLeapsFormValues>()
  const [proceeds, newStrike, newDebit, newExpiration, fillDate] = useWatch({
    control,
    name: ['proceeds', 'newStrike', 'newDebit', 'newExpiration', 'fillDate']
  })
  const {
    valid,
    leapsDte,
    replacementDte,
    fieldDte,
    net,
    postRoll,
    shortfall,
    label,
    coverageChange,
    leavesLeapsOpen
  } = leapsRollView(
    { proceeds, newStrike, newDebit, newExpiration, fillDate },
    {
      schema,
      leaps,
      openShort,
      ledger,
      today,
      errors: {
        newExpiration: errors.newExpiration?.message,
        newStrike: errors.newStrike?.message
      }
    }
  )
  const dte = (date: string): number | null => computeDteFromInput(date, parseISO(today))

  return (
    <form onSubmit={onSubmit} noValidate className="flex h-full min-h-0 flex-1 flex-col">
      <SheetHeader
        eyebrow="ROLL LEAPS"
        title="Roll LEAPS Call"
        subtitle={`${ticker} CALL ${fmtMoney(leaps.strike)} · exp ${leaps.expiration} · ${leapsDte} DTE`}
        onClose={onClose}
      />
      <SheetBody>
        <SectionCard header="Coverage" headerVariant="emphasized">
          <PmccCoverageRuler
            today={today}
            {...leapsRollCoverage({
              today,
              openShortExpiration: openShort?.expiration ?? null,
              currentExpiration: leaps.expiration,
              replacementExpiration: newExpiration
            })}
          />
        </SectionCard>

        <SectionCard header="Current LEAPS">
          <div className="flex flex-col gap-2 px-4 py-3">
            <SummaryRow label="Contract" value={`${ticker} ${fmtMoney(leaps.strike)} CALL`} />
            <SummaryRow label="Expiration" value={`${leaps.expiration} (${leapsDte} DTE)`} />
            <SummaryRow label="Bought at" value={`${fmtMoney(leaps.premiumPerContract)} / share`} />
            <SummaryRow
              label="LEAPS cost to date"
              value={`${fmtMoney(ledger.leapsCostPerShare)} / share`}
            />
            <SummaryRow label="Cost basis" value={`${fmtMoney(ledger.basisPerShare)} / share`} />
            <SummaryRow
              label="Effective share cost"
              value={fmtMoney(ledger.effectiveShareCost)}
              highlight
            />
            <p className="text-[11px] leading-relaxed text-wb-text-muted">
              What shares would cost you through the LEAPS — the {fmtMoney(leaps.strike)} strike
              plus {fmtMoney(ledger.basisPerShare)} of basis. Re-anchors to the replacement strike
              after this roll.
            </p>
          </div>
        </SectionCard>

        <SectionCard header="Open short call">
          <div className="flex flex-col gap-2 px-4 py-3">
            {openShort ? (
              <>
                <SummaryRow
                  label="Contract"
                  value={`${ticker} ${fmtMoney(openShort.strike)} CALL`}
                />
                <SummaryRow
                  label="Expiration"
                  value={`${openShort.expiration} (${dte(openShort.expiration)} DTE)`}
                />
                <SummaryRow
                  label="Sold at"
                  value={`${fmtMoney(openShort.premiumPerContract)} / share`}
                />
                <p className="text-[11px] leading-relaxed text-wb-text-muted">
                  Read-only. The replacement LEAPS must expire after it and strike below it.
                </p>
              </>
            ) : (
              <p className="text-[11px] leading-relaxed text-wb-text-secondary">
                No short call open — nothing to cover, so the expiration and strike checks are
                skipped.
              </p>
            )}
          </div>
        </SectionCard>

        <RollPmccLeapsFields contracts={leaps.contracts} replacementDte={fieldDte} />

        <RollPmccLeapsNetPreview
          net={net}
          postRoll={postRoll}
          label={label}
          newStrike={newStrike}
          currentStrike={leaps.strike}
          ledger={ledger}
        />
        {shortfall && openShort && postRoll ? (
          <AlertBox variant="warning" data-testid="pmcc-leaps-roll-warning">
            Open short strike {fmtMoney(openShort.strike)} is below your effective share cost of{' '}
            {fmtMoney(postRoll.effectiveAfter)} after this roll. If assigned, covering from the
            LEAPS realizes roughly {fmtMoney(shortfall)} per share of loss.
          </AlertBox>
        ) : null}
        {coverageChange !== null && coverageChange < 0 ? (
          <AlertBox variant="info" data-testid="pmcc-leaps-roll-coverage-note">
            Replacement LEAPS is {replacementDte} DTE, {-coverageChange} days shorter than the
            current LEAPS.{openShort ? ' It still covers the open short call.' : ''}
          </AlertBox>
        ) : null}
        {errors.__roll__ ? (
          <AlertBox variant="error" data-testid="pmcc-leaps-roll-no-change">
            {errors.__roll__.message}
          </AlertBox>
        ) : null}
        {errors.root?.save ? (
          <AlertBox variant="error" data-testid="pmcc-leaps-roll-save-error">
            {errors.root.save.message}
          </AlertBox>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <div className="flex w-full flex-col gap-2">
          {leavesLeapsOpen ? (
            <p className="text-[11px] leading-relaxed text-wb-red">
              The {ticker} {fmtMoney(leaps.strike)} LEAPS stays open at {leaps.expiration}. No close
              or replacement leg is recorded.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormButton label="Cancel" variant="secondary" onClick={onClose} />
            <FormButton
              label="Confirm roll"
              pendingLabel="Recording…"
              isPending={isPending}
              disabled={!valid}
              data-testid="pmcc-leaps-roll-confirm"
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
