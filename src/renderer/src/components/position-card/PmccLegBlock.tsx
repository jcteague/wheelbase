// One leg of the PMCC card [US-108]: an open leg with its DTE emphasis, mark and trailing cue,
// or a closed / neutral card's dashed leg.

import type { PnlTone } from '../../lib/wheel-card-display'
import type { DashedLeg, LeapsTrailing, OpenLeg, ShortTrailing } from '../../lib/pmcc-card-display'
import { TargetBadge } from '../TargetBadge'
import { LegBlock } from './LegBlock'
import { OptionMarkText } from './OptionMarkText'
import { SUB } from './styles'

const SHORT_TONE_CLASS: Record<PnlTone | 'flat', string> = {
  gain: 'text-wb-green',
  loss: 'text-wb-red',
  flat: 'text-wb-text-secondary'
}

function LeapsTrailingText({ trailing }: { trailing: LeapsTrailing }): React.JSX.Element {
  return (
    <span className={`${SUB} ml-[7px]`}>
      Δ {trailing.delta} · {trailing.debit} debit
    </span>
  )
}

function ShortTrailingCue({ trailing }: { trailing: ShortTrailing }): React.JSX.Element {
  if (trailing === 'unavailable') return <span className={`${SUB} ml-[7px]`}>—</span>
  return (
    <span className="ml-[7px] inline-flex items-center gap-[7px]">
      <span className={SHORT_TONE_CLASS[trailing.tone]}>{trailing.percentOfMax}</span>
      {trailing.target && <TargetBadge targetReached {...trailing.target} />}
    </span>
  )
}

function LegTitle({ leg }: { leg: OpenLeg | DashedLeg }): React.JSX.Element {
  return (
    <>
      {leg.title}
      {leg.contractsSuffix}
      <span className={SUB}> · {leg.expiration}</span>
    </>
  )
}

export function PmccOpenLegBlock({ leg }: { leg: OpenLeg }): React.JSX.Element {
  return (
    <LegBlock
      tag={leg.tag}
      actions={leg.actions}
      title={<LegTitle leg={leg} />}
      dte={
        <span
          title={leg.dteTooltip ?? undefined}
          className={leg.dteGold ? 'font-semibold text-wb-gold' : 'text-wb-text-secondary'}
        >
          {leg.dte}
        </span>
      }
      mark={<OptionMarkText mark={leg.mark} testId="leg-mark" unavailableLabel="— unavail." />}
      trailing={
        leg.tag === 'L' ? (
          <LeapsTrailingText trailing={leg.trailing} />
        ) : (
          <ShortTrailingCue trailing={leg.trailing} />
        )
      }
    />
  )
}

export function PmccDashedLegBlock({ leg }: { leg: DashedLeg }): React.JSX.Element {
  return (
    <LegBlock
      tag={leg.tag}
      title={<LegTitle leg={leg} />}
      dte={<span className="text-wb-text-muted">{leg.dte}</span>}
      mark={
        <span data-testid="leg-mark" className="text-wb-text-muted">
          {leg.mark}
        </span>
      }
    />
  )
}
