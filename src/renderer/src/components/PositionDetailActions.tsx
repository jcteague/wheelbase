import type { StrategyType, WheelPhase } from '../../../main/core/types'
import { pmccCoverageLabel, type PmccCoverageCounts } from '../lib/pmcc-coverage'
import { PhaseBadge } from './PhaseBadge'

type PositionDetailActionsProps = {
  strategyType: StrategyType
  phase: WheelPhase
  /** The PMCC's open legs; `null` with no open LEAPS. The badge and every PMCC action read it. */
  pmccCoverage: PmccCoverageCounts | null
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
  onRollPmccShort: () => void
  onRollPmccLeaps: () => void
  onSellPmccShort: () => void
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
  strategyType,
  phase,
  pmccCoverage,
  hasCostBasis,
  ccExpired,
  onOpenCc,
  onRollCc,
  onCloseCcEarly,
  onRecordCallAway,
  onRecordCcExpiration,
  onRollCsp,
  onRecordAssignment,
  onRecordExpiration,
  onRollPmccShort,
  onRollPmccLeaps,
  onSellPmccShort
}: PositionDetailActionsProps): React.JSX.Element {
  const openPmcc = strategyType === 'PMCC' && phase === 'PMCC_OPEN'
  const hasOpenLeaps = pmccCoverage !== null
  const hasOpenShortCall = (pmccCoverage?.shortContracts.length ?? 0) > 0
  // An open PMCC's badge reads its coverage from the open legs; every other phase keeps
  // PHASE_LABEL (the positions list still reads PHASE_LABEL.PMCC_OPEN).
  const coverageLabel = openPmcc && pmccCoverage ? pmccCoverageLabel(pmccCoverage) : undefined
  return (
    <div className="flex items-center gap-2.5">
      <PhaseBadge phase={phase} label={coverageLabel} />
      <div className="w-px h-4 bg-wb-border mx-1" />
      {openPmcc && hasOpenLeaps && !hasOpenShortCall && (
        <ActionButton
          testId="sell-pmcc-short-btn"
          label="Sell Short Call →"
          onClick={onSellPmccShort}
        />
      )}
      {strategyType === 'PMCC' && hasOpenShortCall && (
        <ActionButton
          testId="roll-pmcc-short-btn"
          label="Roll Short Call →"
          onClick={onRollPmccShort}
        />
      )}
      {strategyType === 'PMCC' && hasOpenLeaps && (
        <ActionButton testId="roll-pmcc-leaps-btn" label="Roll LEAPS →" onClick={onRollPmccLeaps} />
      )}
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
