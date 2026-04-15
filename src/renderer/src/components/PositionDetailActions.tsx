import type { WheelPhase } from '../../../main/core/types'
import { PhaseBadge } from './PhaseBadge'

type PositionDetailActionsProps = {
  phase: WheelPhase
  hasCostBasis: boolean
  ccExpired: boolean
  onOpenCc: () => void
  onRollCc: () => void
  onCloseCcEarly: () => void
  onRecordCallAway: () => void
  onRecordCcExpiration: () => void
  onRollCsp: () => void
  onRecordAssignment: () => void
  onRecordExpiration: () => void
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
      className="wb-teal-button inline-flex items-center gap-1 px-3 py-1 rounded text-[0.7rem] font-medium font-wb-mono text-wb-teal cursor-pointer focus:outline-none focus-visible:outline-none"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function PositionDetailActions({
  phase,
  hasCostBasis,
  ccExpired,
  onOpenCc,
  onRollCc,
  onCloseCcEarly,
  onRecordCallAway,
  onRecordCcExpiration,
  onRollCsp,
  onRecordAssignment,
  onRecordExpiration
}: PositionDetailActionsProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <PhaseBadge phase={phase} />
      <div className="w-px h-4 bg-wb-border mx-1" />
      {phase === 'CC_OPEN' && (
        <>
          <ActionButton testId="roll-cc-btn" label="Roll CC →" onClick={onRollCc} />
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
      {phase === 'CC_OPEN' && ccExpired && (
        <ActionButton
          testId="record-cc-expiration-btn"
          label="Record Expiration →"
          onClick={onRecordCcExpiration}
        />
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
          <ActionButton testId="roll-csp-btn" label="Roll CSP →" onClick={onRollCsp} />
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
