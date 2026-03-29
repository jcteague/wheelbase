import type { WheelPhase } from '../../../main/core/types'
import { PhaseBadge } from './PhaseBadge'
import { MONO } from '../lib/tokens'

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 12px',
  borderRadius: 4,
  fontSize: '0.7rem',
  fontWeight: 500,
  fontFamily: MONO,
  color: 'var(--wb-teal)',
  cursor: 'pointer'
}

type PositionDetailActionsProps = {
  phase: WheelPhase
  hasCostBasis: boolean
  onOpenCc: () => void
  onRecordAssignment: () => void
  onRecordExpiration: () => void
  onCloseCcEarly: () => void
  onRecordCallAway: () => void
}

type ActionButtonProps = {
  testId: string
  label: string
  onClick: () => void
}

function ActionButton({ testId, label, onClick }: ActionButtonProps): React.JSX.Element {
  return (
    <button
      data-testid={testId}
      className="wb-teal-button"
      onClick={onClick}
      style={actionButtonStyle}
    >
      {label}
    </button>
  )
}

export function PositionDetailActions({
  phase,
  hasCostBasis,
  onOpenCc,
  onRecordAssignment,
  onRecordExpiration,
  onCloseCcEarly,
  onRecordCallAway
}: PositionDetailActionsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <PhaseBadge phase={phase} />
      {phase === 'CC_OPEN' && (
        <>
          <ActionButton
            testId="close-cc-early-btn"
            label="Close CC Early →"
            onClick={onCloseCcEarly}
          />
          <ActionButton
            testId="record-call-away-btn"
            label="Record Call-Away →"
            onClick={onRecordCallAway}
          />
        </>
      )}
      {phase === 'HOLDING_SHARES' && hasCostBasis && (
        <ActionButton
          testId="open-covered-call-btn"
          label="Open Covered Call →"
          onClick={onOpenCc}
        />
      )}
      {phase === 'CSP_OPEN' && (
        <>
          <ActionButton
            testId="record-assignment-btn"
            label="Record Assignment →"
            onClick={onRecordAssignment}
          />
          <ActionButton
            testId="record-expiration-btn"
            label="Record Expiration →"
            onClick={onRecordExpiration}
          />
        </>
      )}
    </div>
  )
}
