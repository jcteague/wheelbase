import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AssignCspResponse } from '../api/positions'
import { fmtDate, fmtMoney } from '../lib/format'
import { MONO } from '../lib/tokens'
import { useAssignPosition } from '../hooks/useAssignPosition'
import { AlertBox } from './ui/AlertBox'
import { Badge } from './ui/Badge'
import { Caption } from './ui/Caption'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { DatePicker } from '@/components/ui/date-picker'

const SIDEBAR_WIDTH = 200

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
  const todayIso = new Date().toISOString().slice(0, 10)
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

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    left: SIDEBAR_WIDTH,
    zIndex: 50
  }
  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 400,
    background: 'var(--wb-bg-surface)',
    borderLeft: '1px solid var(--wb-border)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: MONO,
    boxShadow: '-12px 0 48px rgba(0,0,0,0.5)'
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
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <AssignmentHeader
        eyebrow="Record Assignment"
        title="Assign CSP to Shares"
        subtitle={`PUT ${fmtMoney(props.strike)} · ${props.expiration}`}
        onClose={props.onClose}
      />
      <div
        style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flex: 1
        }}
      >
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
        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> The position will transition to Holding Shares.
          Full leg history is preserved.
        </AlertBox>
        {isError && (
          <ErrorAlert>
            {String(
              (error.body as { detail?: Array<{ message: string }> })?.detail?.[0]?.message ??
                'Assignment failed'
            )}
          </ErrorAlert>
        )}
      </div>
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--wb-border)',
          display: 'flex',
          gap: 10
        }}
      >
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
      </div>
    </div>
  )

  return createPortal(
    <div style={overlayStyle}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={props.onClose} />
      <div style={panelStyle}>{content}</div>
    </div>,
    document.body
  )
}

function AssignmentHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  eyebrowColor
}: {
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  eyebrowColor?: string
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '20px 24px 18px',
        borderBottom: '1px solid var(--wb-border)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12
      }}
    >
      <div>
        <Caption>{eyebrow}</Caption>
        <div
          style={{ fontSize: 17, fontWeight: 700, color: 'var(--wb-text-primary)', marginTop: 6 }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: 'var(--wb-text-secondary)', marginTop: 4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Close assignment sheet"
        onClick={onClose}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid var(--wb-border)',
          background: 'var(--wb-bg-elevated)',
          color: eyebrowColor ?? 'var(--wb-text-muted)',
          cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
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
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(30,42,56,0.5)'
  }
  return (
    <SectionCard>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            ['Position', ticker],
            ['Contracts', String(contracts)],
            ['Shares to receive', String(sharesHeld)]
          ].map(([label, value]) => (
            <div
              key={label}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
            >
              <span style={{ color: 'var(--wb-text-secondary)' }}>{label}</span>
              <span
                style={{
                  color:
                    label === 'Shares to receive' ? 'var(--wb-gold)' : 'var(--wb-text-primary)',
                  fontWeight: 600
                }}
              >
                {value}
              </span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Phase transition</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge>CSP_OPEN</Badge>
              <span style={{ color: 'var(--wb-text-muted)' }}>→</span>
              <Badge color="var(--wb-sky)">HOLDING_SHARES</Badge>
            </div>
          </div>
        </div>
        <div
          style={{
            background: 'var(--wb-bg-elevated)',
            border: '1px solid var(--wb-border)',
            borderRadius: 8,
            overflow: 'hidden'
          }}
        >
          <div style={rowStyle}>
            <span style={{ color: 'var(--wb-text-secondary)' }}>Assignment strike</span>
            <span style={{ color: 'var(--wb-text-primary)' }}>{fmtMoney(strike)}</span>
          </div>
          {premiumWaterfall.map((line) => (
            <div key={`${line.label}-${line.amount}`} style={rowStyle}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>− {line.label}</span>
              <span style={{ color: 'var(--wb-green)' }}>{fmtMoney(line.amount)}</span>
            </div>
          ))}
          <div style={{ ...rowStyle, borderBottom: 'none', fontWeight: 700 }}>
            <span style={{ color: 'var(--wb-gold)' }}>= Effective cost basis</span>
            <span style={{ color: 'var(--wb-gold)' }}>{fmtMoney(projectedBasisPerShare)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--wb-text-secondary)' }}>
            per share · {sharesHeld} shares total
          </span>
          <span style={{ color: 'var(--wb-text-primary)', fontWeight: 600 }}>
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
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
      <AssignmentHeader
        eyebrow="Complete"
        title={`${ticker} Assigned`}
        onClose={onClose}
        eyebrowColor="var(--wb-gold)"
      />
      <div
        style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flex: 1
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, var(--wb-gold-dim), rgba(7,10,14,0.4))',
            border: '1px solid rgba(230,168,23,0.22)',
            borderRadius: 10,
            padding: 22
          }}
        >
          <div
            style={{
              color: 'var(--wb-gold)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 8
            }}
          >
            Holding Shares
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--wb-text-primary)',
              marginBottom: 8
            }}
          >
            HOLDING {sharesHeld} SHARES
          </div>
          <div style={{ color: 'var(--wb-text-secondary)', fontSize: 12, marginBottom: 12 }}>
            {ticker} · {contracts} contract assigned at {fmtMoney(strike)}
          </div>
          <Badge color="var(--wb-gold)">
            Effective Cost Basis {fmtMoney(basisPerShare)} per share
          </Badge>
        </div>
        <SectionCard>
          <div style={{ padding: 16, display: 'grid', gap: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>Leg recorded</span>
              <span style={{ color: 'var(--wb-gold)' }}>assign · {fmtDate(assignmentDate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>Phase</span>
              <Badge color="var(--wb-sky)">HOLDING_SHARES</Badge>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>Shares held</span>
              <span style={{ color: 'var(--wb-gold)' }}>{sharesHeld}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>Cost basis</span>
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
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--wb-text-secondary)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: MONO
          }}
        >
          View full position history
        </button>
      </div>
    </div>
  )
}
