import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AssignCspResponse } from '../api/positions'
import { localToday } from '../lib/dates'
import { fmtDate, fmtMoney } from '../lib/format'
import { PHASE_LABEL } from '../lib/phase'
import { getSheetPortal } from '../lib/portal'
import { useAssignPosition } from '../hooks/useAssignPosition'
import { AlertBox } from './ui/AlertBox'
import { Badge } from './ui/Badge'
import { Caption } from './ui/Caption'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetOverlay, SheetPanel, SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'
import { DatePicker } from '@/components/ui/date-picker'

export interface AssignmentSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string
  contracts: number
  openFillDate: string
  premiumWaterfall: Array<{ label: string; amount: string }>
  projectedBasisPerShare: string
  onClose: () => void
  onOpenCoveredCall: (ctx: {
    basisPerShare: string
    totalPremiumCollected: string
    contracts: number
    assignmentDate: string
  }) => void
}

export function AssignmentSheet(props: AssignmentSheetProps): React.JSX.Element | null {
  const [assignmentDate, setAssignmentDate] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<AssignCspResponse | null>(null)
  const { mutate, isPending, isError, error } = useAssignPosition({ onSuccess: setSuccessState })

  const sharesHeld = props.contracts * 100
  const todayIso = localToday()
  const isFutureDate = assignmentDate > todayIso
  const totalBasis = useMemo(
    () => new Decimal(props.projectedBasisPerShare).times(sharesHeld).toFixed(4),
    [props.projectedBasisPerShare, sharesHeld]
  )

  if (!props.open) return null

  const handleSubmit = (): void => {
    if (!assignmentDate) {
      setDateError('Assignment date is required')
      return
    }
    if (assignmentDate < props.openFillDate) {
      setDateError('Assignment date cannot be before the CSP open date')
      return
    }
    setDateError(null)
    mutate({ position_id: props.positionId, assignment_date: assignmentDate })
  }

  const content = successState ? (
    <AssignmentSuccess
      ticker={props.ticker}
      strike={props.strike}
      contracts={props.contracts}
      sharesHeld={sharesHeld}
      assignmentDate={successState.leg.fillDate}
      basisPerShare={successState.costBasisSnapshot.basisPerShare}
      onOpenCoveredCall={() =>
        props.onOpenCoveredCall({
          basisPerShare: successState.costBasisSnapshot.basisPerShare,
          totalPremiumCollected: successState.costBasisSnapshot.totalPremiumCollected,
          contracts: props.contracts,
          assignmentDate: successState.leg.fillDate
        })
      }
      onClose={props.onClose}
    />
  ) : (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SheetHeader
        eyebrow="Record Assignment"
        title="Assign CSP to Shares"
        subtitle={`PUT ${fmtMoney(props.strike)} · ${props.expiration}`}
        onClose={props.onClose}
      />
      <SheetBody>
        <AssignmentSummary
          ticker={props.ticker}
          contracts={props.contracts}
          sharesHeld={sharesHeld}
          strike={props.strike}
          premiumWaterfall={props.premiumWaterfall}
          projectedBasisPerShare={props.projectedBasisPerShare}
          totalBasis={totalBasis}
        />
        <Field
          label="Assignment Date"
          htmlFor="assignment-date"
          error={dateError ?? undefined}
          hint="The date your broker assigned the shares (typically expiration date)"
        >
          <DatePicker
            id="assignment-date"
            aria-label="Assignment Date"
            value={assignmentDate}
            hasError={Boolean(dateError)}
            onChange={(value) => {
              setAssignmentDate(value)
              setDateError(null)
            }}
          />
        </Field>
        {isFutureDate && (
          <AlertBox variant="warning">This date is in the future — are you sure?</AlertBox>
        )}
        <div className="bg-wb-gold-dim border border-wb-gold-border rounded-md p-3 text-xs text-wb-gold leading-relaxed">
          <strong>This cannot be undone.</strong> The position will transition to{' '}
          {PHASE_LABEL.HOLDING_SHARES}. Full leg history is preserved.
        </div>
        {isError && (
          <ErrorAlert>
            {String(
              (error.body as { detail?: Array<{ message: string }> })?.detail?.[0]?.message ??
                'Assignment failed'
            )}
          </ErrorAlert>
        )}
      </SheetBody>
      <SheetFooter>
        <FormButton
          label="Cancel"
          variant="secondary"
          onClick={props.onClose}
          style={{ flex: 1 }}
        />
        <FormButton
          label="Confirm Assignment"
          pendingLabel="Confirming…"
          isPending={isPending}
          onClick={handleSubmit}
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </div>
  )

  return createPortal(
    <SheetOverlay onClose={props.onClose}>
      <SheetPanel>{content}</SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}

function AssignmentSummary({
  ticker,
  contracts,
  sharesHeld,
  strike,
  premiumWaterfall,
  projectedBasisPerShare,
  totalBasis
}: {
  ticker: string
  contracts: number
  sharesHeld: number
  strike: string
  premiumWaterfall: Array<{ label: string; amount: string }>
  projectedBasisPerShare: string
  totalBasis: string
}): React.JSX.Element {
  return (
    <SectionCard>
      <div className="p-4 flex flex-col gap-3.5">
        <div className="grid gap-2.5">
          {[
            ['Position', ticker],
            ['Contracts', String(contracts)],
            ['Shares to receive', String(sharesHeld)]
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-wb-text-secondary">{label}</span>
              <span
                className={[
                  'font-semibold',
                  label === 'Shares to receive' ? 'text-wb-gold' : 'text-wb-text-primary'
                ].join(' ')}
              >
                {value}
              </span>
            </div>
          ))}
          <div className="bg-wb-gold-dim rounded-md p-2 flex justify-between items-center text-xs">
            <span className="text-wb-text-secondary">Phase transition</span>
            <div className="flex items-center gap-2">
              <Badge>{PHASE_LABEL.CSP_OPEN}</Badge>
              <span className="text-wb-text-muted">→</span>
              <Badge color="var(--wb-sky)">{PHASE_LABEL.HOLDING_SHARES}</Badge>
            </div>
          </div>
        </div>
        <div className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden">
          <div className="flex justify-between px-3.5 py-2.5 border-b border-wb-border-subtle">
            <span className="text-wb-text-secondary">Assignment strike</span>
            <span className="text-wb-text-primary">{fmtMoney(strike)}</span>
          </div>
          {premiumWaterfall.map((line) => (
            <div
              key={`${line.label}-${line.amount}`}
              className="flex justify-between px-3.5 py-2.5 border-b border-wb-border-subtle"
            >
              <span className="text-wb-text-secondary">− {line.label}</span>
              <span className="text-wb-green">{fmtMoney(line.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between px-3.5 py-2.5 font-bold">
            <span className="text-wb-gold">= Effective cost basis</span>
            <span className="text-wb-gold">{fmtMoney(projectedBasisPerShare)}</span>
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-wb-text-secondary">per share · {sharesHeld} shares total</span>
          <span className="text-wb-text-primary font-semibold">
            {fmtMoney(totalBasis)} total basis
          </span>
        </div>
      </div>
    </SectionCard>
  )
}

function AssignmentSuccess({
  ticker,
  strike,
  contracts,
  sharesHeld,
  assignmentDate,
  basisPerShare,
  onOpenCoveredCall,
  onClose
}: {
  ticker: string
  strike: string
  contracts: number
  sharesHeld: number
  assignmentDate: string
  basisPerShare: string
  onOpenCoveredCall: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SheetHeader
        eyebrow="Complete"
        title={`${ticker} Assigned`}
        onClose={onClose}
        eyebrowColor="var(--wb-gold)"
        borderBottomColor="rgba(230,168,23,0.2)"
      />
      <SheetBody>
        <div
          style={{
            background: 'linear-gradient(135deg, var(--wb-gold-dim), rgba(7,10,14,0.4))',
            border: '1px solid rgba(230,168,23,0.22)',
            borderRadius: 10,
            padding: 22
          }}
        >
          <div className="text-wb-gold text-[10px] tracking-[0.18em] uppercase mb-2">
            {PHASE_LABEL.HOLDING_SHARES}
          </div>
          <div className="text-[28px] font-bold text-wb-text-primary mb-2">
            HOLDING {sharesHeld} SHARES
          </div>
          <div className="text-wb-text-secondary text-xs mb-3">
            {ticker} · {contracts} contract assigned at {fmtMoney(strike)}
          </div>
          <Badge color="var(--wb-gold)">
            Effective Cost Basis {fmtMoney(basisPerShare)} per share
          </Badge>
        </div>
        <SectionCard>
          <div className="p-4 grid gap-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-wb-text-secondary">Leg recorded</span>
              <span className="text-wb-gold">assign · {fmtDate(assignmentDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-wb-text-secondary">Phase</span>
              <Badge color="var(--wb-sky)">{PHASE_LABEL.HOLDING_SHARES}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-wb-text-secondary">Shares held</span>
              <span className="text-wb-gold">{sharesHeld}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-wb-text-secondary">Cost basis</span>
              <span>{fmtMoney(basisPerShare)} / share</span>
            </div>
          </div>
        </SectionCard>
        <AlertBox variant="info">
          💡 Many traders wait <strong>1–3 days</strong> for a bounce before selling the first
          covered call — avoid locking in a low strike right after assignment.
        </AlertBox>
        <Caption>What&apos;s next?</Caption>
        <FormButton
          label={`Open Covered Call on ${ticker} →`}
          onClick={onOpenCoveredCall}
          style={{ width: '100%' }}
        />
        <button
          type="button"
          onClick={onClose}
          className="font-wb-mono text-wb-text-secondary underline cursor-pointer border-none bg-transparent"
        >
          View full position history
        </button>
      </SheetBody>
    </div>
  )
}
