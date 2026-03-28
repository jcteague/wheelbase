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
  ccExpired: boolean
  onOpenCc: () => void
  onRecordAssignment: () => void
  onRecordExpiration: () => void
  onCloseCcEarly: () => void
  onRecordCcExpiration: () => void
}

export function PositionDetailActions({
  phase,
  hasCostBasis,
  ccExpired,
  onOpenCc,
  onRecordAssignment,
  onRecordExpiration,
  onCloseCcEarly,
  onRecordCcExpiration
}: PositionDetailActionsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <PhaseBadge phase={phase} />
      {phase === 'CC_OPEN' && (
        <button
          data-testid="close-cc-early-btn"
          className="wb-teal-button"
          onClick={onCloseCcEarly}
          style={actionButtonStyle}
        >
          Close CC Early →
        </button>
      )}
      {phase === 'CC_OPEN' && ccExpired && (
        <button
          data-testid="record-cc-expiration-btn"
          className="wb-teal-button"
          onClick={onRecordCcExpiration}
          style={actionButtonStyle}
        >
          Record Expiration →
        </button>
      )}
      {phase === 'HOLDING_SHARES' && hasCostBasis && (
        <button
          data-testid="open-covered-call-btn"
          className="wb-teal-button"
          onClick={onOpenCc}
          style={actionButtonStyle}
        >
          Open Covered Call →
        </button>
      )}
      {phase === 'CSP_OPEN' && (
        <>
          <button
            data-testid="record-assignment-btn"
            className="wb-teal-button"
            onClick={onRecordAssignment}
            style={actionButtonStyle}
          >
            Record Assignment →
          </button>
          <button
            data-testid="record-expiration-btn"
            className="wb-teal-button"
            onClick={onRecordExpiration}
            style={actionButtonStyle}
          >
            Record Expiration →
          </button>
        </>
      )}
    </div>
  )
}
